const express = require('express');
const router = express.Router();
const { queries } = require('../db');
const { requireAuth } = require('../auth');

router.use(requireAuth);

// Get next available document number
router.get('/next-number/:type', (req, res) => {
    const docType = req.params.type.toUpperCase();
    if (!['RFQ', 'PO'].includes(docType)) {
        return res.status(400).json({ error: 'Invalid document type' });
    }
    const number = queries.getNextDocNumber(docType);
    res.json({ number });
});

// Create a new document with line items
router.post('/', (req, res) => {
    try {
        const { document, lineItems } = req.body;

        // Build line items with defaults
        const items = (lineItems || []).map((item, idx) => ({
            document_id: 0, // will be set in transaction
            line_number: idx + 1,
            qty: item.qty || 1,
            width: item.width || null,
            height: item.height || null,
            product_type: item.product_type || null,
            series: item.series || null,
            glass_type: item.glass_type || null,
            thickness: item.thickness || null,
            tint_coating: item.tint_coating || null,
            is_igu: item.is_igu ? 1 : 0,
            igu_config: item.igu_config || null,
            spacer_type: item.spacer_type || null,
            gas_fill: item.gas_fill || null,
            shape: item.shape || null,
            edge_work: item.edge_work || null,
            holes_cutouts: item.holes_cutouts || null,
            frit_pattern: item.frit_pattern || null,
            product_category: item.product_category || null,
            application_type: item.application_type || null,
            frame_color: item.frame_color || null,
            grid_pattern: item.grid_pattern || null,
            grid_type: item.grid_type || null,
            glass_package: item.glass_package || null,
            tempered: item.tempered ? 1 : 0,
            screen: item.screen || null,
            hardware_color: item.hardware_color || null,
            operating_style: item.operating_style || null,
            energy_star: item.energy_star ? 1 : 0,
            door_type: item.door_type || null,
            door_material: item.door_material || null,
            door_style: item.door_style || null,
            unit_price: item.unit_price || 0,
            line_total: (item.qty || 1) * (item.unit_price || 0),
            notes: item.notes || null,
        }));

        const totalAmount = items.reduce((sum, i) => sum + (i.line_total || 0), 0);

        const docData = {
            doc_type: document.doc_type,
            doc_number: document.doc_number,
            status: document.status || 'Draft',
            created_date: document.created_date || new Date().toISOString().split('T')[0],
            required_date: document.required_date || null,
            supplier_id: document.supplier_id,
            project_name: document.project_name || null,
            job_address: document.job_address || null,
            requested_by: document.requested_by || 'Shane',
            shipping_method: document.shipping_method || 'Delivery',
            notes: document.notes || null,
            quote_reference: document.quote_reference || null,
            total_amount: totalAmount,
        };

        const docId = queries.createDocumentWithItems(docData, items);
        const created = queries.getDocumentById.get(docId);
        const createdItems = queries.getLineItems.all(docId);

        res.status(201).json({ document: created, lineItems: createdItems });
    } catch (err) {
        console.error('Error creating document:', err);
        res.status(500).json({ error: err.message });
    }
});

// Get a document by ID
router.get('/:id', (req, res) => {
    const doc = queries.getDocumentById.get(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Document not found' });
    const items = queries.getLineItems.all(doc.id);
    res.json({ document: doc, lineItems: items });
});

// Update a document
router.put('/:id', (req, res) => {
    try {
        const { document, lineItems } = req.body;

        const items = (lineItems || []).map((item, idx) => ({
            document_id: parseInt(req.params.id),
            line_number: idx + 1,
            qty: item.qty || 1,
            width: item.width || null,
            height: item.height || null,
            product_type: item.product_type || null,
            series: item.series || null,
            glass_type: item.glass_type || null,
            thickness: item.thickness || null,
            tint_coating: item.tint_coating || null,
            is_igu: item.is_igu ? 1 : 0,
            igu_config: item.igu_config || null,
            spacer_type: item.spacer_type || null,
            gas_fill: item.gas_fill || null,
            shape: item.shape || null,
            edge_work: item.edge_work || null,
            holes_cutouts: item.holes_cutouts || null,
            frit_pattern: item.frit_pattern || null,
            product_category: item.product_category || null,
            application_type: item.application_type || null,
            frame_color: item.frame_color || null,
            grid_pattern: item.grid_pattern || null,
            grid_type: item.grid_type || null,
            glass_package: item.glass_package || null,
            tempered: item.tempered ? 1 : 0,
            screen: item.screen || null,
            hardware_color: item.hardware_color || null,
            operating_style: item.operating_style || null,
            energy_star: item.energy_star ? 1 : 0,
            door_type: item.door_type || null,
            door_material: item.door_material || null,
            door_style: item.door_style || null,
            unit_price: item.unit_price || 0,
            line_total: (item.qty || 1) * (item.unit_price || 0),
            notes: item.notes || null,
        }));

        const totalAmount = items.reduce((sum, i) => sum + (i.line_total || 0), 0);

        const docData = {
            status: document.status || 'Draft',
            required_date: document.required_date || null,
            project_name: document.project_name || null,
            job_address: document.job_address || null,
            requested_by: document.requested_by || 'Shane',
            shipping_method: document.shipping_method || 'Delivery',
            notes: document.notes || null,
            quote_reference: document.quote_reference || null,
            total_amount: totalAmount,
        };

        queries.updateDocumentWithItems(parseInt(req.params.id), docData, items);
        const updated = queries.getDocumentById.get(parseInt(req.params.id));
        const updatedItems = queries.getLineItems.all(parseInt(req.params.id));

        res.json({ document: updated, lineItems: updatedItems });
    } catch (err) {
        console.error('Error updating document:', err);
        res.status(500).json({ error: err.message });
    }
});

// Search documents
router.get('/', (req, res) => {
    const filters = {
        doc_type: req.query.doc_type || null,
        supplier_id: req.query.supplier_id ? parseInt(req.query.supplier_id) : null,
        status: req.query.status || null,
        search: req.query.search || null,
        date_from: req.query.date_from || null,
        date_to: req.query.date_to || null,
    };
    const docs = queries.searchDocuments(filters);
    res.json(docs);
});

// Get recent documents (for dashboard)
router.get('/recent/list', (req, res) => {
    const docs = queries.getRecentDocuments.all();
    res.json(docs);
});

// Update order confirmation on a PO
router.patch('/:id/confirmation', (req, res) => {
    const { order_confirmation } = req.body;
    queries.updateOrderConfirmation.run(order_confirmation, parseInt(req.params.id));
    const doc = queries.getDocumentById.get(parseInt(req.params.id));
    res.json(doc);
});

// Delete a document
router.delete('/:id', (req, res) => {
    queries.deleteDocument.run(parseInt(req.params.id));
    res.json({ success: true });
});

module.exports = router;
