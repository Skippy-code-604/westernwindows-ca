const express = require('express');
const router = express.Router();
const { requireAuth } = require('../auth');
const store = require('../firestore');

router.use(requireAuth);

// Shared helper to normalize line item data
function normalizeLineItems(lineItems) {
    return (lineItems || []).map((item, idx) => ({
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
}

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

        // Input validation
        if (!docInput) return res.status(400).json({ error: 'Missing document data' });
        if (!['RFQ', 'PO'].includes(docInput.doc_type)) {
            return res.status(400).json({ error: 'Invalid doc_type. Must be RFQ or PO.' });
        }
        if (!docInput.supplier_id) return res.status(400).json({ error: 'Missing supplier_id' });
        if (!docInput.doc_number) return res.status(400).json({ error: 'Missing doc_number' });

        // Build line items with defaults
        const items = normalizeLineItems(lineItems);

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

// Create multiple documents (one per supplier) from the same line items
router.post('/batch', async (req, res) => {
    try {
        const { document: docInput, lineItems, supplier_ids } = req.body;

        if (!docInput) return res.status(400).json({ error: 'Missing document data' });
        if (!Array.isArray(supplier_ids) || supplier_ids.length === 0) {
            return res.status(400).json({ error: 'Missing supplier_ids array' });
        }
        if (!['RFQ', 'PO'].includes(docInput.doc_type)) {
            return res.status(400).json({ error: 'Invalid doc_type' });
        }

        const items = normalizeLineItems(lineItems);
        const totalAmount = items.reduce((sum, i) => sum + (i.line_total || 0), 0);

        // Fetch all suppliers
        const suppliers = [];
        for (const sid of supplier_ids) {
            const supplier = await store.getSupplierById(sid);
            if (!supplier) return res.status(404).json({ error: `Supplier not found: ${sid}` });
            suppliers.push(supplier);
        }

        // Create one document per supplier, each with its own doc number
        const created = [];
        for (const supplier of suppliers) {
            const docNumber = await store.getNextDocNumber(docInput.doc_type);
            const docData = {
                doc_type: docInput.doc_type,
                doc_number: docNumber,
                status: 'Draft',
                created_date: docInput.created_date || new Date().toISOString().split('T')[0],
                required_date: docInput.required_date || null,
                supplier_id: supplier.id,
                project_name: docInput.project_name || null,
                job_address: docInput.job_address || null,
                requested_by: docInput.requested_by || 'Shane',
                shipping_method: docInput.shipping_method || 'Delivery',
                notes: docInput.notes || null,
                quote_reference: docInput.quote_reference || null,
                total_amount: totalAmount,
                batch_group: supplier_ids.join(','), // Link related docs
            };
            const doc = await store.createDocument(docData, items);
            created.push(doc);
        }

        res.status(201).json({ documents: created });
    } catch (err) {
        console.error('Error creating batch documents:', err);
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

        // Input validation
        if (!docInput) return res.status(400).json({ error: 'Missing document data' });
        if (docInput.status && !['Draft', 'Sent', 'Quoted', 'Ordered', 'Delivered', 'Confirmed', 'Cancelled'].includes(docInput.status)) {
            return res.status(400).json({ error: 'Invalid status' });
        }

        const items = normalizeLineItems(lineItems);

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

// Quick status update (from document list or pipeline)
router.patch('/:id/status', async (req, res) => {
    try {
        const { status } = req.body;
        const validStatuses = ['Draft', 'Sent', 'Quoted', 'Ordered', 'Delivered', 'Confirmed', 'Cancelled'];
        if (!status || !validStatuses.includes(status)) {
            return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
        }
        await store.updateDocumentStatus(req.params.id, status);
        const doc = await store.getDocumentById(req.params.id);
        res.json(doc);
    } catch (err) {
        console.error('Status update error:', err);
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

// Update attachments on a document (e.g., manufacturer quote PDFs on a PO)
router.put('/:id/attachments', async (req, res) => {
    try {
        const { attachments } = req.body;
        if (!Array.isArray(attachments)) {
            return res.status(400).json({ error: 'Missing attachments array' });
        }

        const doc = await store.getDocumentById(req.params.id);
        if (!doc) return res.status(404).json({ error: 'Document not found' });

        // Validate and sanitize attachment objects
        const sanitized = attachments.map(a => ({
            name: a.name || 'unnamed',
            size: a.size || 0,
            type: a.type || 'application/octet-stream',
            storagePath: a.storagePath || '',
            url: a.url || '',
            uploadedAt: a.uploadedAt || new Date().toISOString(),
        }));

        await store.updateDocumentAttachments(req.params.id, sanitized);
        const updated = await store.getDocumentById(req.params.id);
        res.json(updated);
    } catch (err) {
        console.error('Attachments update error:', err);
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

// Convert RFQ to PO
router.post('/:id/convert-to-po', async (req, res) => {
    try {
        const rfq = await store.getDocumentById(req.params.id);
        if (!rfq) return res.status(404).json({ error: 'Document not found' });
        if (rfq.doc_type !== 'RFQ') return res.status(400).json({ error: 'Only RFQs can be converted to POs' });

        const lineItems = (rfq.line_items || []).map((item, idx) => ({
            ...item,
            line_number: idx + 1,
            unit_price: item.quoted_price || 0, // Use quoted price if filled in
            line_total: (item.qty || 1) * (item.quoted_price || 0),
        }));

        const poNumber = await store.getNextDocNumber('PO');
        const totalAmount = lineItems.reduce((sum, i) => sum + (i.line_total || 0), 0);

        const poData = {
            doc_type: 'PO',
            doc_number: poNumber,
            status: 'Draft',
            created_date: new Date().toISOString().split('T')[0],
            required_date: rfq.required_date || null,
            supplier_id: rfq.supplier_id,
            project_name: rfq.project_name || null,
            job_address: rfq.job_address || null,
            requested_by: rfq.requested_by || 'Shane',
            shipping_method: rfq.shipping_method || 'Delivery',
            notes: rfq.notes || null,
            quote_reference: rfq.doc_number, // Link back to RFQ
            converted_from_rfq: rfq.id,
            total_amount: totalAmount,
        };

        const items = normalizeLineItems(lineItems);
        const created = await store.createDocument(poData, items);
        res.status(201).json({ document: created });
    } catch (err) {
        console.error('Error converting to PO:', err);
        res.status(500).json({ error: err.message });
    }
});

// Get all documents in a batch group (for comparison view)
router.get('/batch-group/:group', async (req, res) => {
    try {
        const group = decodeURIComponent(req.params.group);
        const docs = await store.getDocumentsByBatchGroup(group);
        res.json(docs);
    } catch (err) {
        console.error('Error fetching batch group:', err);
        res.status(500).json({ error: err.message });
    }
});

// Save received quote prices on an RFQ
router.patch('/:id/quote-prices', async (req, res) => {
    try {
        const { prices } = req.body; // Array of { line_number, quoted_price }
        if (!Array.isArray(prices)) return res.status(400).json({ error: 'Missing prices array' });

        const doc = await store.getDocumentById(req.params.id);
        if (!doc) return res.status(404).json({ error: 'Document not found' });

        // Merge quoted prices into existing line items
        const updatedItems = (doc.line_items || []).map(item => {
            const priceEntry = prices.find(p => p.line_number === item.line_number);
            if (priceEntry) {
                return { ...item, quoted_price: priceEntry.quoted_price || 0 };
            }
            return item;
        });

        await store.updateDocument(req.params.id, { status: doc.status }, updatedItems);
        const updated = await store.getDocumentById(req.params.id);
        res.json(updated);
    } catch (err) {
        console.error('Error saving quote prices:', err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
