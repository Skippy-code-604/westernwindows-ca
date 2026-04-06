const express = require('express');
const router = express.Router();
const { requireAuth } = require('../auth');
const store = require('../firestore');

// Lazy-loaded to avoid cold start timeout
let nodemailer = null;
let pdfModule = null;
let driveModule = null;
function getNodemailer() { if (!nodemailer) nodemailer = require('nodemailer'); return nodemailer; }
function getPdfModule() { if (!pdfModule) pdfModule = require('../pdf'); return pdfModule; }
function getDriveModule() { if (!driveModule) driveModule = require('../drive'); return driveModule; }

// Server-side HTML escaping for email templates
function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// Sanitize filenames for Content-Disposition headers
function safeFilename(name) {
    return String(name || 'document').replace(/[^a-zA-Z0-9\-]/g, '_');
}

router.use(requireAuth);

// Generate and preview PDF (returns PDF as binary)
router.get('/pdf-preview/:id', async (req, res) => {
    try {
        const doc = await store.getDocumentById(req.params.id);
        if (!doc) return res.status(404).json({ error: 'Document not found' });

        const lineItems = doc.line_items || [];
        const supplierType = doc.supplier_type;

        const pdfDoc = getPdfModule().generatePDF(doc, lineItems, supplierType);
        const pdfBuffer = getPdfModule().getPDFBuffer(pdfDoc);

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="${safeFilename(doc.doc_number)}.pdf"`);
        res.send(pdfBuffer);
    } catch (err) {
        console.error('Error generating PDF preview:', err);
        res.status(500).json({ error: err.message });
    }
});

// Download PDF
router.get('/pdf/:id', async (req, res) => {
    try {
        const doc = await store.getDocumentById(req.params.id);
        if (!doc) return res.status(404).json({ error: 'Document not found' });

        const lineItems = doc.line_items || [];
        const supplierType = doc.supplier_type;

        const pdfDoc = getPdfModule().generatePDF(doc, lineItems, supplierType);
        const pdfBuffer = getPdfModule().getPDFBuffer(pdfDoc);

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${safeFilename(doc.doc_number)}.pdf"`);
        res.send(pdfBuffer);
    } catch (err) {
        console.error('Error generating PDF:', err);
        res.status(500).json({ error: err.message });
    }
});

