// Lazy-loaded to avoid cold start timeout
let jsPDF = null;
let autoTable = null;
let logoBase64 = null;
let loaded = false;

function ensureLoaded() {
    if (loaded) return;
    jsPDF = require('jspdf').jsPDF;
    autoTable = require('jspdf-autotable').autoTable;
    const path = require('path');
    const fs = require('fs');
    const logoPath = path.join(__dirname, 'ww-logo.png');
    if (fs.existsSync(logoPath)) {
        const logoBuffer = fs.readFileSync(logoPath);
        logoBase64 = 'data:image/png;base64,' + logoBuffer.toString('base64');
    }
    loaded = true;
}

function generatePDF(document, lineItems, supplierType) {
    ensureLoaded();
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 15;
    let y = margin;

    const darkBlue = [27, 58, 92];
    const medBlue = [70, 130, 180];

    // --- HEADER ---
    if (logoBase64) {
        doc.addImage(logoBase64, 'PNG', margin, y, 30, 30);
    }

    const isRFQ = document.doc_type === 'RFQ';
    const title = isRFQ ? 'REQUEST FOR QUOTE' : 'PURCHASE ORDER';

    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...darkBlue);
    doc.text(title, pageWidth - margin, y + 8, { align: 'right' });

    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.text(document.doc_number, pageWidth - margin, y + 16, { align: 'right' });

    y += 32;

    doc.setDrawColor(...darkBlue);
    doc.setLineWidth(0.8);
    doc.line(margin, y, pageWidth - margin, y);
    y += 8;

    // --- DOCUMENT INFO ---
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(80, 80, 80);

    const col1 = margin;
    const col2 = pageWidth / 2 + 10;

    doc.text('FROM:', col1, y);
    doc.setFont('helvetica', 'normal');
    doc.text('Western Windows', col1, y + 5);
    doc.text('Windows, Doors & Skylights', col1, y + 10);
    doc.text('info@westernwindows.ca', col1, y + 15);

    doc.setFont('helvetica', 'bold');
    doc.text('TO:', col2, y);
    doc.setFont('helvetica', 'normal');
    doc.text(document.supplier_name || '', col2, y + 5);
    const emailField = isRFQ ? document.quote_email : document.order_email;
    doc.text(emailField || '', col2, y + 10);

    y += 24;

    // --- DETAILS TABLE ---
    const detailHeaders = ['Date', 'Required By', 'Project/Job', 'Requested By', 'Shipping'];
    const detailBody = [
        document.created_date || '',
        document.required_date || 'TBD',
        document.project_name || '',
        document.requested_by || 'Shane',
        document.shipping_method || 'Delivery',
    ];

    if (document.quote_reference) {
        detailHeaders.push('Quote Ref #');
        detailBody.push(document.quote_reference);
    }

    autoTable(doc, {
        startY: y,
        margin: { left: margin, right: margin },
        head: [detailHeaders],
        body: [detailBody],
        theme: 'grid',
        headStyles: { fillColor: darkBlue, fontSize: 8, fontStyle: 'bold' },
        bodyStyles: { fontSize: 8 },
        styles: { cellPadding: 3 },
    });

    y = doc.lastAutoTable.finalY + 5;

    if (document.job_address) {
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.text('Job/Delivery Address: ', margin, y);
        doc.setFont('helvetica', 'normal');
        doc.text(document.job_address, margin + 35, y);
        y += 7;
    }

    // --- LINE ITEMS TABLE ---
    if (supplierType === 'glass') {
        const glassHeaders = ['#', 'Qty', 'W x H', 'Glass Type', 'Thickness', 'Tint/Coating', 'IGU Config', 'Edge Work', 'Shape'];
        const hasPrice = document.doc_type === 'PO';
        if (hasPrice) glassHeaders.push('Unit $', 'Total $');

        const glassRows = lineItems.map(item => {
            const row = [
                item.line_number, item.qty,
                `${item.width || ''} x ${item.height || ''}`.replace(/ x $/, ''),
                item.glass_type || '', item.thickness || '', item.tint_coating || '',
                item.is_igu ? (item.igu_config || 'Yes') : '',
                item.edge_work || '', item.shape || 'Rect',
            ];
            if (hasPrice) {
                row.push(
                    item.unit_price ? `$${Number(item.unit_price).toFixed(2)}` : '',
                    item.line_total ? `$${Number(item.line_total).toFixed(2)}` : ''
                );
            }
            return row;
        });

        autoTable(doc, {
            startY: y, margin: { left: margin, right: margin },
            head: [glassHeaders], body: glassRows, theme: 'striped',
            headStyles: { fillColor: darkBlue, fontSize: 7, fontStyle: 'bold', cellPadding: 4 },
            bodyStyles: { fontSize: 7 },
            columnStyles: { 0: { cellWidth: 8 }, 1: { cellWidth: 10 } },
            styles: { cellPadding: 3, overflow: 'linebreak' },
            alternateRowStyles: { fillColor: [245, 247, 250] },
        });
    } else {
        const windowHeaders = ['#', 'Qty', 'Type', 'Series', 'W x H', 'Frame Color', 'Frame Type', 'Glass Pkg', 'Grid', 'Screen'];
        const hasPrice = document.doc_type === 'PO';
        if (hasPrice) windowHeaders.push('Unit $', 'Total $');

        const windowRows = lineItems.map(item => {
            const row = [
                item.line_number, item.qty,
                item.product_type || '', item.series || '',
                `${item.width || ''} x ${item.height || ''}`.replace(/ x $/, ''),
                item.frame_color || '', item.frame_type || '', item.glass_package || '',
                item.grid_pattern || 'None', item.screen || '',
            ];
            if (hasPrice) {
                row.push(
                    item.unit_price ? `$${Number(item.unit_price).toFixed(2)}` : '',
                    item.line_total ? `$${Number(item.line_total).toFixed(2)}` : ''
                );
            }
            return row;
        });

        autoTable(doc, {
            startY: y, margin: { left: margin, right: margin },
            head: [windowHeaders], body: windowRows, theme: 'striped',
            headStyles: { fillColor: darkBlue, fontSize: 7, fontStyle: 'bold', cellPadding: 4 },
            bodyStyles: { fontSize: 7 },
            columnStyles: { 0: { cellWidth: 8 }, 1: { cellWidth: 10 } },
            styles: { cellPadding: 3, overflow: 'linebreak' },
            alternateRowStyles: { fillColor: [245, 247, 250] },
        });
    }

    y = doc.lastAutoTable.finalY + 5;

    // Line item notes
    const itemsWithNotes = lineItems.filter(i =>
        i.notes || i.holes_cutouts || i.frit_pattern || i.product_category || i.application_type ||
        i.door_type || i.door_material || i.operating_style || i.reno_flange_size
    );

    if (itemsWithNotes.length > 0) {
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.text('Line Item Notes:', margin, y);
        y += 4;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);

        for (const item of itemsWithNotes) {
            const details = [];
            if (item.product_category) details.push(`Category: ${item.product_category}`);
            if (item.application_type) details.push(`Application: ${item.application_type}`);
            if (item.holes_cutouts) details.push(`Holes/Cutouts: ${item.holes_cutouts}`);
            if (item.frit_pattern) details.push(`Frit/Pattern: ${item.frit_pattern}`);
            if (item.spacer_type) details.push(`Spacer: ${item.spacer_type}`);
            if (item.gas_fill) details.push(`Gas: ${item.gas_fill}`);
            if (item.door_type) details.push(`Door: ${item.door_type}`);
            if (item.door_material) details.push(`Material: ${item.door_material}`);
            if (item.operating_style) details.push(`Config: ${item.operating_style}`);
            if (item.frame_type === 'Stucco/Reno Flange' && item.reno_flange_size) details.push(`Reno Flange: ${item.reno_flange_size}`);
            if (item.tempered) details.push('Tempered: Yes');
            if (item.energy_star) details.push('Energy Star: Yes');
            if (item.notes) details.push(item.notes);

            if (details.length > 0) {
                doc.text(`  Line ${item.line_number}: ${details.join(' | ')}`, margin, y);
                y += 4;
            }
        }
        y += 3;
    }

    // --- TOTAL (for POs) ---
    if (document.doc_type === 'PO' && document.total_amount > 0) {
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...darkBlue);
        doc.text(`TOTAL: $${Number(document.total_amount).toFixed(2)}`, pageWidth - margin, y, { align: 'right' });
        y += 8;
    }

    // --- NOTES ---
    if (document.notes) {
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(80, 80, 80);
        doc.text('Notes / Special Instructions:', margin, y);
        y += 4;
        doc.setFont('helvetica', 'normal');
        const noteLines = doc.splitTextToSize(document.notes, pageWidth - margin * 2);
        doc.text(noteLines, margin, y);
        y += noteLines.length * 4 + 5;
    }

    // --- TERMS & CONDITIONS (POs only) ---
    if (document.doc_type === 'PO') {
        const pageHeight = doc.internal.pageSize.getHeight();
        // Check if we need a new page for terms
        if (y > pageHeight - 60) {
            doc.addPage();
            y = 20;
        }

        y += 3;
        doc.setFontSize(7);
        doc.setTextColor(130, 130, 130);
        doc.setFont('helvetica', 'bold');
        doc.text('TERMS & CONDITIONS', margin, y);
        doc.setFont('helvetica', 'normal');
        y += 5;

        const terms = [
            'All prices are in Canadian dollars unless otherwise specified.',
            'Payment terms: Net 30 days from date of invoice.',
            'Delivery dates are estimates and subject to change.',
            'Western Windows reserves the right to cancel orders with 48 hours notice.',
            'All materials remain property of Western Windows until installed.',
        ];
        terms.forEach(term => {
            doc.text(`\u2022 ${term}`, margin, y);
            y += 4;
        });
    }

    // --- FOOTER + PAGE NUMBERS (all pages) ---
    const totalPages = doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        const footerY = doc.internal.pageSize.getHeight() - 15;

        // Company footer line
        doc.setDrawColor(...medBlue);
        doc.setLineWidth(0.3);
        doc.line(margin, footerY - 5, pageWidth - margin, footerY - 5);
        doc.setFontSize(7);
        doc.setTextColor(120, 120, 120);
        doc.text('Western Windows | Windows, Doors & Skylights | westernwindows.ca | info@westernwindows.ca', pageWidth / 2, footerY, { align: 'center' });

        // Page number
        doc.setFontSize(7);
        doc.setTextColor(160, 160, 160);
        doc.text(`Page ${i} of ${totalPages}`, pageWidth - margin, footerY + 5, { align: 'right' });
    }

    return doc;
}

// Save PDF to Cloud Storage and return the public URL
async function savePDFToStorage(storage, pdfDoc, filename) {
    const bucket = storage.bucket();
    const pdfBuffer = Buffer.from(pdfDoc.output('arraybuffer'));
    const file = bucket.file(`portal/pdfs/${filename}`);

    await file.save(pdfBuffer, {
        metadata: {
            contentType: 'application/pdf',
        },
    });

    // Make publicly readable (or use signed URLs)
    await file.makePublic();
    return `https://storage.googleapis.com/${bucket.name}/portal/pdfs/${filename}`;
}

// Get PDF buffer (for download/preview without saving)
function getPDFBuffer(pdfDoc) {
    return Buffer.from(pdfDoc.output('arraybuffer'));
}

module.exports = { generatePDF, savePDFToStorage, getPDFBuffer };
