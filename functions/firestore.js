let admin = null;
let db = null;
let storage = null;

function getAdmin() {
    if (!admin) {
        admin = require('firebase-admin');
        if (!admin.apps.length) {
            admin.initializeApp();
        }
    }
    return admin;
}

function getDb() {
    if (!db) {
        db = getAdmin().firestore();
    }
    return db;
}

function getStorage() {
    if (!storage) {
        storage = getAdmin().storage();
    }
    return storage;
}

// ---- SUPPLIERS ----

async function seedSuppliers() {
    const firestore = getDb();
    const suppliersRef = firestore.collection('suppliers');
    const snapshot = await suppliersRef.limit(1).get();

    if (!snapshot.empty) return; // Already seeded

    const suppliers = [
        { name: 'Old Castle Building Envelope (OBE)', type: 'glass', website: 'https://www.obe.com/', quote_email: 'lanquotes@obe.com', order_email: 'lanorders@obe.com', contact_name: null },
        { name: 'Hartung Glass / Lami Glass', type: 'glass', website: 'https://www.hartung-glass.com/locations/canada/', quote_email: 'bbyquotes@hartung-glass.com', order_email: 'burnaby.glass@hartung-glass.com', contact_name: null },
        { name: 'Garibaldi Glass', type: 'glass', website: 'https://www.garibaldiglass.com/', quote_email: 'sales@garibaldiglass.com', order_email: 'orders@garibaldiglass.com', contact_name: null },
        { name: 'Gentek', type: 'window', website: 'https://www.gentek.ca', quote_email: 'Blair_Gracie@gentek.ca', order_email: 'Blair_Gracie@gentek.ca', contact_name: 'Blair Gracie' },
        { name: 'Modern Windows', type: 'window', website: 'https://www.modern.ca', quote_email: 'maegan@modern.ca', order_email: 'maegan@modern.ca', contact_name: 'Maegan' },
    ];

    const a = getAdmin();
    const batch = firestore.batch();
    suppliers.forEach((s, idx) => {
        const ref = suppliersRef.doc(`supplier_${idx + 1}`);
        batch.set(ref, { ...s, created_at: a.firestore.FieldValue.serverTimestamp() });
    });
    await batch.commit();
    console.log('✅ Seeded 5 suppliers');
}

async function getAllSuppliers() {
    const snapshot = await getDb().collection('suppliers').get();
    const suppliers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    return suppliers.sort((a, b) => (a.type || '').localeCompare(b.type || '') || (a.name || '').localeCompare(b.name || ''));
}

async function getSupplierById(id) {
    const doc = await getDb().collection('suppliers').doc(id).get();
    if (!doc.exists) return null;
    return { id: doc.id, ...doc.data() };
}

