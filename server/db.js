const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'data', 'portal.db');

// Ensure data directory exists
const fs = require('fs');
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(DB_PATH);

// Enable WAL mode for better concurrency
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS suppliers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('glass', 'window')),
    website TEXT,
    quote_email TEXT,
    order_email TEXT,
    contact_name TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    doc_type TEXT NOT NULL CHECK(doc_type IN ('RFQ', 'PO')),
    doc_number TEXT NOT NULL UNIQUE,
    status TEXT DEFAULT 'Draft' CHECK(status IN ('Draft', 'Sent', 'Confirmed', 'Cancelled')),
    created_date DATE DEFAULT (date('now')),
    required_date DATE,
    supplier_id INTEGER NOT NULL,
    project_name TEXT,
    job_address TEXT,
    requested_by TEXT DEFAULT 'Shane',
    shipping_method TEXT DEFAULT 'Delivery',
    notes TEXT,
    quote_reference TEXT,
    order_confirmation TEXT,
    total_amount REAL DEFAULT 0,
    pdf_path TEXT,
    sent_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
  );

  CREATE TABLE IF NOT EXISTS line_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    document_id INTEGER NOT NULL,
    line_number INTEGER NOT NULL,
    qty INTEGER DEFAULT 1,
    width TEXT,
    height TEXT,
    product_type TEXT,
    series TEXT,
    glass_type TEXT,
    thickness TEXT,
    tint_coating TEXT,
    is_igu INTEGER DEFAULT 0,
    igu_config TEXT,
    spacer_type TEXT,
    gas_fill TEXT,
    shape TEXT,
    edge_work TEXT,
    holes_cutouts TEXT,
    frit_pattern TEXT,
    product_category TEXT,
    application_type TEXT,
    frame_color TEXT,
    grid_pattern TEXT,
    grid_type TEXT,
    glass_package TEXT,
    tempered INTEGER DEFAULT 0,
    screen TEXT,
    hardware_color TEXT,
    operating_style TEXT,
    energy_star INTEGER DEFAULT 0,
    door_type TEXT,
    door_material TEXT,
    door_style TEXT,
    unit_price REAL DEFAULT 0,
    line_total REAL DEFAULT 0,
    notes TEXT,
    FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_documents_doc_number ON documents(doc_number);
  CREATE INDEX IF NOT EXISTS idx_documents_supplier ON documents(supplier_id);
  CREATE INDEX IF NOT EXISTS idx_documents_type ON documents(doc_type);
  CREATE INDEX IF NOT EXISTS idx_line_items_document ON line_items(document_id);
`);

// Seed suppliers if table is empty
const supplierCount = db.prepare('SELECT COUNT(*) as count FROM suppliers').get();
if (supplierCount.count === 0) {
  const insertSupplier = db.prepare(`
    INSERT INTO suppliers (name, type, website, quote_email, order_email, contact_name)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const suppliers = [
    ['Old Castle Building Envelope (OBE)', 'glass', 'https://www.obe.com/', 'lanquotes@obe.com', 'lanorders@obe.com', null],
    ['Hartung Glass / Lami Glass', 'glass', 'https://www.hartung-glass.com/locations/canada/', 'bbyquotes@hartung-glass.com', 'burnaby.glass@hartung-glass.com', null],
    ['Garibaldi Glass', 'glass', 'https://www.garibaldiglass.com/', 'sales@garibaldiglass.com', 'orders@garibaldiglass.com', null],
    ['Gentek', 'window', 'https://www.gentek.ca', 'Blair_Gracie@gentek.ca', 'Blair_Gracie@gentek.ca', 'Blair Gracie'],
    ['Modern Windows', 'window', 'https://www.modern.ca', 'maegan@modern.ca', 'maegan@modern.ca', 'Maegan'],
  ];

  const seedMany = db.transaction(() => {
    for (const s of suppliers) {
      insertSupplier.run(...s);
    }
  });
  seedMany();
  console.log('✅ Seeded 5 suppliers');
}

