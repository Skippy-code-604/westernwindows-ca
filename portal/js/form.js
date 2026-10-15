// ---- Form Page Logic (RFQ / PO) ----

let currentSupplier = null;
let currentDocType = null;
let lineItemCount = 0;
let editingDocId = null;
let multiSupplierIds = []; // For multi-supplier RFQ
let multiSuppliers = [];   // Full supplier objects

document.addEventListener('DOMContentLoaded', async () => {
  if (!(await checkAuth())) return;
  setupLogout();

  currentDocType = getUrlParam('type') || 'RFQ';
  const supplierId = getUrlParam('supplier');
  const suppliersParam = getUrlParam('suppliers'); // comma-separated IDs
  editingDocId = getUrlParam('edit');

  // Set today's date
  document.getElementById('doc-date').value = new Date().toISOString().split('T')[0];

  // Restore remembered "Requested By" name
  const savedRequestedBy = localStorage.getItem('ww_requested_by');
  if (savedRequestedBy) {
    document.getElementById('requested-by').value = savedRequestedBy;
  }

  // Update doc type badge
  const typeBadgeEl = document.getElementById('doc-type-badge');
  typeBadgeEl.textContent = currentDocType;
  typeBadgeEl.className = `badge badge-${currentDocType.toLowerCase()}`;

  document.getElementById('doc-type').value = currentDocType;

  // Show/hide quote reference field for POs
  const quoteRefGroup = document.getElementById('quote-reference-group');
  if (quoteRefGroup) {
    quoteRefGroup.style.display = currentDocType === 'PO' ? 'block' : 'none';
  }

  const duplicateDocId = getUrlParam('duplicate');

  if (editingDocId) {
    await loadExistingDocument(editingDocId);
  } else if (duplicateDocId) {
    await loadExistingDocument(duplicateDocId);
    // Clear edit state so save creates a new document
    editingDocId = null;
    // Assign a fresh doc number
    await assignDocNumber();
    // Update title and date for the copy
    document.getElementById('page-title').textContent = `New ${currentDocType} — Copy`;
    document.getElementById('doc-date').value = new Date().toISOString().split('T')[0];
  } else if (suppliersParam) {
    // Multi-supplier RFQ mode
    multiSupplierIds = suppliersParam.split(',').filter(Boolean);
    await loadMultiSuppliers(multiSupplierIds);
    addLineItem();
  } else if (supplierId) {
    await loadSupplier(supplierId);
    await assignDocNumber();
    addLineItem(); // Start with one empty line
  }

  // Event listeners
  document.getElementById('add-line-btn').addEventListener('click', addLineItem);
  document.getElementById('save-draft-btn').addEventListener('click', saveDraft);
  document.getElementById('preview-btn').addEventListener('click', previewAndSend);

  // Price history panel toggle
  const phToggle = document.getElementById('price-history-toggle');
  if (phToggle) {
    phToggle.addEventListener('click', () => {
      const body = document.getElementById('price-history-body');
      const chevron = document.getElementById('price-history-chevron');
      const isOpen = body.style.display !== 'none';
      body.style.display = isOpen ? 'none' : 'block';
      chevron.textContent = isOpen ? '▼' : '▲';
    });
  }

  // Load price history for POs
  if (currentDocType === 'PO' && currentSupplier) {
    loadPriceHistory(currentSupplier.id);
  }
});

async function loadSupplier(id) {
  const res = await apiFetch(`/suppliers/${id}`);
  if (!res || !res.ok) return;
  currentSupplier = await res.json();

  document.getElementById('supplier-name').value = currentSupplier.name;
  document.getElementById('supplier-id').value = currentSupplier.id;
  document.getElementById('supplier-type').value = currentSupplier.type;

  const isRFQ = currentDocType === 'RFQ';
  document.getElementById('page-title').textContent = isRFQ
    ? `New RFQ — ${currentSupplier.name}`
    : `New PO — ${currentSupplier.name}`;
  document.getElementById('page-subtitle').textContent = isRFQ
    ? 'Request a quote from this supplier'
    : 'Create a purchase order for this supplier';
}

async function loadPriceHistory(supplierId) {
  try {
    const res = await apiFetch(`/suppliers/${supplierId}/price-history`);
    if (!res || !res.ok) return;
    const data = await res.json();
    const prices = data.prices || [];
    if (prices.length === 0) return;

    // Show the panel
    const card = document.getElementById('price-history-card');
    if (card) card.style.display = 'block';

    // Render price rows
    const list = document.getElementById('price-history-list');
    if (!list) return;

    list.innerHTML = `
      <table class="price-history-table">
        <thead>
          <tr>
            <th>Item</th>
            <th>Qty</th>
            <th>Price</th>
            <th>Document</th>
            <th>Date</th>
          </tr>
        </thead>
        <tbody>
          ${prices.map(p => `
            <tr>
              <td class="ph-label">${p.label}</td>
              <td>${p.qty}</td>
              <td class="ph-price">$${p.price.toFixed(2)}</td>
              <td><span class="badge badge-${p.doc_type.toLowerCase()}">${p.doc_number}</span></td>
              <td class="text-muted">${new Date(p.date).toLocaleDateString('en-CA')}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  } catch (err) {
    console.warn('Could not load price history:', err);
  }
}

