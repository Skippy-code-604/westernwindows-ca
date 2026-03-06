const express = require('express');
const router = express.Router();
const { queries } = require('../db');
const { requireAuth } = require('../auth');

router.use(requireAuth);

router.get('/', (req, res) => {
    const suppliers = queries.getAllSuppliers.all();
    res.json(suppliers);
});

router.get('/type/:type', (req, res) => {
    const suppliers = queries.getSuppliersByType.all(req.params.type);
    res.json(suppliers);
});

router.get('/:id', (req, res) => {
    const supplier = queries.getSupplierById.get(req.params.id);
    if (!supplier) return res.status(404).json({ error: 'Supplier not found' });
    res.json(supplier);
});

module.exports = router;