// Generate PDF, save to Storage, and send email to supplier
router.post('/send/:id', async (req, res) => {
    try {
        const doc = await store.getDocumentById(req.params.id);
        if (!doc) return res.status(404).json({ error: 'Document not found' });

        const lineItems = doc.line_items || [];
        const supplierType = doc.supplier_type;

        // Generate PDF
        const pdfDoc = getPdfModule().generatePDF(doc, lineItems, supplierType);
        const pdfBuffer = getPdfModule().getPDFBuffer(pdfDoc);
        const filename = `${doc.doc_number}.pdf`;

        // Save to Cloud Storage
        try {
            const pdfUrl = await getPdfModule().savePDFToStorage(store.getStorage(), pdfDoc, filename);
            await store.updatePdfUrl(doc.id, pdfUrl);
        } catch (storageErr) {
            console.warn('Could not save to Cloud Storage:', storageErr.message);
        }

        // Auto-export to Google Drive
        try {
            const rootFolderId = (process.env.DRIVE_ROOT_FOLDER_ID || '').trim();
            if (rootFolderId) {
                const driveLink = await getDriveModule().uploadPDF(rootFolderId, doc, pdfBuffer);
                if (driveLink) {
                    await store.updateDriveUrl(doc.id, driveLink);
                }
            }
        } catch (driveErr) {
            console.warn('Could not export to Google Drive:', driveErr.message);
        }

        // Determine recipient
        const isRFQ = doc.doc_type === 'RFQ';
        const toEmail = isRFQ ? doc.quote_email : doc.order_email;
        const ccEmail = (process.env.EMAIL_CC || 'shane@westernwindows.ca').trim();
        const fromEmail = (process.env.EMAIL_FROM || 'shane@westernwindows.ca').trim();

        // Check if SMTP is configured
        const smtpHost = (process.env.SMTP_HOST || '').trim();
        const smtpPass = (process.env.SMTP_PASS || '').trim();

        if (!smtpHost || !smtpPass || smtpPass === 'your-email-password-or-app-password') {
            // SMTP not configured — save PDF but don't send
            await store.updateDocumentStatus(doc.id, 'Sent');
            return res.json({
                success: true,
                warning: 'SMTP not configured. PDF saved but email not sent.',
                would_send_to: toEmail,
                pdf_saved: true,
            });
        }

        // Create transporter and send
        const transporter = getNodemailer().createTransport({
            host: smtpHost,
            port: parseInt((process.env.SMTP_PORT || '587').trim()),
            secure: false,
            auth: {
                user: (process.env.SMTP_USER || '').trim(),
                pass: smtpPass,
            },
        });

        const subjectPrefix = isRFQ ? 'Request for Quote' : 'Purchase Order';
        const mailOpts = {
            from: `"Western Windows" <${fromEmail}>`,
            to: toEmail,
            cc: ccEmail,
            subject: `${subjectPrefix}: ${doc.doc_number} — ${doc.project_name || 'Western Windows'}`,
            html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px;">
          <h2 style="color: #1B3A5C;">${escapeHtml(subjectPrefix)}</h2>
          <p>Hi${doc.contact_name ? ' ' + escapeHtml(doc.contact_name) : ''},</p>
          <p>Please find attached ${isRFQ ? 'our request for quote' : 'our purchase order'} <strong>${escapeHtml(doc.doc_number)}</strong>.</p>
          ${doc.project_name ? `<p><strong>Project:</strong> ${escapeHtml(doc.project_name)}</p>` : ''}
          ${doc.required_date ? `<p><strong>Required By:</strong> ${escapeHtml(doc.required_date)}</p>` : ''}
          ${doc.quote_reference ? `<p><strong>Reference Quote #:</strong> ${escapeHtml(doc.quote_reference)}</p>` : ''}
          <p>Please don't hesitate to reach out if you have any questions.</p>
          <br>
          <p>Best regards,<br><strong>${escapeHtml(doc.requested_by || 'Shane')}</strong><br>Western Windows<br>info@westernwindows.ca</p>
        </div>
      `,
            attachments: [{
                filename,
                content: pdfBuffer,
                contentType: 'application/pdf',
            }],
        };

        await transporter.sendMail(mailOpts);
        await store.updateDocumentStatus(doc.id, 'Sent');

        res.json({
            success: true,
            sent_to: toEmail,
            cc: ccEmail,
        });
    } catch (err) {
        console.error('Error sending email:', err);
        res.status(500).json({ error: err.message });
    }
});

// Batch send — send multiple documents in one call
router.post('/send-batch', async (req, res) => {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: 'Missing ids array' });
    }

    const results = [];
    for (const id of ids) {
        try {
            const doc = await store.getDocumentById(id);
            if (!doc) {
                results.push({ id, success: false, error: 'Document not found' });
                continue;
            }

            const lineItems = doc.line_items || [];
            const supplierType = doc.supplier_type;

            // Generate PDF
            const pdfDoc = getPdfModule().generatePDF(doc, lineItems, supplierType);
            const pdfBuffer = getPdfModule().getPDFBuffer(pdfDoc);
            const filename = `${doc.doc_number}.pdf`;

            // Save to Cloud Storage
            try {
                const pdfUrl = await getPdfModule().savePDFToStorage(store.getStorage(), pdfDoc, filename);
                await store.updatePdfUrl(doc.id, pdfUrl);
            } catch (storageErr) {
                console.warn('Could not save to Cloud Storage:', storageErr.message);
            }

            // Auto-export to Google Drive
            try {
                const rootFolderId = (process.env.DRIVE_ROOT_FOLDER_ID || '').trim();
                if (rootFolderId) {
                    const driveLink = await getDriveModule().uploadPDF(rootFolderId, doc, pdfBuffer);
                    if (driveLink) {
                        await store.updateDriveUrl(doc.id, driveLink);
                    }
                }
            } catch (driveErr) {
                console.warn('Could not export to Google Drive:', driveErr.message);
            }

            // Send email
            const isRFQ = doc.doc_type === 'RFQ';
            const toEmail = isRFQ ? doc.quote_email : doc.order_email;
            const ccEmail = (process.env.EMAIL_CC || 'shane@westernwindows.ca').trim();
            const fromEmail = (process.env.EMAIL_FROM || 'shane@westernwindows.ca').trim();
            const smtpHost = (process.env.SMTP_HOST || '').trim();
            const smtpPass = (process.env.SMTP_PASS || '').trim();

            if (!smtpHost || !smtpPass || smtpPass === 'your-email-password-or-app-password') {
                await store.updateDocumentStatus(doc.id, 'Sent');
                results.push({ id, success: true, sent_to: toEmail, warning: 'SMTP not configured' });
                continue;
            }

            const transporter = getNodemailer().createTransport({
                host: smtpHost,
                port: parseInt(process.env.SMTP_PORT || '587'),
                secure: parseInt(process.env.SMTP_PORT || '587') === 465,
                auth: { user: process.env.SMTP_USER, pass: smtpPass },
            });

            const subject = isRFQ
                ? `RFQ ${doc.doc_number} — ${doc.project_name || 'Quote Request'}`
                : `PO ${doc.doc_number} — ${doc.project_name || 'Purchase Order'}`;

            await transporter.sendMail({
                from: `"Western Windows" <${fromEmail}>`,
                to: toEmail,
                cc: ccEmail,
                subject,
                text: `Please find attached ${doc.doc_type} ${doc.doc_number}.`,
                html: `<p>Please find attached <strong>${escapeHtml(doc.doc_type)} ${escapeHtml(doc.doc_number)}</strong>.</p>
                       <p>Project: ${escapeHtml(doc.project_name || 'N/A')}</p>
                       <p style="color:#999;font-size:12px;">Sent via Western Windows Portal</p>`,
                attachments: [{ filename, content: pdfBuffer, contentType: 'application/pdf' }],
            });

            await store.updateDocumentStatus(doc.id, 'Sent');
            results.push({ id, success: true, sent_to: toEmail, doc_number: doc.doc_number, supplier_name: doc.supplier_name });

        } catch (err) {
            console.error(`Error sending ${id}:`, err);
            results.push({ id, success: false, error: err.message });
        }
    }

    res.json({ results });
});

module.exports = router;