async function loadMultiSuppliers(ids) {
  multiSuppliers = [];
  for (const id of ids) {
    const res = await apiFetch(`/suppliers/${id}`);
    if (res && res.ok) {
      multiSuppliers.push(await res.json());
    }
  }

  if (multiSuppliers.length === 0) return;

  // Use the first supplier for line item field rendering (determines glass vs window fields)
  currentSupplier = multiSuppliers[0];
  document.getElementById('supplier-name').value = 'Multiple Suppliers';
  document.getElementById('supplier-id').value = currentSupplier.id;
  document.getElementById('supplier-type').value = currentSupplier.type;

  // Hide doc number (batch will assign individual numbers)
  document.getElementById('doc-number').value = '(auto-assigned)';
  document.getElementById('doc-number').readOnly = true;

  document.getElementById('page-title').textContent = `Multi-Supplier RFQ`;
  document.getElementById('page-subtitle').textContent =
    multiSuppliers.map(s => s.name).join(', ');

  // Show a banner
  const banner = document.createElement('div');
  banner.className = 'multi-supplier-banner';
  banner.innerHTML = `
    <strong>📋 Multi-Supplier RFQ</strong> — This RFQ will be sent to <strong>${multiSuppliers.length} suppliers</strong>:
    ${multiSuppliers.map(s => `<span class="badge badge-rfq" style="margin-left:6px;">${esc(s.name)}</span>`).join('')}
  `;
  const formEl = document.querySelector('.form-container') || document.querySelector('form') || document.querySelector('main');
  if (formEl) formEl.prepend(banner);
}

async function assignDocNumber() {
  const res = await apiFetch(`/documents/next-number/${currentDocType}`);
  if (!res || !res.ok) return;
  const data = await res.json();
  document.getElementById('doc-number').value = data.number;
}

async function loadExistingDocument(id) {
  const res = await apiFetch(`/documents/${id}`);
  if (!res || !res.ok) return;
  const { document: doc, lineItems } = await res.json();

  currentDocType = doc.doc_type;
  editingDocId = doc.id;

  // Update UI
  const typeBadgeEl = document.getElementById('doc-type-badge');
  typeBadgeEl.textContent = doc.doc_type;
  typeBadgeEl.className = `badge badge-${doc.doc_type.toLowerCase()}`;

  const statusBadgeEl = document.getElementById('doc-status-badge');
  statusBadgeEl.textContent = doc.status;
  statusBadgeEl.className = `badge badge-${doc.status.toLowerCase()}`;

  document.getElementById('doc-type').value = doc.doc_type;
  document.getElementById('doc-number').value = doc.doc_number;
  document.getElementById('doc-date').value = doc.created_date || '';
  document.getElementById('required-date').value = doc.required_date || '';
  document.getElementById('requested-by').value = doc.requested_by || 'Shane';
  document.getElementById('project-name').value = doc.project_name || '';
  document.getElementById('job-address').value = doc.job_address || '';
  document.getElementById('shipping-method').value = doc.shipping_method || 'Delivery';
  document.getElementById('notes').value = doc.notes || '';
  const quoteRefInput = document.getElementById('quote-reference');
  if (quoteRefInput) quoteRefInput.value = doc.quote_reference || '';

  // Load supplier
  currentSupplier = {
    id: doc.supplier_id,
    name: doc.supplier_name,
    type: doc.supplier_type,
  };
  document.getElementById('supplier-name').value = doc.supplier_name;
  document.getElementById('supplier-id').value = doc.supplier_id;
  document.getElementById('supplier-type').value = doc.supplier_type;

  document.getElementById('page-title').textContent = `Edit ${doc.doc_number}`;
  document.getElementById('page-subtitle').textContent = doc.supplier_name;

  // Show/hide quote reference + attachments for this doc type
  const quoteRefGroup = document.getElementById('quote-reference-group');
  if (quoteRefGroup) {
    quoteRefGroup.style.display = doc.doc_type === 'PO' ? 'block' : 'none';
  }

  // Load line items
  for (const item of lineItems) {
    addLineItem(item);
  }

  if (lineItems.length === 0) addLineItem();

  // Load existing attachments
  if (window.attachmentManager && doc.attachments) {
    window.attachmentManager.loadExisting(doc.attachments);
  }
}

// ---- Line Item Management ----

function addLineItem(existingData = null) {
  lineItemCount++;
  const container = document.getElementById('line-items-container');
  const supplierType = document.getElementById('supplier-type').value || (currentSupplier && currentSupplier.type) || 'glass';
  const isPO = currentDocType === 'PO';
  const num = lineItemCount;

  const div = document.createElement('div');
  div.className = 'line-item-row';
  div.dataset.line = num;

  let fieldsHTML = '';

  if (supplierType === 'glass') {
    fieldsHTML = buildGlassFields(num, existingData, isPO);
  } else {
    fieldsHTML = buildWindowFields(num, existingData, isPO);
  }

  div.innerHTML = `
    <span class="line-item-number">Line ${num}</span>
    <button type="button" class="line-item-remove" title="Remove line" data-line="${num}">✕</button>
    ${fieldsHTML}
  `;

  container.appendChild(div);

  // Remove handler
  div.querySelector('.line-item-remove').addEventListener('click', () => {
    div.remove();
    renumberLines();
  });

  // IGU toggle (for glass)
  const iguCheckbox = div.querySelector(`#igu-${num}`);
  if (iguCheckbox) {
    const iguFields = div.querySelector(`#igu-fields-${num}`);
    iguCheckbox.addEventListener('change', () => {
      iguFields.style.display = iguCheckbox.checked ? 'grid' : 'none';
    });
  }

  // Price calc (for POs)
  if (isPO) {
    const qtyInput = div.querySelector(`[name="qty_${num}"]`);
    const priceInput = div.querySelector(`[name="unit_price_${num}"]`);
    const totalSpan = div.querySelector(`#line-total-${num}`);
    const calcTotal = () => {
      const qty = parseFloat(qtyInput.value) || 0;
      const price = parseFloat(priceInput.value) || 0;
      totalSpan.textContent = `$${(qty * price).toFixed(2)}`;
    };
    if (qtyInput) qtyInput.addEventListener('input', calcTotal);
    if (priceInput) priceInput.addEventListener('input', calcTotal);
  }

  // Frame type toggle (for Modern reno flange size)
  const frameTypeSelect = div.querySelector(`#frame-type-${num}`);
  const renoSizeGroup = div.querySelector(`#reno-size-group-${num}`);
  if (frameTypeSelect && renoSizeGroup) {
    frameTypeSelect.addEventListener('change', () => {
      renoSizeGroup.style.display = frameTypeSelect.value === 'Stucco/Reno Flange' ? 'block' : 'none';
    });
  }
}

