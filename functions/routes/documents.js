const express = require('express');
const router = express.Router();
const { requireAuth } = require('../auth');
const store = require('../firestore');

router.use(requireAuth);

// Get next available document number
router.get('/next-number/:type', async (req, res) => {
    try {
        const docType = req.params.type.toUpperCase();
        if (!['RFQ', 'PO'].includes(docType)) {
            return res.status(400).json({ error: 'Invalid document type' });
        }
        const number = await store.getNextDocNumber(docType);
        res.json({ number });
    } catch (err) {
        console.error('Error getting next number:', err);
        res.status(500).json({ error: err.message });
    }
});

// Create a new document with line items
router.post('/', async (req, res) => {
    try {
        const { document: docInput, lineItems } = req.body;

        // Build line items with defaults
        const items = (lineItems || []).map((item, idx) => ({
            line_number: idx + 1,
            qty: item.qty || 1,
            width: item.width || null,
            height: item.height || null,
            product_type: item.product_type || null,
            series: item.series || null,
            glass_type: item.glass_type || null,
            thickness: item.thickness || null,
            tint_coating: item.tint_coating || null,
            is_igu: item.is_igu ? true : false,
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
            tempered: item.tempered ? true : false,
            screen: item.screen || null,
            hardware_color: item.hardware_color || null,
            operating_style: item.operating_style || null,
            energy_star: item.energy_star ? true : false,
            door_type: item.door_type || null,
            door_material: item.door_material || null,
            door_style: item.door_style || null,
            unit_price: item.unit_price || 0,
            line_total: (item.qty || 1) * (item.unit_price || 0),
            frame_type: item.frame_type || null,
            reno_flange_size: item.reno_flange_size || null,
            notes: item.notes || null,
        }));

        const totalAmount = items.reduce((sum, i) => sum + (i.line_total || 0), 0);

        const docData = {
            doc_type: docInput.doc_type,
            doc_number: docInput.doc_number,
            status: docInput.status || 'Draft',
            created_date: docInput.created_date || new Date().toISOString().split('T')[0],
            required_date: docInput.required_date || null,
            supplier_id: docInput.supplier_id,
            project_name: docInput.project_name || null,
            job_address: docInput.job_address || null,
            requested_by: docInput.requested_by || 'Shane',
            shipping_method: docInput.shipping_method || 'Delivery',
            notes: docInput.notes || null,
            quote_reference: docInput.quote_reference || null,
            total_amount: totalAmount,
        };

        const created = await store.createDocument(docData, items);
        res.status(201).json({ document: created, lineItems: items });
    } catch (err) {
        console.error('Error creating document:', err);
        res.status(500).json({ error: err.message });
    }
});

// Get a document by ID
router.get('/:id', async (req, res) => {
    try {
        const doc = await store.getDocumentById(req.params.id);
        if (!doc) return res.status(404).json({ error: 'Document not found' });
        // Extract line items from the embedded array
        const lineItems = doc.line_items || [];
        res.json({ document: doc, lineItems });
    } catch (err) {
        console.error('Error fetching document:', err);
        res.status(500).json({ error: err.message });
    }
});

// Update a document
router.put('/:id', async (req, res) => {
    try {
        const { document: docInput, lineItems } = req.body;

        const items = (lineItems || []).map((item, idx) => ({
            line_number: idx + 1,
            qty: item.qty || 1,
            width: item.width || null,
            height: item.height || null,
            product_type: item.product_type || null,
            series: item.series || null,
            glass_type: item.glass_type || null,
            thickness: item.thickness || null,
            tint_coating: item.tint_coating || null,
            is_igu: item.is_igu ? true : false,
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
            tempered: item.tempered ? true : false,
            screen: item.screen || null,
            hardware_color: item.hardware_color || null,
            operating_style: item.operating_style || null,
            energy_star: item.energy_star ? true : false,
            door_type: item.door_type || null,
            door_material: item.door_material || null,
            door_style: item.door_style || null,
            unit_price: item.unit_price || 0,
            line_total: (item.qty || 1) * (item.unit_price || 0),
            frame_type: item.frame_type || null,
            reno_flange_size: item.reno_flange_size || null,
            notes: item.notes || null,
        }));

        const totalAmount = items.reduce((sum, i) => sum + (i.line_total || 0), 0);

        const docData = {
            status: docInput.status || 'Draft',
            required_date: docInput.required_date || null,
            project_name: docInput.project_name || null,
            job_address: docInput.job_address || null,
            requested_by: docInput.requested_by || 'Shane',
            shipping_method: docInput.shipping_method || 'Delivery',
            notes: docInput.notes || null,
            quote_reference: docInput.quote_reference || null,
            total_amount: totalAmount,
        };

        const updated = await store.updateDocument(req.params.id, docData, items);
        res.json({ document: updated, lineItems: items });
    } catch (err) {
        console.error('Error updating document:', err);
        res.status(500).json({ error: err.message });
    }
});

// Search documents
router.get('/', async (req, res) => {
    try {
        const filters = {
            doc_type: req.query.doc_type || null,
            supplier_id: req.query.supplier_id || null,
            status: req.query.status || null,
            search: req.query.search || null,
            date_from: req.query.date_from || null,
            date_to: req.query.date_to || null,
        };
        const docs = await store.searchDocuments(filters);
        res.json(docs);
    } catch (err) {
        console.error('Search error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Get recent documents (for dashboard)
router.get('/recent/list', async (req, res) => {
    try {
        const docs = await store.getRecentDocuments();
        res.json(docs);
    } catch (err) {
        console.error('Error fetching recent:', err);
        res.status(500).json({ error: err.message });
    }
});

// Update order confirmation on a PO
router.patch('/:id/confirmation', async (req, res) => {
    try {
        const { order_confirmation } = req.body;
        await store.updateOrderConfirmation(req.params.id, order_confirmation);
        const doc = await store.getDocumentById(req.params.id);
        res.json(doc);
    } catch (err) {
        console.error('Confirmation error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Delete a document
router.delete('/:id', async (req, res) => {
    try {
        await store.deleteDocument(req.params.id);
        res.json({ success: true });
    } catch (err) {
        console.error('Delete error:', err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