// Helper functions
const queries = {
  // Suppliers
  getAllSuppliers: db.prepare('SELECT * FROM suppliers ORDER BY type, name'),
  getSupplierById: db.prepare('SELECT * FROM suppliers WHERE id = ?'),
  getSuppliersByType: db.prepare('SELECT * FROM suppliers WHERE type = ? ORDER BY name'),

  // Documents
  getNextDocNumber: (docType) => {
    const year = new Date().getFullYear();
    const prefix = docType === 'RFQ' ? 'RFQ' : 'PO';
    const pattern = `${prefix}-${year}-%`;
    const last = db.prepare(
      `SELECT doc_number FROM documents WHERE doc_number LIKE ? ORDER BY doc_number DESC LIMIT 1`
    ).get(pattern);

    if (!last) return `${prefix}-${year}-0001`;
    const lastNum = parseInt(last.doc_number.split('-')[2], 10);
    return `${prefix}-${year}-${String(lastNum + 1).padStart(4, '0')}`;
  },

  createDocument: db.prepare(`
    INSERT INTO documents (doc_type, doc_number, status, created_date, required_date, supplier_id, project_name, job_address, requested_by, shipping_method, notes, quote_reference, total_amount)
    VALUES (@doc_type, @doc_number, @status, @created_date, @required_date, @supplier_id, @project_name, @job_address, @requested_by, @shipping_method, @notes, @quote_reference, @total_amount)
  `),

  getDocumentById: db.prepare(`
    SELECT d.*, s.name as supplier_name, s.type as supplier_type, s.quote_email, s.order_email, s.contact_name
    FROM documents d
    JOIN suppliers s ON d.supplier_id = s.id
    WHERE d.id = ?
  `),

  getDocumentByNumber: db.prepare(`
    SELECT d.*, s.name as supplier_name, s.type as supplier_type, s.quote_email, s.order_email, s.contact_name
    FROM documents d
    JOIN suppliers s ON d.supplier_id = s.id
    WHERE d.doc_number = ?
  `),

  updateDocument: db.prepare(`
    UPDATE documents SET
      status = @status, required_date = @required_date, project_name = @project_name,
      job_address = @job_address, requested_by = @requested_by, shipping_method = @shipping_method,
      notes = @notes, quote_reference = @quote_reference, total_amount = @total_amount, updated_at = CURRENT_TIMESTAMP
    WHERE id = @id
  `),

  updateDocumentStatus: db.prepare('UPDATE documents SET status = ?, sent_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?'),

  updateOrderConfirmation: db.prepare('UPDATE documents SET order_confirmation = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'),

  updatePdfPath: db.prepare('UPDATE documents SET pdf_path = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'),

  searchDocuments: (filters) => {
    let sql = `
      SELECT d.*, s.name as supplier_name, s.type as supplier_type
      FROM documents d
      JOIN suppliers s ON d.supplier_id = s.id
      WHERE 1=1
    `;
    const params = [];

    if (filters.doc_type) {
      sql += ' AND d.doc_type = ?';
      params.push(filters.doc_type);
    }
    if (filters.supplier_id) {
      sql += ' AND d.supplier_id = ?';
      params.push(filters.supplier_id);
    }
    if (filters.status) {
      sql += ' AND d.status = ?';
      params.push(filters.status);
    }
    if (filters.search) {
      sql += ' AND (d.doc_number LIKE ? OR d.project_name LIKE ? OR d.job_address LIKE ?)';
      const term = `%${filters.search}%`;
      params.push(term, term, term);
    }
    if (filters.date_from) {
      sql += ' AND d.created_date >= ?';
      params.push(filters.date_from);
    }
    if (filters.date_to) {
      sql += ' AND d.created_date <= ?';
      params.push(filters.date_to);
    }

    sql += ' ORDER BY d.created_at DESC LIMIT 100';
    return db.prepare(sql).all(...params);
  },

  getRecentDocuments: db.prepare(`
    SELECT d.*, s.name as supplier_name, s.type as supplier_type
    FROM documents d
    JOIN suppliers s ON d.supplier_id = s.id
    ORDER BY d.created_at DESC
    LIMIT 10
  `),

  deleteDocument: db.prepare('DELETE FROM documents WHERE id = ?'),

  // Line Items
  addLineItem: db.prepare(`
    INSERT INTO line_items (
      document_id, line_number, qty, width, height, product_type, series,
      glass_type, thickness, tint_coating, is_igu, igu_config, spacer_type, gas_fill,
      shape, edge_work, holes_cutouts, frit_pattern, product_category, application_type,
      frame_color, grid_pattern, grid_type, glass_package, tempered, screen,
      hardware_color, operating_style, energy_star, door_type, door_material, door_style,
      unit_price, line_total, notes
    ) VALUES (
      @document_id, @line_number, @qty, @width, @height, @product_type, @series,
      @glass_type, @thickness, @tint_coating, @is_igu, @igu_config, @spacer_type, @gas_fill,
      @shape, @edge_work, @holes_cutouts, @frit_pattern, @product_category, @application_type,
      @frame_color, @grid_pattern, @grid_type, @glass_package, @tempered, @screen,
      @hardware_color, @operating_style, @energy_star, @door_type, @door_material, @door_style,
      @unit_price, @line_total, @notes
    )
  `),

  getLineItems: db.prepare('SELECT * FROM line_items WHERE document_id = ? ORDER BY line_number'),

  deleteLineItems: db.prepare('DELETE FROM line_items WHERE document_id = ?'),
};

// Transaction helpers
queries.createDocumentWithItems = (docData, lineItems) => {
  const transaction = db.transaction(() => {
    const result = queries.createDocument.run(docData);
    const docId = result.lastInsertRowid;

    for (const item of lineItems) {
      item.document_id = docId;
      queries.addLineItem.run(item);
    }

    return docId;
  });
  return transaction();
};

queries.updateDocumentWithItems = (docId, docData, lineItems) => {
  const transaction = db.transaction(() => {
    docData.id = docId;
    queries.updateDocument.run(docData);
    queries.deleteLineItems.run(docId);

    for (const item of lineItems) {
      item.document_id = docId;
      queries.addLineItem.run(item);
    }
  });
  return transaction();
};

module.exports = { db, queries };