function buildGlassFields(num, data, isPO) {
  const d = data || {};
  const supplierName = currentSupplier ? currentSupplier.name : '';
  const isHartung = supplierName.includes('Hartung');
  const isGaribaldi = supplierName.includes('Garibaldi');
  const isOBE = supplierName.includes('Old Castle') || supplierName.includes('OBE');

  let extraField = '';
  if (isHartung || isOBE) {
    extraField = `
      <div class="form-group">
        <label class="form-label">Product Category</label>
        <select class="form-select" name="product_category_${num}">
          <option value="">Select...</option>
          <option value="Insulated Glass (IGU)" ${d.product_category === 'Insulated Glass (IGU)' ? 'selected' : ''}>Insulated Glass (IGU)</option>
          <option value="Tempered Glass" ${d.product_category === 'Tempered Glass' ? 'selected' : ''}>Tempered Glass</option>
          <option value="Laminated Glass" ${d.product_category === 'Laminated Glass' ? 'selected' : ''}>Laminated Glass</option>
          <option value="Shower Enclosure" ${d.product_category === 'Shower Enclosure' ? 'selected' : ''}>Shower Enclosure</option>
          <option value="Railing Glass" ${d.product_category === 'Railing Glass' ? 'selected' : ''}>Railing Glass</option>
          <option value="Entrance System" ${d.product_category === 'Entrance System' ? 'selected' : ''}>Entrance System</option>
          <option value="Mirror" ${d.product_category === 'Mirror' ? 'selected' : ''}>Mirror</option>
          <option value="Spandrel Glass" ${d.product_category === 'Spandrel Glass' ? 'selected' : ''}>Spandrel Glass</option>
          <option value="Security Glass" ${d.product_category === 'Security Glass' ? 'selected' : ''}>Security Glass</option>
          <option value="Printed/Frit Glass" ${d.product_category === 'Printed/Frit Glass' ? 'selected' : ''}>Printed / Frit Glass</option>
          <option value="Custom" ${d.product_category === 'Custom' ? 'selected' : ''}>Custom</option>
        </select>
      </div>
    `;
  }
  if (isGaribaldi) {
    extraField = `
      <div class="form-group">
        <label class="form-label">Application Type</label>
        <select class="form-select" name="application_type_${num}">
          <option value="">Select...</option>
          <option value="Structural" ${d.application_type === 'Structural' ? 'selected' : ''}>Structural</option>
          <option value="Architectural" ${d.application_type === 'Architectural' ? 'selected' : ''}>Architectural</option>
          <option value="Custom Fabrication" ${d.application_type === 'Custom Fabrication' ? 'selected' : ''}>Custom Fabrication</option>
          <option value="Triple Glazed" ${d.application_type === 'Triple Glazed' ? 'selected' : ''}>Triple Glazed</option>
          <option value="Point Supported" ${d.application_type === 'Point Supported' ? 'selected' : ''}>Point Supported</option>
          <option value="Frit/Ceramic" ${d.application_type === 'Frit/Ceramic' ? 'selected' : ''}>Frit / Ceramic</option>
        </select>
      </div>
    `;
  }

  const priceFields = isPO ? `
    <div class="form-group">
      <label class="form-label">Unit Price</label>
      <input type="number" step="0.01" class="form-input" name="unit_price_${num}" value="${d.unit_price || ''}" placeholder="0.00">
    </div>
    <div class="form-group">
      <label class="form-label">Line Total</label>
      <div class="form-input" style="background:transparent;border-color:transparent;font-weight:700;color:var(--amber);" id="line-total-${num}">
        ${d.line_total ? '$' + Number(d.line_total).toFixed(2) : '$0.00'}
      </div>
    </div>
  ` : '';

  return `
    <div class="form-row form-row-4" style="margin-top:8px;">
      <div class="form-group">
        <label class="form-label">Qty</label>
        <input type="number" class="form-input" name="qty_${num}" value="${d.qty || 1}" min="1">
      </div>
      <div class="form-group">
        <label class="form-label">Width</label>
        <input type="text" class="form-input" name="width_${num}" value="${d.width || ''}" placeholder='e.g. 36"'>
      </div>
      <div class="form-group">
        <label class="form-label">Height</label>
        <input type="text" class="form-input" name="height_${num}" value="${d.height || ''}" placeholder='e.g. 48"'>
      </div>
      <div class="form-group">
        <label class="form-label">Glass Type</label>
        <select class="form-select" name="glass_type_${num}">
          <option value="">Select...</option>
          <option value="Tempered" ${d.glass_type === 'Tempered' ? 'selected' : ''}>Tempered</option>
          <option value="Laminated" ${d.glass_type === 'Laminated' ? 'selected' : ''}>Laminated</option>
          <option value="Annealed" ${d.glass_type === 'Annealed' ? 'selected' : ''}>Annealed</option>
          <option value="Heat-Strengthened" ${d.glass_type === 'Heat-Strengthened' ? 'selected' : ''}>Heat-Strengthened</option>
        </select>
      </div>
    </div>
    <div class="form-row form-row-4">
      <div class="form-group">
        <label class="form-label">Thickness</label>
        <select class="form-select" name="thickness_${num}">
          <option value="">Select...</option>
          <option value="3mm" ${d.thickness === '3mm' ? 'selected' : ''}>3mm</option>
          <option value="4mm" ${d.thickness === '4mm' ? 'selected' : ''}>4mm</option>
          <option value="5mm" ${d.thickness === '5mm' ? 'selected' : ''}>5mm</option>
          <option value="6mm" ${d.thickness === '6mm' ? 'selected' : ''}>6mm</option>
          <option value="8mm" ${d.thickness === '8mm' ? 'selected' : ''}>8mm</option>
          <option value="10mm" ${d.thickness === '10mm' ? 'selected' : ''}>10mm</option>
          <option value="12mm" ${d.thickness === '12mm' ? 'selected' : ''}>12mm</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Tint / Coating</label>
        <select class="form-select" name="tint_coating_${num}">
          <option value="">Select...</option>
          <option value="Clear" ${d.tint_coating === 'Clear' ? 'selected' : ''}>Clear</option>
          <option value="Low-E" ${d.tint_coating === 'Low-E' ? 'selected' : ''}>Low-E</option>
          <option value="Grey Tint" ${d.tint_coating === 'Grey Tint' ? 'selected' : ''}>Grey Tint</option>
          <option value="Bronze Tint" ${d.tint_coating === 'Bronze Tint' ? 'selected' : ''}>Bronze Tint</option>
          <option value="Green Tint" ${d.tint_coating === 'Green Tint' ? 'selected' : ''}>Green Tint</option>
          <option value="Reflective" ${d.tint_coating === 'Reflective' ? 'selected' : ''}>Reflective</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Shape</label>
        <select class="form-select" name="shape_${num}">
          <option value="Rectangle" ${(!d.shape || d.shape === 'Rectangle') ? 'selected' : ''}>Rectangle</option>
          <option value="Circle" ${d.shape === 'Circle' ? 'selected' : ''}>Circle</option>
          <option value="Arch" ${d.shape === 'Arch' ? 'selected' : ''}>Arch</option>
          <option value="Triangle" ${d.shape === 'Triangle' ? 'selected' : ''}>Triangle</option>
          <option value="Custom" ${d.shape === 'Custom' ? 'selected' : ''}>Custom</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Edge Work</label>
        <select class="form-select" name="edge_work_${num}">
          <option value="">Select...</option>
          <option value="Flat Polish" ${d.edge_work === 'Flat Polish' ? 'selected' : ''}>Flat Polish</option>
          <option value="Pencil Polish" ${d.edge_work === 'Pencil Polish' ? 'selected' : ''}>Pencil Polish</option>
          <option value="Beveled" ${d.edge_work === 'Beveled' ? 'selected' : ''}>Beveled</option>
          <option value="Seamed" ${d.edge_work === 'Seamed' ? 'selected' : ''}>Seamed</option>
          <option value="None" ${d.edge_work === 'None' ? 'selected' : ''}>None</option>
        </select>
      </div>
    </div>
    ${extraField ? `<div class="form-row form-row-3">${extraField}
      <div class="form-group">
        <label class="form-label">Holes / Cutouts</label>
        <input type="text" class="form-input" name="holes_cutouts_${num}" value="${d.holes_cutouts || ''}" placeholder="Describe any holes or notches">
      </div>
      <div class="form-group">
        <label class="form-label">Ceramic Frit / Pattern</label>
        <input type="text" class="form-input" name="frit_pattern_${num}" value="${d.frit_pattern || ''}" placeholder="Pattern description">
      </div>
    </div>` : `<div class="form-row form-row-2">
      <div class="form-group">
        <label class="form-label">Holes / Cutouts</label>
        <input type="text" class="form-input" name="holes_cutouts_${num}" value="${d.holes_cutouts || ''}" placeholder="Describe any holes or notches">
      </div>
      <div class="form-group">
        <label class="form-label">Ceramic Frit / Pattern</label>
        <input type="text" class="form-input" name="frit_pattern_${num}" value="${d.frit_pattern || ''}" placeholder="Pattern description">
      </div>
    </div>`}
    <div class="form-row form-row-2">
      <div class="form-checkbox-group">
        <input type="checkbox" class="form-checkbox" id="igu-${num}" name="is_igu_${num}" ${d.is_igu ? 'checked' : ''}>
        <label for="igu-${num}" class="text-sm">Insulated Glass Unit (IGU)</label>
      </div>
      <div class="form-checkbox-group">
        <input type="checkbox" class="form-checkbox" name="tempered_${num}" ${d.tempered ? 'checked' : ''}>
        <label class="text-sm">Tempered</label>
      </div>
    </div>
    <div class="form-row form-row-3" id="igu-fields-${num}" style="display:${d.is_igu ? 'grid' : 'none'}; margin-top:8px;">
      <div class="form-group" style="grid-column: span 3;">
        <label class="form-label">IGU Configuration / Description</label>
        <textarea class="form-textarea" name="igu_config_${num}" rows="3" placeholder="e.g. 6mm Tempered / 12mm Argon Space / 6mm LoE Tempered&#10;Include overall makeup, coatings, spacer details, etc.">${d.igu_config || ''}</textarea>
      </div>
      <div class="form-group">
        <label class="form-label">Spacer Type</label>
        <select class="form-select" name="spacer_type_${num}">
          <option value="">Select...</option>
          <option value="SuperSpacer" ${d.spacer_type === 'SuperSpacer' ? 'selected' : ''}>SuperSpacer</option>
          <option value="Aluminum" ${d.spacer_type === 'Aluminum' ? 'selected' : ''}>Aluminum</option>
          <option value="Stainless Steel" ${d.spacer_type === 'Stainless Steel' ? 'selected' : ''}>Stainless Steel</option>
          <option value="Warm-Edge" ${d.spacer_type === 'Warm-Edge' ? 'selected' : ''}>Warm-Edge</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Gas Fill</label>
        <select class="form-select" name="gas_fill_${num}">
          <option value="">Select...</option>
          <option value="Air" ${d.gas_fill === 'Air' ? 'selected' : ''}>Air</option>
          <option value="Argon" ${d.gas_fill === 'Argon' ? 'selected' : ''}>Argon</option>
          <option value="Krypton" ${d.gas_fill === 'Krypton' ? 'selected' : ''}>Krypton</option>
        </select>
      </div>
    </div>
    ${isPO ? `<div class="form-row form-row-2" style="margin-top:8px;">${priceFields}</div>` : ''}
    <div class="form-group" style="margin-top:8px;">
      <label class="form-label">Line Notes</label>
      <input type="text" class="form-input" name="notes_${num}" value="${d.notes || ''}" placeholder="Additional notes for this line">
    </div>
  `;
}

