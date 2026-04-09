const express = require('express');
const router = express.Router();
const { requireAuth } = require('../auth');
const store = require('../firestore');

router.use(requireAuth);

// Get all suppliers
router.get('/', async (req, res) => {
    try {
        const type = req.query.type;
        const suppliers = type
            ? await store.getSuppliersByType(type)
            : await store.getAllSuppliers();
        res.json(suppliers);
    } catch (err) {
        console.error('Error fetching suppliers:', err);
        res.status(500).json({ error: err.message });
    }
});

// Get supplier price history (most recent prices per product)
router.get('/:id/price-history', async (req, res) => {
    try {
        const history = await store.getSupplierPriceHistory(req.params.id);
        res.json({ prices: history });
    } catch (err) {
        console.error('Price history error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Get supplier by ID
router.get('/:id', async (req, res) => {
    try {
        const supplier = await store.getSupplierById(req.params.id);
        if (!supplier) return res.status(404).json({ error: 'Supplier not found' });
        res.json(supplier);
    } catch (err) {
        console.error('Error fetching supplier:', err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
