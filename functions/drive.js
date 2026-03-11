/**
 * Google Drive integration for auto-filing PDFs.
 * Uses the Firebase service account to upload to a shared Drive folder.
 *
 * Folder structure:
 *   {Root} / {YYYY} / {Month} / {Project Name} / {doc_number} — {supplier}.pdf
 *
 * Uses @googleapis/drive (lightweight, ~5MB) instead of the monolithic
 * googleapis package (~170MB) to avoid Cloud Functions cold start timeouts.
 */

// Lazy-loaded to avoid cold start timeout
let driveClient = null;

const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
];

// In-memory cache: "parentId/folderName" -> folderId
const folderCache = new Map();

/**
 * Get an authenticated Google Drive client using a service account key
 * with domain-wide delegation (impersonating a workspace user).
 */
function getDrive() {
    if (driveClient) return driveClient;

    const { drive, auth } = require('@googleapis/drive');

    const saKeyJson = (process.env.DRIVE_SA_KEY || '').trim();
    const impersonateEmail = (process.env.DRIVE_IMPERSONATE_EMAIL || '').trim();

    if (!saKeyJson) {
        throw new Error('DRIVE_SA_KEY secret not configured');
    }

    const saKey = JSON.parse(saKeyJson);

    const jwtAuth = new auth.JWT({
        email: saKey.client_email,
        key: saKey.private_key,
        scopes: ['https://www.googleapis.com/auth/drive'],
        subject: impersonateEmail || undefined,
    });

    driveClient = drive({ version: 'v3', auth: jwtAuth });
    return driveClient;
}

/**
 * Find or create a subfolder inside a parent folder.
 * Results are cached in memory for the lifetime of the function instance.
 */
async function findOrCreateFolder(parentId, folderName) {
    const cacheKey = `${parentId}/${folderName}`;
    if (folderCache.has(cacheKey)) {
        return folderCache.get(cacheKey);
    }

    const drive = getDrive();

    // Search for existing folder
    const query = [
        `'${parentId}' in parents`,
        `name = '${folderName.replace(/'/g, "\\'")}'`,
        `mimeType = 'application/vnd.google-apps.folder'`,
        `trashed = false`,
    ].join(' and ');

    const res = await drive.files.list({
        q: query,
        fields: 'files(id, name)',
        pageSize: 1,
    });

    let folderId;
    if (res.data.files && res.data.files.length > 0) {
        folderId = res.data.files[0].id;
    } else {
        // Create the folder
        const createRes = await drive.files.create({
            requestBody: {
                name: folderName,
                mimeType: 'application/vnd.google-apps.folder',
                parents: [parentId],
            },
            fields: 'id',
        });
        folderId = createRes.data.id;
    }

    folderCache.set(cacheKey, folderId);
    return folderId;
}

/**
 * Build the folder path and return the target folder ID.
 * Creates folders as needed: Root / YYYY / Month / ProjectName
 */
async function getTargetFolderId(rootFolderId, doc) {
    const now = new Date();
    const year = String(now.getFullYear());
    const month = MONTH_NAMES[now.getMonth()];
    const projectName = (doc.project_name || doc.doc_number || 'Unsorted')
        .trim()
        .replace(/[/\\<>:"|?*]/g, '_'); // Sanitize for Drive

    // Chain: Root -> Year -> Month -> Project
    const yearFolder = await findOrCreateFolder(rootFolderId, year);
    const monthFolder = await findOrCreateFolder(yearFolder, month);
    const projectFolder = await findOrCreateFolder(monthFolder, projectName);

    return projectFolder;
}

/**
 * Upload a PDF buffer to Google Drive.
 * Returns the web view link for the uploaded file.
 */
async function uploadPDF(rootFolderId, doc, pdfBuffer) {
    if (!rootFolderId) {
        console.warn('DRIVE_ROOT_FOLDER_ID not set — skipping Drive upload');
        return null;
    }

    const drive = getDrive();
    const targetFolderId = await getTargetFolderId(rootFolderId, doc);

    // Build filename: "RFQ-2026-0001 — Gentek.pdf"
    const supplierName = (doc.supplier_name || 'Unknown')
        .replace(/[/\\<>:"|?*]/g, '_');
    const fileName = `${doc.doc_number} — ${supplierName}.pdf`;

    // Check if file already exists (avoid duplicates on re-send)
    const existingQuery = [
        `'${targetFolderId}' in parents`,
        `name = '${fileName.replace(/'/g, "\\'")}'`,
        `trashed = false`,
    ].join(' and ');

    const existing = await drive.files.list({
        q: existingQuery,
        fields: 'files(id)',
        pageSize: 1,
    });

    let fileId;
    const { Readable } = require('stream');

    if (existing.data.files && existing.data.files.length > 0) {
        // Update existing file
        fileId = existing.data.files[0].id;
        await drive.files.update({
            fileId,
            media: {
                mimeType: 'application/pdf',
                body: Readable.from(pdfBuffer),
            },
        });
    } else {
        // Create new file
        const createRes = await drive.files.create({
            requestBody: {
                name: fileName,
                parents: [targetFolderId],
            },
            media: {
                mimeType: 'application/pdf',
                body: Readable.from(pdfBuffer),
            },
            fields: 'id, webViewLink',
        });
        fileId = createRes.data.id;
    }

    // Get the web view link
    const fileMeta = await drive.files.get({
        fileId,
        fields: 'webViewLink',
    });

    return fileMeta.data.webViewLink;
}

module.exports = { uploadPDF };