function buildWindowFields(num, data, isPO) {
  const d = data || {};
  const supplierName = currentSupplier ? currentSupplier.name : '';
  const isGentek = supplierName.includes('Gentek');
  const isModern = supplierName.includes('Modern');

  const seriesOptions = isGentek
    ? `<option value="">Select...</option>
       <option value="70 Series" ${d.series === '70 Series' ? 'selected' : ''}>70 Series</option>
       <option value="80 Series" ${d.series === '80 Series' ? 'selected' : ''}>80 Series</option>`
    : `<option value="">Select...</option>
       <option value="Vinyl" ${d.series === 'Vinyl' ? 'selected' : ''}>Vinyl</option>
       <option value="Aluminum" ${d.series === 'Aluminum' ? 'selected' : ''}>Aluminum</option>
       <option value="Thermal-Break Aluminum" ${d.series === 'Thermal-Break Aluminum' ? 'selected' : ''}>Thermal-Break Aluminum</option>`;

  const glassPackageOptions = isGentek
    ? `<option value="">Select...</option>
       <option value="Standard" ${d.glass_package === 'Standard' ? 'selected' : ''}>Standard</option>
       <option value="BarrierXP" ${d.glass_package === 'BarrierXP' ? 'selected' : ''}>BarrierXP</option>
       <option value="BarrierXP TK2" ${d.glass_package === 'BarrierXP TK2' ? 'selected' : ''}>BarrierXP TK2</option>
       <option value="BarrierXP TK2 Plus" ${d.glass_package === 'BarrierXP TK2 Plus' ? 'selected' : ''}>BarrierXP TK2 Plus</option>
       <option value="BarrierXP PriME" ${d.glass_package === 'BarrierXP PriME' ? 'selected' : ''}>BarrierXP PriME</option>`
    : `<option value="">Select...</option>
       <option value="Standard" ${d.glass_package === 'Standard' ? 'selected' : ''}>Standard</option>
       <option value="Low-E" ${d.glass_package === 'Low-E' ? 'selected' : ''}>Low-E</option>
       <option value="Double-pane" ${d.glass_package === 'Double-pane' ? 'selected' : ''}>Double-pane</option>
       <option value="Triple-pane" ${d.glass_package === 'Triple-pane' ? 'selected' : ''}>Triple-pane</option>`;

  const doorFields = isModern ? `
    <div class="form-row form-row-3" id="door-fields-${num}" style="display:none; margin-top:8px;">
      <div class="form-group">
        <label class="form-label">Door Type</label>
        <select class="form-select" name="door_type_${num}">
          <option value="">Select...</option>
          <option value="Entry" ${d.door_type === 'Entry' ? 'selected' : ''}>Entry</option>
          <option value="Patio Sliding" ${d.door_type === 'Patio Sliding' ? 'selected' : ''}>Patio Sliding</option>
          <option value="French" ${d.door_type === 'French' ? 'selected' : ''}>French</option>
          <option value="Folding" ${d.door_type === 'Folding' ? 'selected' : ''}>Folding</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Door Material</label>
        <select class="form-select" name="door_material_${num}">
          <option value="">Select...</option>
          <option value="Fiberglass" ${d.door_material === 'Fiberglass' ? 'selected' : ''}>Fiberglass</option>
          <option value="Steel" ${d.door_material === 'Steel' ? 'selected' : ''}>Steel</option>
          <option value="Wood" ${d.door_material === 'Wood' ? 'selected' : ''}>Wood</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Door Style</label>
        <select class="form-select" name="door_style_${num}">
          <option value="">Select...</option>
          <option value="Slab" ${d.door_style === 'Slab' ? 'selected' : ''}>Slab</option>
          <option value="Pre-hung" ${d.door_style === 'Pre-hung' ? 'selected' : ''}>Pre-hung</option>
        </select>
      </div>
    </div>
  ` : '';

  const priceFields = isPO ? `
    <div class="form-group">
      <label class="form-label">Unit Price</label>
      <input type="number" step="0.01" class="form-input" name="unit_price_${num}" value="${d.unit_price || ''}" placeholder="0.00">
    </div>
    <div class="form-group">
      <label class="form-label">Line Total</label>
      <div class="form-input" style="background:transparent;border-color:transparent;font-weight:700;color:var(--amber);" id="line-total-${num}">
        ${d.line_total ? '$' + Number(d.line_total).toFixed(2) : '$0.00'}
      </div>
    </div>
  ` : '';

  return `
    <div class="form-row form-row-4" style="margin-top:8px;">
      <div class="form-group">
        <label class="form-label">Qty</label>
        <input type="number" class="form-input" name="qty_${num}" value="${d.qty || 1}" min="1">
      </div>
      <div class="form-group">
        <label class="form-label">Product Type</label>
        <select class="form-select" name="product_type_${num}" id="product-type-${num}">
          <option value="">Select...</option>
          <option value="Single Hung" ${d.product_type === 'Single Hung' ? 'selected' : ''}>Single Hung</option>
          <option value="Double Hung" ${d.product_type === 'Double Hung' ? 'selected' : ''}>Double Hung</option>
          <option value="Slider" ${d.product_type === 'Slider' ? 'selected' : ''}>Slider</option>
          <option value="Casement" ${d.product_type === 'Casement' ? 'selected' : ''}>Casement</option>
          <option value="Awning" ${d.product_type === 'Awning' ? 'selected' : ''}>Awning</option>
          <option value="Fixed" ${d.product_type === 'Fixed' ? 'selected' : ''}>Fixed</option>
          <option value="Patio Door" ${d.product_type === 'Patio Door' ? 'selected' : ''}>Patio Door</option>
          <option value="Entry Door" ${d.product_type === 'Entry Door' ? 'selected' : ''}>Entry Door</option>
          <option value="French Door" ${d.product_type === 'French Door' ? 'selected' : ''}>French Door</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Series</label>
        <select class="form-select" name="series_${num}">${seriesOptions}</select>
      </div>
      <div class="form-group">
        <label class="form-label">Width</label>
        <input type="text" class="form-input" name="width_${num}" value="${d.width || ''}" placeholder='e.g. 36"'>
      </div>
    </div>
    <div class="form-row form-row-4">
      <div class="form-group">
        <label class="form-label">Height</label>
        <input type="text" class="form-input" name="height_${num}" value="${d.height || ''}" placeholder='e.g. 48"'>
      </div>
      <div class="form-group">
        <label class="form-label">Frame Color</label>
        <select class="form-select" name="frame_color_${num}">
          <option value="">Select...</option>
          <option value="White" ${d.frame_color === 'White' ? 'selected' : ''}>White</option>
          <option value="Almond" ${d.frame_color === 'Almond' ? 'selected' : ''}>Almond</option>
          <option value="Driftwood" ${d.frame_color === 'Driftwood' ? 'selected' : ''}>Driftwood</option>
          <option value="Commercial Brown" ${d.frame_color === 'Commercial Brown' ? 'selected' : ''}>Commercial Brown</option>
          <option value="Black" ${d.frame_color === 'Black' ? 'selected' : ''}>Black</option>
          <option value="Custom" ${d.frame_color === 'Custom' ? 'selected' : ''}>Custom</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Glass Package</label>
        <select class="form-select" name="glass_package_${num}">${glassPackageOptions}</select>
      </div>
      <div class="form-group">
        <label class="form-label">Grid Pattern</label>
        <select class="form-select" name="grid_pattern_${num}">
          <option value="None" ${(!d.grid_pattern || d.grid_pattern === 'None') ? 'selected' : ''}>None</option>
          <option value="Colonial" ${d.grid_pattern === 'Colonial' ? 'selected' : ''}>Colonial</option>
          <option value="Prairie" ${d.grid_pattern === 'Prairie' ? 'selected' : ''}>Prairie</option>
          <option value="Custom" ${d.grid_pattern === 'Custom' ? 'selected' : ''}>Custom</option>
        </select>
      </div>
    </div>
    <div class="form-row form-row-4">
      <div class="form-group">
        <label class="form-label">Grid Type</label>
        <select class="form-select" name="grid_type_${num}">
          <option value="">N/A</option>
          <option value="GBG" ${d.grid_type === 'GBG' ? 'selected' : ''}>GBG (Between Glass)</option>
          <option value="SDL" ${d.grid_type === 'SDL' ? 'selected' : ''}>SDL (Simulated Divided)</option>
          <option value="Snap-In" ${d.grid_type === 'Snap-In' ? 'selected' : ''}>Snap-In</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Screen</label>
        <select class="form-select" name="screen_${num}">
          <option value="">Select...</option>
          <option value="Full" ${d.screen === 'Full' ? 'selected' : ''}>Full</option>
          <option value="Half" ${d.screen === 'Half' ? 'selected' : ''}>Half</option>
          <option value="None" ${d.screen === 'None' ? 'selected' : ''}>None</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Hardware Color</label>
        <select class="form-select" name="hardware_color_${num}">
          <option value="">Match Frame</option>
          <option value="White" ${d.hardware_color === 'White' ? 'selected' : ''}>White</option>
          <option value="Black" ${d.hardware_color === 'Black' ? 'selected' : ''}>Black</option>
          <option value="Brass" ${d.hardware_color === 'Brass' ? 'selected' : ''}>Brass</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Panel Config</label>
        <select class="form-select" name="operating_style_${num}">
          <option value="">N/A</option>
          <optgroup label="2 Panel">
            <option value="XO" ${d.operating_style === 'XO' ? 'selected' : ''}>XO</option>
            <option value="OX" ${d.operating_style === 'OX' ? 'selected' : ''}>OX</option>
          </optgroup>
          <optgroup label="3 Panel">
            <option value="XOO" ${d.operating_style === 'XOO' ? 'selected' : ''}>XOO</option>
            <option value="OOX" ${d.operating_style === 'OOX' ? 'selected' : ''}>OOX</option>
            <option value="OXO" ${d.operating_style === 'OXO' ? 'selected' : ''}>OXO</option>
            <option value="XOX" ${d.operating_style === 'XOX' ? 'selected' : ''}>XOX</option>
          </optgroup>
          <optgroup label="4 Panel">
            <option value="XOOX" ${d.operating_style === 'XOOX' ? 'selected' : ''}>XOOX</option>
            <option value="XOXO" ${d.operating_style === 'XOXO' ? 'selected' : ''}>XOXO</option>
            <option value="OXOX" ${d.operating_style === 'OXOX' ? 'selected' : ''}>OXOX</option>
            <option value="OXXO" ${d.operating_style === 'OXXO' ? 'selected' : ''}>OXXO</option>
            <option value="XXOO" ${d.operating_style === 'XXOO' ? 'selected' : ''}>XXOO</option>
            <option value="OOXX" ${d.operating_style === 'OOXX' ? 'selected' : ''}>OOXX</option>
          </optgroup>
        </select>
      </div>
    </div>
    <div class="form-row form-row-${isModern ? '3' : '2'}" style="margin-top:8px;">
      <div class="form-group">
        <label class="form-label">Frame Type</label>
        <select class="form-select" name="frame_type_${num}" id="frame-type-${num}">
          <option value="">Select...</option>
          <option value="Nail Flange" ${d.frame_type === 'Nail Flange' ? 'selected' : ''}>Nail Flange</option>
          <option value="Stucco/Reno Flange" ${d.frame_type === 'Stucco/Reno Flange' ? 'selected' : ''}>Stucco / Reno Flange</option>
          <option value="Block Frame" ${d.frame_type === 'Block Frame' ? 'selected' : ''}>Block Frame</option>
        </select>
      </div>
      ${isModern ? `<div class="form-group" id="reno-size-group-${num}" style="display:${d.frame_type === 'Stucco/Reno Flange' ? 'block' : 'none'};">
        <label class="form-label">Reno Flange Size</label>
        <input type="text" class="form-input" name="reno_flange_size_${num}" value="${d.reno_flange_size || ''}" placeholder='e.g. 2-3/4"'>
      </div>` : ''}
      <div class="form-checkbox-group" style="align-self:end; padding-bottom:10px;">
        <input type="checkbox" class="form-checkbox" name="tempered_${num}" ${d.tempered ? 'checked' : ''}>
        <label class="text-sm">Tempered Glass</label>
      </div>
    </div>
    <div class="form-row form-row-2">
      <div class="form-checkbox-group">
        <input type="checkbox" class="form-checkbox" name="energy_star_${num}" ${d.energy_star ? 'checked' : ''}>
        <label class="text-sm">Energy Star</label>
      </div>
    </div>
    ${doorFields}
    ${isPO ? `<div class="form-row form-row-2" style="margin-top:8px;">${priceFields}</div>` : ''}
    <div class="form-group" style="margin-top:8px;">
      <label class="form-label">Line Notes</label>
      <input type="text" class="form-input" name="notes_${num}" value="${d.notes || ''}" placeholder="Additional notes for this line">
    </div>
  `;
}