async function getSuppliersByType(type) {
    const snapshot = await getDb().collection('suppliers')
        .where('type', '==', type)
        .orderBy('name')
        .get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

// ---- DOCUMENTS ----

async function getNextDocNumber(docType) {
    const db = getDb();
    const year = new Date().getFullYear();
    const prefix = docType === 'RFQ' ? 'RFQ' : 'PO';
    const counterRef = db.collection('counters').doc(`${prefix}-${year}`);

    const nextNum = await db.runTransaction(async (tx) => {
        const counterDoc = await tx.get(counterRef);

        let current = 0;
        if (counterDoc.exists) {
            current = counterDoc.data().last || 0;
        }

        const next = current + 1;
        tx.set(counterRef, { last: next, updated_at: new Date() });
        return next;
    });

    return `${prefix}-${year}-${String(nextNum).padStart(4, '0')}`;
}

async function createDocument(docData, lineItems) {
    const a = getAdmin();
    const supplier = await getSupplierById(docData.supplier_id);

    const doc = {
        doc_type: docData.doc_type,
        doc_number: docData.doc_number,
        status: docData.status || 'Draft',
        created_date: docData.created_date || new Date().toISOString().split('T')[0],
        required_date: docData.required_date || null,
        supplier_id: docData.supplier_id,
        supplier_name: supplier ? supplier.name : '',
        supplier_type: supplier ? supplier.type : '',
        quote_email: supplier ? supplier.quote_email : '',
        order_email: supplier ? supplier.order_email : '',
        contact_name: supplier ? supplier.contact_name : '',
        project_name: docData.project_name || null,
        job_address: docData.job_address || null,
        requested_by: docData.requested_by || 'Shane',
        shipping_method: docData.shipping_method || 'Delivery',
        notes: docData.notes || null,
        quote_reference: docData.quote_reference || null,
        order_confirmation: null,
        total_amount: docData.total_amount || 0,
        batch_group: docData.batch_group || null,
        converted_from_rfq: docData.converted_from_rfq || null,
        pdf_url: null,
        sent_at: null,
        created_at: a.firestore.FieldValue.serverTimestamp(),
        updated_at: a.firestore.FieldValue.serverTimestamp(),
        line_items: lineItems || [],
    };

    const ref = await getDb().collection('documents').add(doc);
    const created = await ref.get();
    return { id: ref.id, ...created.data() };
}

async function getDocumentById(id) {
    const doc = await getDb().collection('documents').doc(id).get();
    if (!doc.exists) return null;
    return { id: doc.id, ...doc.data() };
}

async function getDocumentByNumber(docNumber) {
    const snapshot = await getDb().collection('documents')
        .where('doc_number', '==', docNumber)
        .limit(1)
        .get();
    if (snapshot.empty) return null;
    const doc = snapshot.docs[0];
    return { id: doc.id, ...doc.data() };
}

async function updateDocument(id, docData, lineItems) {
    const a = getAdmin();
    const updateObj = {
        status: docData.status || 'Draft',
        required_date: docData.required_date || null,
        project_name: docData.project_name || null,
        job_address: docData.job_address || null,
        requested_by: docData.requested_by || 'Shane',
        shipping_method: docData.shipping_method || 'Delivery',
        notes: docData.notes || null,
        quote_reference: docData.quote_reference || null,
        total_amount: docData.total_amount || 0,
        updated_at: a.firestore.FieldValue.serverTimestamp(),
        line_items: lineItems || [],
    };

    await getDb().collection('documents').doc(id).update(updateObj);
    return getDocumentById(id);
}

async function updateDocumentStatus(id, status) {
    const a = getAdmin();
    const update = {
        status,
        updated_at: a.firestore.FieldValue.serverTimestamp(),
    };

    // Only set sent_at on first transition to Sent
    if (status === 'Sent') {
        const doc = await getDocumentById(id);
        if (doc && !doc.sent_at) {
            update.sent_at = a.firestore.FieldValue.serverTimestamp();
        }
    }

    // Track delivery timestamp
    if (status === 'Delivered') {
        update.delivered_at = a.firestore.FieldValue.serverTimestamp();
    }

    await getDb().collection('documents').doc(id).update(update);
}

async function updateOrderConfirmation(id, confirmation) {
    const a = getAdmin();
    await getDb().collection('documents').doc(id).update({
        order_confirmation: confirmation,
        updated_at: a.firestore.FieldValue.serverTimestamp(),
    });
}

async function updatePdfUrl(id, url) {
    const a = getAdmin();
    await getDb().collection('documents').doc(id).update({
        pdf_url: url,
        updated_at: a.firestore.FieldValue.serverTimestamp(),
    });
}

async function updateDriveUrl(id, url) {
    const a = getAdmin();
    await getDb().collection('documents').doc(id).update({
        drive_url: url,
        updated_at: a.firestore.FieldValue.serverTimestamp(),
    });
}

async function updateDocumentAttachments(id, attachments) {
    const a = getAdmin();
    await getDb().collection('documents').doc(id).update({
        attachments: attachments || [],
        updated_at: a.firestore.FieldValue.serverTimestamp(),
    });
}

async function getSupplierPriceHistory(supplierId, limit = 20) {
    const snapshot = await getDb().collection('documents')
        .where('supplier_id', '==', supplierId)
        .where('status', 'in', ['Sent', 'Quoted', 'Ordered', 'Delivered', 'Confirmed'])
        .orderBy('created_at', 'desc')
        .limit(limit)
        .get();

    // Build composite keys from structured line item fields
    const priceMap = {};
    snapshot.forEach(doc => {
        const data = doc.data();
        const lineItems = data.line_items || [];
        const docDate = data.created_at?.toDate?.() || new Date();

        lineItems.forEach(item => {
            const price = item.unit_price || item.quoted_price;
            if (!price || price <= 0) return;

            const parts = [];
            if (item.product_type) parts.push(item.product_type);
            if (item.glass_type) parts.push(item.glass_type);
            if (item.thickness) parts.push(item.thickness);
            if (item.series) parts.push(item.series);
            if (item.width && item.height) parts.push(`${item.width} x ${item.height}`);
            if (item.tint_coating) parts.push(item.tint_coating);
            if (item.product_category) parts.push(item.product_category);
            if (item.frame_color) parts.push(item.frame_color);

            if (parts.length === 0) return;

            const key = parts.join('|').toLowerCase();
            const label = parts.join(' - ');

            if (!priceMap[key] || new Date(priceMap[key].date) < docDate) {
                priceMap[key] = {
                    label,
                    price: Number(price),
                    qty: item.qty || 1,
                    date: docDate.toISOString(),
                    doc_number: data.doc_number,
                    doc_type: data.doc_type,
                };
            }
        });
    });

    return Object.values(priceMap).sort((a, b) => new Date(b.date) - new Date(a.date));
}

async function searchDocuments(filters) {
    let query = getDb().collection('documents');

    if (filters.doc_type) {
        query = query.where('doc_type', '==', filters.doc_type);
    }
    if (filters.supplier_id) {
        query = query.where('supplier_id', '==', filters.supplier_id);
    }
    if (filters.status) {
        query = query.where('status', '==', filters.status);
    }
    if (filters.date_from) {
        query = query.where('created_date', '>=', filters.date_from);
    }
    if (filters.date_to) {
        query = query.where('created_date', '<=', filters.date_to);
    }

    query = query.orderBy('created_date', 'desc').limit(100);

    const snapshot = await query.get();
    let docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    if (filters.search) {
        const term = filters.search.toLowerCase();
        docs = docs.filter(d =>
            (d.doc_number && d.doc_number.toLowerCase().includes(term)) ||
            (d.project_name && d.project_name.toLowerCase().includes(term)) ||
            (d.job_address && d.job_address.toLowerCase().includes(term)) ||
            (d.supplier_name && d.supplier_name.toLowerCase().includes(term))
        );
    }

    return docs;
}

async function getRecentDocuments(limit = 10) {
    const snapshot = await getDb().collection('documents')
        .orderBy('created_at', 'desc')
        .limit(limit)
        .get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

async function deleteDocument(id) {
    await getDb().collection('documents').doc(id).delete();
}

async function getDocumentsByBatchGroup(group) {
    const snapshot = await getDb().collection('documents')
        .where('batch_group', '==', group)
        .get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

module.exports = {
    getAdmin,
    getStorage,
    seedSuppliers,
    getAllSuppliers,
    getSupplierById,
    getSuppliersByType,
    getNextDocNumber,
    createDocument,
    getDocumentById,
    getDocumentByNumber,
    updateDocument,
    updateDocumentStatus,
    updateOrderConfirmation,
    updatePdfUrl,
    updateDriveUrl,
    updateDocumentAttachments,
    getSupplierPriceHistory,
    searchDocuments,
    getRecentDocuments,
    deleteDocument,
    getDocumentsByBatchGroup,
};
