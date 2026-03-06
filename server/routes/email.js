const express = require('express');
const router = express.Router();
const nodemailer = require('nodemailer');
const { queries } = require('../db');
const { requireAuth } = require('../auth');
const { generatePDF, savePDF } = require('../pdf');

router.use(requireAuth);

// Generate PDF for a document
router.get('/pdf/:id', async (req, res) => {
    try {
        const doc = queries.getDocumentById.get(parseInt(req.params.id));
        if (!doc) return res.status(404).json({ error: 'Document not found' });

        const items = queries.getLineItems.all(doc.id);
        const pdfDoc = generatePDF(doc, items, doc.supplier_type);
        const filename = `${doc.doc_number}.pdf`;
        const filePath = savePDF(pdfDoc, filename);

        // Update document with PDF path
        queries.updatePdfPath.run(filePath, doc.id);

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        const pdfBuffer = Buffer.from(pdfDoc.output('arraybuffer'));
        res.send(pdfBuffer);
    } catch (err) {
        console.error('Error generating PDF:', err);
        res.status(500).json({ error: err.message });
    }
});

// Preview PDF (inline, not download)
router.get('/pdf-preview/:id', async (req, res) => {
    try {
        const doc = queries.getDocumentById.get(parseInt(req.params.id));
        if (!doc) return res.status(404).json({ error: 'Document not found' });

        const items = queries.getLineItems.all(doc.id);
        const pdfDoc = generatePDF(doc, items, doc.supplier_type);

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="${doc.doc_number}.pdf"`);
        const pdfBuffer = Buffer.from(pdfDoc.output('arraybuffer'));
        res.send(pdfBuffer);
    } catch (err) {
        console.error('Error generating PDF preview:', err);
        res.status(500).json({ error: err.message });
    }
});

// Send email with PDF attachment
router.post('/send/:id', async (req, res) => {
    try {
        const doc = queries.getDocumentById.get(parseInt(req.params.id));
        if (!doc) return res.status(404).json({ error: 'Document not found' });

        const items = queries.getLineItems.all(doc.id);
        const pdfDoc = generatePDF(doc, items, doc.supplier_type);
        const filename = `${doc.doc_number}.pdf`;
        const filePath = savePDF(pdfDoc, filename);
        queries.updatePdfPath.run(filePath, doc.id);

        const pdfBuffer = Buffer.from(pdfDoc.output('arraybuffer'));

        // Determine recipient email
        const isRFQ = doc.doc_type === 'RFQ';
        const recipientEmail = isRFQ ? doc.quote_email : doc.order_email;
        const docLabel = isRFQ ? 'Request for Quote' : 'Purchase Order';

        // Build email
        const subject = `Western Windows — ${doc.doc_number} — ${doc.project_name || 'Quote Request'}`;
        const body = `Hi,

Please find attached ${docLabel} ${doc.doc_number} from Western Windows.

Document #: ${doc.doc_number}
Project: ${doc.project_name || 'N/A'}
Requested By: ${doc.requested_by || 'Shane'}
Required By: ${doc.required_date || 'TBD'}

Please review and respond at your earliest convenience.

Best regards,
${doc.requested_by || 'Shane'}
Western Windows
Windows, Doors & Skylights
info@westernwindows.ca
westernwindows.ca`;

        // Create transporter
        const transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST || 'smtp.gmail.com',
            port: parseInt(process.env.SMTP_PORT || '587'),
            secure: false,
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS,
            },
        });

        const mailOptions = {
            from: `"Western Windows" <${process.env.EMAIL_FROM || 'info@westernwindows.ca'}>`,
            to: recipientEmail,
            cc: process.env.EMAIL_CC || 'shane@westernwindows.ca',
            subject: subject,
            text: body,
            attachments: [
                {
                    filename: filename,
                    content: pdfBuffer,
                    contentType: 'application/pdf',
                },
            ],
        };

        // Check if SMTP is configured
        if (!process.env.SMTP_USER || !process.env.SMTP_PASS || process.env.SMTP_PASS === 'your-app-password-here') {
            // Save PDF but skip email — return success with warning
            queries.updateDocumentStatus.run('Sent', doc.id);
            return res.json({
                success: true,
                warning: 'Email not configured — PDF was generated and saved. Update .env with SMTP credentials to enable email.',
                pdf_path: filePath,
                would_send_to: recipientEmail,
                cc: process.env.EMAIL_CC || 'shane@westernwindows.ca',
            });
        }

        await transporter.sendMail(mailOptions);

        // Update document status
        queries.updateDocumentStatus.run('Sent', doc.id);

        res.json({
            success: true,
            sent_to: recipientEmail,
            cc: process.env.EMAIL_CC || 'shane@westernwindows.ca',
            pdf_path: filePath,
        });
    } catch (err) {
        console.error('Error sending email:', err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