function renumberLines() {
  const rows = document.querySelectorAll('.line-item-row');
  rows.forEach((row, idx) => {
    const label = row.querySelector('.line-item-number');
    if (label) label.textContent = `Line ${idx + 1}`;
  });
}

// ---- Collect Form Data ----

function collectFormData() {
  const supplierType = document.getElementById('supplier-type').value;
  const isPO = currentDocType === 'PO';

  const quoteRefEl = document.getElementById('quote-reference');
  const docData = {
    doc_type: currentDocType,
    doc_number: document.getElementById('doc-number').value,
    status: 'Draft',
    created_date: document.getElementById('doc-date').value,
    required_date: document.getElementById('required-date').value || null,
    supplier_id: document.getElementById('supplier-id').value,
    project_name: document.getElementById('project-name').value,
    job_address: document.getElementById('job-address').value,
    requested_by: document.getElementById('requested-by').value || 'Shane',
    shipping_method: document.getElementById('shipping-method').value,
    notes: document.getElementById('notes').value,
    quote_reference: quoteRefEl ? quoteRefEl.value : null,
  };

  // Remember "Requested By" for next time
  if (docData.requested_by) {
    localStorage.setItem('ww_requested_by', docData.requested_by);
  }

  const lineItems = [];
  const rows = document.querySelectorAll('.line-item-row');

  rows.forEach((row, idx) => {
    const n = row.dataset.line;
    const getVal = (name) => {
      const el = row.querySelector(`[name="${name}_${n}"]`);
      return el ? el.value : null;
    };
    const getChecked = (name) => {
      const el = row.querySelector(`[name="${name}_${n}"]`);
      return el ? el.checked : false;
    };

    const item = {
      line_number: idx + 1,
      qty: parseInt(getVal('qty')) || 1,
      width: getVal('width'),
      height: getVal('height'),
      product_type: getVal('product_type'),
      series: getVal('series'),
      glass_type: getVal('glass_type'),
      thickness: getVal('thickness'),
      tint_coating: getVal('tint_coating'),
      is_igu: getChecked('is_igu'),
      igu_config: getVal('igu_config'),
      spacer_type: getVal('spacer_type'),
      gas_fill: getVal('gas_fill'),
      shape: getVal('shape'),
      edge_work: getVal('edge_work'),
      holes_cutouts: getVal('holes_cutouts'),
      frit_pattern: getVal('frit_pattern'),
      product_category: getVal('product_category'),
      application_type: getVal('application_type'),
      frame_color: getVal('frame_color'),
      grid_pattern: getVal('grid_pattern'),
      grid_type: getVal('grid_type'),
      glass_package: getVal('glass_package'),
      tempered: getChecked('tempered'),
      screen: getVal('screen'),
      hardware_color: getVal('hardware_color'),
      operating_style: getVal('operating_style'),
      energy_star: getChecked('energy_star'),
      door_type: getVal('door_type'),
      door_material: getVal('door_material'),
      door_style: getVal('door_style'),
      unit_price: parseFloat(getVal('unit_price')) || 0,
      frame_type: getVal('frame_type'),
      reno_flange_size: getVal('reno_flange_size'),
      notes: getVal('notes'),
    };

    item.line_total = item.qty * item.unit_price;
    lineItems.push(item);
  });

  return { document: docData, lineItems };
}

