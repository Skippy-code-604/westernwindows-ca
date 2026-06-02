const express = require('express');
const router = express.Router();

// Lazy-loaded to avoid cold start timeout
let nodemailer = null;
function getNodemailer() { if (!nodemailer) nodemailer = require('nodemailer'); return nodemailer; }

// HTML-escape user input
function esc(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Simple rate-limit: track submissions by IP (in-memory, resets on cold start)
const recentSubmissions = new Map();
const RATE_LIMIT_MS = 60_000; // 1 submission per minute per IP

/**
 * POST /api/contact
 * Public endpoint — no auth required.
 * Sends a formatted lead email to the team.
 */
router.post('/', async (req, res) => {
    try {
        // Rate limiting
        const ip = req.ip || req.connection?.remoteAddress || 'unknown';
        const lastSubmit = recentSubmissions.get(ip);
        if (lastSubmit && Date.now() - lastSubmit < RATE_LIMIT_MS) {
            return res.status(429).json({ error: 'Please wait before submitting again.' });
        }
        recentSubmissions.set(ip, Date.now());

        const { name, email, phone, address, service, message, photos } = req.body;

        // Validation
        if (!name || !email || !phone || !address || !service) {
            return res.status(400).json({ error: 'Missing required fields: name, email, phone, address, service' });
        }

        // Validate photos (max 5, max 5MB each base64)
        const validPhotos = [];
        if (Array.isArray(photos)) {
            for (const photo of photos.slice(0, 5)) {
                if (photo && photo.data && photo.type && photo.type.startsWith('image/')) {
                    const buf = Buffer.from(photo.data, 'base64');
                    if (buf.length <= 5 * 1024 * 1024) {
                        validPhotos.push({ name: photo.name || 'photo.jpg', type: photo.type, buffer: buf });
                    }
                }
            }
        }

        // Basic email format check
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return res.status(400).json({ error: 'Invalid email address' });
        }

        // SMTP config
        const smtpHost = (process.env.SMTP_HOST || '').trim();
        const smtpPass = (process.env.SMTP_PASS || '').trim();
        const smtpUser = (process.env.SMTP_USER || '').trim();
        const smtpPort = parseInt((process.env.SMTP_PORT || '587').trim());
        const fromEmail = (process.env.EMAIL_FROM || 'info@westernwindows.ca').trim();

        if (!smtpHost || !smtpPass) {
            console.error('SMTP not configured for contact form');
            return res.status(500).json({ error: 'Email system not configured' });
        }

        const transporter = getNodemailer().createTransport({
            host: smtpHost,
            port: smtpPort,
            secure: smtpPort === 465,
            auth: { user: smtpUser, pass: smtpPass },
        });

        const now = new Date().toLocaleString('en-CA', { timeZone: 'America/Vancouver' });

        const mailOpts = {
            from: `"Western Windows Website" <${fromEmail}>`,
            to: 'shane@westernwindows.ca, chris@westernwindows.ca',
            replyTo: email,
            subject: `🏠 New Quote Request: ${esc(service)} — ${esc(name)}`,
            html: `
<div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto;">
    <div style="background: linear-gradient(135deg, #1B3A5F 0%, #0F2440 100%); padding: 30px 24px; border-radius: 12px 12px 0 0;">
        <h1 style="color: #F7A828; margin: 0; font-size: 22px;">New Quote Request</h1>
        <p style="color: rgba(255,255,255,0.8); margin: 8px 0 0; font-size: 14px;">Submitted via westernwindows.ca • ${esc(now)}</p>
    </div>
    <div style="background: #ffffff; padding: 24px; border: 1px solid #e5e7eb; border-top: none;">
        <table style="width: 100%; border-collapse: collapse; font-size: 15px;">
            <tr style="border-bottom: 1px solid #f3f4f6;">
                <td style="padding: 12px 8px; color: #6b7280; font-weight: 600; width: 120px;">Name</td>
                <td style="padding: 12px 8px; color: #111827;">${esc(name)}</td>
            </tr>
            <tr style="border-bottom: 1px solid #f3f4f6;">
                <td style="padding: 12px 8px; color: #6b7280; font-weight: 600;">Email</td>
                <td style="padding: 12px 8px;"><a href="mailto:${esc(email)}" style="color: #1B3A5F;">${esc(email)}</a></td>
            </tr>
            <tr style="border-bottom: 1px solid #f3f4f6;">
                <td style="padding: 12px 8px; color: #6b7280; font-weight: 600;">Phone</td>
                <td style="padding: 12px 8px;"><a href="tel:${esc(phone)}" style="color: #1B3A5F;">${esc(phone)}</a></td>
            </tr>
            <tr style="border-bottom: 1px solid #f3f4f6;">
                <td style="padding: 12px 8px; color: #6b7280; font-weight: 600;">Address</td>
                <td style="padding: 12px 8px; color: #111827;">${esc(address)}</td>
            </tr>
            <tr style="border-bottom: 1px solid #f3f4f6;">
                <td style="padding: 12px 8px; color: #6b7280; font-weight: 600;">Service</td>
                <td style="padding: 12px 8px;"><span style="background: #F7A828; color: #1B3A5F; padding: 4px 12px; border-radius: 20px; font-weight: 600; font-size: 13px;">${esc(service)}</span></td>
            </tr>
            ${message ? `
            <tr>
                <td colspan="2" style="padding: 16px 8px 4px; color: #6b7280; font-weight: 600;">Project Details</td>
            </tr>
            <tr>
                <td colspan="2" style="padding: 4px 8px 12px; color: #111827; line-height: 1.6;">${esc(message).replace(/\n/g, '<br>')}</td>
            </tr>` : ''}
            ${validPhotos.length ? `
            <tr>
                <td colspan="2" style="padding: 16px 8px 4px; color: #6b7280; font-weight: 600;">📷 ${validPhotos.length} Photo${validPhotos.length > 1 ? 's' : ''} Attached</td>
            </tr>` : ''}
        </table>
    </div>
    <div style="background: #f9fafb; padding: 16px 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px; text-align: center;">
        <p style="color: #9ca3af; font-size: 12px; margin: 0;">Reply to this email to respond directly to the customer</p>
    </div>
</div>`,
            text: `New Quote Request from ${name}\n\nService: ${service}\nName: ${name}\nEmail: ${email}\nPhone: ${phone}\nAddress: ${address}\n${message ? `\nMessage:\n${message}` : ''}\n\nSubmitted: ${now}`,
            attachments: validPhotos.map((p, i) => ({
                filename: p.name || `photo-${i + 1}.jpg`,
                content: p.buffer,
                contentType: p.type,
                cid: `photo${i}`,
            })),
        };

        await transporter.sendMail(mailOpts);

        console.log(`Contact form lead sent: ${name} - ${service} - ${email}`);
        res.json({ success: true });

    } catch (err) {
        console.error('Contact form error:', err);
        res.status(500).json({ error: 'Failed to send. Please call us at 604-904-6580.' });
    }
});

module.exports = router;
