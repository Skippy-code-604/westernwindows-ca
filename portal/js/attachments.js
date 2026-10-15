// ---- Attachment Manager for PO Quote Files ----
// Uses Firebase Storage (client-side) + API for metadata persistence

import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js';
import { getStorage, ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-storage.js';

const firebaseConfig = {
    projectId: "western-windows-ca",
    appId: "1:753317905180:web:e2c0313352cb0e025ff0d9",
    storageBucket: "western-windows-ca.firebasestorage.app",
    apiKey: "AIzaSyD8gtXc380asHo3E2K95ZFxDu1-NjJSRlE",
    authDomain: "western-windows-ca.firebaseapp.com",
    messagingSenderId: "753317905180",
};

// Reuse existing app if already initialized, otherwise init
let app;
try {
    const { getApp } = await import('https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js');
    app = getApp();
} catch {
    app = initializeApp(firebaseConfig);
}
const storage = getStorage(app);

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];

// In-memory attachment state
const attachments = [];

// ---- Public API exposed to form.js ----

window.attachmentManager = {
    // Get all current attachments (for saving to API)
    getAttachments() {
        return [...attachments];
    },

    // Load existing attachments when editing a document
    loadExisting(existingAttachments) {
        attachments.length = 0;
        if (Array.isArray(existingAttachments)) {
            existingAttachments.forEach(a => attachments.push(a));
        }
        renderAttachmentList();
    },

    // Upload files for a specific document ID
    async uploadFiles(files, docId) {
        const dropzone = document.getElementById('attachment-dropzone');
        const uploading = document.getElementById('attachment-uploading');
        const progressFill = document.getElementById('attachment-progress-fill');
        const progressText = document.getElementById('attachment-progress-text');

        if (!files || files.length === 0) return [];

        // Validate files
        const validFiles = [];
        for (const file of files) {
            if (file.size > MAX_FILE_SIZE) {
                showToast(`${file.name} exceeds 10 MB limit`, 'error');
                continue;
            }
            if (!ALLOWED_TYPES.includes(file.type)) {
                showToast(`${file.name} — unsupported file type`, 'error');
                continue;
            }
            validFiles.push(file);
        }

        if (validFiles.length === 0) return [];

        // Show progress
        if (dropzone) dropzone.style.display = 'none';
        if (uploading) uploading.style.display = 'flex';

        const uploaded = [];
        for (let i = 0; i < validFiles.length; i++) {
            const file = validFiles[i];
            if (progressText) progressText.textContent = `Uploading ${i + 1} of ${validFiles.length}...`;

            try {
                const result = await uploadSingleFile(file, docId, (progress) => {
                    const overall = ((i + progress) / validFiles.length) * 100;
                    if (progressFill) progressFill.style.width = `${overall}%`;
                });
                attachments.push(result);
                uploaded.push(result);
            } catch (err) {
                console.error('Upload error:', err);
                showToast(`Failed to upload ${file.name}`, 'error');
            }
        }

        // Hide progress, show dropzone
        if (uploading) uploading.style.display = 'none';
        if (dropzone) dropzone.style.display = 'flex';
        if (progressFill) progressFill.style.width = '0%';

        renderAttachmentList();

        if (uploaded.length > 0) {
            showToast(`${uploaded.length} file${uploaded.length > 1 ? 's' : ''} attached`, 'success');
        }

        return uploaded;
    },

    // Remove an attachment by index
    async removeAttachment(index) {
        const att = attachments[index];
        if (!att) return;

        try {
            // Delete from Storage
            const fileRef = ref(storage, att.storagePath);
            await deleteObject(fileRef);
        } catch (err) {
            console.warn('Could not delete from storage (may already be removed):', err.message);
        }

        attachments.splice(index, 1);
        renderAttachmentList();
        showToast('Attachment removed', 'info');
    },
};

// ---- Internal helpers ----

async function uploadSingleFile(file, docId, onProgress) {
    const timestamp = Date.now();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storagePath = `documents/${docId}/attachments/${timestamp}_${safeName}`;
    const fileRef = ref(storage, storagePath);

    return new Promise((resolve, reject) => {
        const uploadTask = uploadBytesResumable(fileRef, file, {
            contentType: file.type,
            customMetadata: { originalName: file.name },
        });

        uploadTask.on('state_changed',
            (snapshot) => {
                const progress = snapshot.bytesTransferred / snapshot.totalBytes;
                if (onProgress) onProgress(progress);
            },
            (error) => reject(error),
            async () => {
                const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
                resolve({
                    name: file.name,
                    size: file.size,
                    type: file.type,
                    storagePath,
                    url: downloadURL,
                    uploadedAt: new Date().toISOString(),
                });
            }
        );
    });
}

function renderAttachmentList() {
    const container = document.getElementById('attachment-list');
    if (!container) return;

    if (attachments.length === 0) {
        container.innerHTML = '';
        return;
    }

    container.innerHTML = attachments.map((att, idx) => {
        const sizeKB = (att.size / 1024).toFixed(0);
        const sizeStr = att.size > 1024 * 1024
            ? `${(att.size / (1024 * 1024)).toFixed(1)} MB`
            : `${sizeKB} KB`;
        const icon = att.type === 'application/pdf' ? '📄' : '🖼️';

        return `
            <div class="attachment-item" data-index="${idx}">
                <div class="attachment-item-info">
                    <span class="attachment-item-icon">${icon}</span>
                    <a href="${esc(att.url)}" target="_blank" rel="noopener noreferrer" class="attachment-item-name">${esc(att.name)}</a>
                    <span class="attachment-item-size">${sizeStr}</span>
                </div>
                <button type="button" class="attachment-item-remove" data-remove="${idx}" title="Remove attachment">✕</button>
            </div>
        `;
    }).join('');

    // Bind remove buttons
    container.querySelectorAll('.attachment-item-remove').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const idx = parseInt(btn.dataset.remove);
            window.attachmentManager.removeAttachment(idx);
        });
    });
}