// ---- Save / Submit ----

async function saveDraft() {
  const data = collectFormData();
  data.document.status = 'Draft';

  try {
    let res;

    if (multiSupplierIds.length > 1) {
      // Multi-supplier batch save
      res = await apiFetch('/documents/batch', {
        method: 'POST',
        body: {
          document: data.document,
          lineItems: data.lineItems,
          supplier_ids: multiSupplierIds,
        },
      });

      if (!res || !res.ok) {
        const err = await res.json();
        showToast(err.error || 'Error saving', 'error');
        return;
      }

      const result = await res.json();
      showToast(`${result.documents.length} drafts saved!`, 'success');
      return;

    } else if (editingDocId) {
      res = await apiFetch(`/documents/${editingDocId}`, {
        method: 'PUT',
        body: data,
      });
    } else {
      res = await apiFetch('/documents', {
        method: 'POST',
        body: data,
      });
    }

    if (!res || !res.ok) {
      const err = await res.json();
      showToast(err.error || 'Error saving', 'error');
      return;
    }

    const result = await res.json();
    editingDocId = result.document.id;

    // Upload any pending quote attachments (PO only)
    if (window.attachmentManager && window.attachmentManager.hasPendingFiles()) {
      await window.attachmentManager.uploadPendingFiles(editingDocId);
      // Persist attachment metadata to the document
      await apiFetch(`/documents/${editingDocId}/attachments`, {
        method: 'PUT',
        body: { attachments: window.attachmentManager.getAttachments() },
      });
    }

    showToast('Draft saved successfully!', 'success');

  } catch (err) {
    console.error('Save error:', err);
    showToast('Error saving document', 'error');
  }
}