// ---- Wire up drag-drop and click-to-browse ----
// NOTE: This runs as a module with top-level await, so DOMContentLoaded
// has already fired by the time we get here. We init immediately instead.

// Prevent browser from opening dropped files anywhere on the page
document.addEventListener('dragover', (e) => e.preventDefault());
document.addEventListener('drop', (e) => e.preventDefault());

let dropzoneBound = false;

function initDropzone() {
    if (dropzoneBound) return;

    const dropzone = document.getElementById('attachment-dropzone');
    const fileInput = document.getElementById('attachment-input');

    if (!dropzone || !fileInput) return;

    dropzoneBound = true;

    // Click to browse
    dropzone.addEventListener('click', (e) => {
        e.stopPropagation();
        fileInput.click();
    });

    // File selected via browser dialog
    fileInput.addEventListener('change', () => {
        if (fileInput.files.length > 0) {
            queueFiles(fileInput.files);
            fileInput.value = ''; // Reset for re-selection
        }
    });

    // Drag events
    dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.add('attachment-dropzone-active');
    });

    dropzone.addEventListener('dragleave', (e) => {
        e.stopPropagation();
        dropzone.classList.remove('attachment-dropzone-active');
    });

    dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.remove('attachment-dropzone-active');
        if (e.dataTransfer.files.length > 0) {
            queueFiles(e.dataTransfer.files);
        }
    });

    console.log('[attachments] Dropzone initialized');
}

// Try to init immediately (works on form page where elements exist at load)
initDropzone();

// Also watch for elements appearing later (preview page shows section dynamically)
const observer = new MutationObserver(() => {
    if (!dropzoneBound) initDropzone();
});
observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class'] });

// Pending files that have been selected but not uploaded yet (need docId first)
const pendingFiles = [];

function queueFiles(fileList) {
    for (const file of fileList) {
        if (file.size > MAX_FILE_SIZE) {
            showToast(`${file.name} exceeds 10 MB limit`, 'error');
            continue;
        }
        if (!ALLOWED_TYPES.includes(file.type)) {
            showToast(`${file.name} — unsupported file type`, 'error');
            continue;
        }
        pendingFiles.push(file);
    }
    renderPendingFiles();
}

function renderPendingFiles() {
    const container = document.getElementById('attachment-list');
    if (!container) return;

    // Render both existing attachments and pending files
    let html = '';

    // Existing (already uploaded) attachments
    attachments.forEach((att, idx) => {
        const sizeKB = (att.size / 1024).toFixed(0);
        const sizeStr = att.size > 1024 * 1024
            ? `${(att.size / (1024 * 1024)).toFixed(1)} MB`
            : `${sizeKB} KB`;
        const icon = att.type === 'application/pdf' ? '📄' : '🖼️';

        html += `
            <div class="attachment-item" data-index="${idx}">
                <div class="attachment-item-info">
                    <span class="attachment-item-icon">${icon}</span>
                    <a href="${esc(att.url)}" target="_blank" rel="noopener noreferrer" class="attachment-item-name">${esc(att.name)}</a>
                    <span class="attachment-item-size">${sizeStr}</span>
                </div>
                <button type="button" class="attachment-item-remove" data-remove="${idx}" title="Remove attachment">✕</button>
            </div>
        `;
    });

    // Pending (not yet uploaded) files
    pendingFiles.forEach((file, idx) => {
        const sizeStr = file.size > 1024 * 1024
            ? `${(file.size / (1024 * 1024)).toFixed(1)} MB`
            : `${(file.size / 1024).toFixed(0)} KB`;
        const icon = file.type === 'application/pdf' ? '📄' : '🖼️';

        html += `
            <div class="attachment-item attachment-item-pending">
                <div class="attachment-item-info">
                    <span class="attachment-item-icon">${icon}</span>
                    <span class="attachment-item-name">${esc(file.name)}</span>
                    <span class="attachment-item-size">${sizeStr}</span>
                    <span class="badge badge-draft" style="margin-left:6px; font-size:0.65rem;">Pending</span>
                </div>
                <button type="button" class="attachment-pending-remove" data-pending="${idx}" title="Remove">✕</button>
            </div>
        `;
    });

    container.innerHTML = html;

    // Bind remove buttons for existing
    container.querySelectorAll('.attachment-item-remove').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const idx = parseInt(btn.dataset.remove);
            window.attachmentManager.removeAttachment(idx);
            renderPendingFiles(); // re-render combined list
        });
    });

    // Bind remove buttons for pending
    container.querySelectorAll('.attachment-pending-remove').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const idx = parseInt(btn.dataset.pending);
            pendingFiles.splice(idx, 1);
            renderPendingFiles();
        });
    });
}

// Expose pending files upload for form.js to call after save
window.attachmentManager.uploadPendingFiles = async function(docId) {
    if (pendingFiles.length === 0) return [];
    const files = [...pendingFiles];
    pendingFiles.length = 0;
    const result = await window.attachmentManager.uploadFiles(files, docId);
    return result;
};

window.attachmentManager.hasPendingFiles = function() {
    return pendingFiles.length > 0;
};