async function previewAndSend() {
  const data = collectFormData();
  data.document.status = 'Draft';

  try {
    let res;

    if (multiSupplierIds.length > 1) {
      // Multi-supplier batch create + preview
      res = await apiFetch('/documents/batch', {
        method: 'POST',
        body: {
          document: data.document,
          lineItems: data.lineItems,
          supplier_ids: multiSupplierIds,
        },
      });

      if (!res || !res.ok) {
        const err = await res.json();
        showToast(err.error || 'Error saving', 'error');
        return;
      }

      const result = await res.json();
      const ids = result.documents.map(d => d.id).join(',');

      // Navigate to batch preview
      window.location.href = `/portal/preview.html?ids=${ids}`;
      return;

    } else if (editingDocId) {
      res = await apiFetch(`/documents/${editingDocId}`, {
        method: 'PUT',
        body: data,
      });
    } else {
      res = await apiFetch('/documents', {
        method: 'POST',
        body: data,
      });
    }

    if (!res || !res.ok) {
      const err = await res.json();
      showToast(err.error || 'Error saving', 'error');
      return;
    }

    const result = await res.json();
    const docId = result.document.id;

    // Upload any pending quote attachments (PO only)
    if (window.attachmentManager && window.attachmentManager.hasPendingFiles()) {
      await window.attachmentManager.uploadPendingFiles(docId);
      // Persist attachment metadata to the document
      await apiFetch(`/documents/${docId}/attachments`, {
        method: 'PUT',
        body: { attachments: window.attachmentManager.getAttachments() },
      });
    }

    // Navigate to preview
    window.location.href = `/portal/preview.html?id=${docId}`;

  } catch (err) {
    console.error('Preview error:', err);
    showToast('Error preparing preview', 'error');
  }
}
