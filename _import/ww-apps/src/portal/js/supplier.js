// ---- Supplier Selection Page Logic ----

let selectedSuppliers = new Set();
let docType = 'RFQ';

document.addEventListener('DOMContentLoaded', async () => {
    if (!(await checkAuth())) return;
    setupLogout();

    docType = getUrlParam('type') || 'RFQ';
    const isRFQ = docType === 'RFQ';

    document.getElementById('page-title').textContent = isRFQ
        ? 'Select Supplier for RFQ'
        : 'Select Supplier for Purchase Order';
    document.getElementById('page-subtitle').textContent = isRFQ
        ? 'Who do you want to request a quote from?'
        : 'Who are you placing an order with?';

    // Load suppliers
    try {
        const res = await apiFetch('/suppliers');
        if (!res || !res.ok) return;
        const suppliers = await res.json();

        const glassContainer = document.getElementById('glass-suppliers');
        const windowContainer = document.getElementById('window-suppliers');

        const glassSuppliers = suppliers.filter(s => s.type === 'glass');
        const windowSuppliers = suppliers.filter(s => s.type === 'window');

        glassContainer.innerHTML = glassSuppliers.map(s => supplierCardHTML(s, docType)).join('');
        windowContainer.innerHTML = windowSuppliers.map(s => supplierCardHTML(s, docType)).join('');

        // Add click handlers
        document.querySelectorAll('.supplier-card').forEach(card => {
            card.addEventListener('click', (e) => {
                // For RFQ: toggle multi-select; for PO: navigate directly
                if (isRFQ) {
                    e.preventDefault();
                    const supplierId = card.dataset.id;
                    if (selectedSuppliers.has(supplierId)) {
                        selectedSuppliers.delete(supplierId);
                        card.classList.remove('supplier-selected');
                    } else {
                        selectedSuppliers.add(supplierId);
                        card.classList.add('supplier-selected');
                    }
                    updateMultiSelectUI();
                } else {
                    const supplierId = card.dataset.id;
                    window.location.href = `/portal/form.html?type=${docType}&supplier=${supplierId}`;
                }
            });
        });

        // Insert multi-select action bar for RFQs
        if (isRFQ) {
            insertMultiSelectBar();
        }

    } catch (err) {
        console.error('Error loading suppliers:', err);
        showToast('Error loading suppliers', 'error');
    }
});

function insertMultiSelectBar() {
    const bar = document.createElement('div');
    bar.id = 'multi-select-bar';
    bar.className = 'multi-select-bar hidden';
    bar.innerHTML = `
        <div class="multi-select-info">
            <span id="selected-count">0</span> suppliers selected
        </div>
        <div class="multi-select-actions">
            <button class="btn btn-outline btn-sm" id="clear-selection-btn">Clear</button>
            <button class="btn btn-accent btn-sm" id="start-multi-rfq-btn">📝 Start Multi-Supplier RFQ</button>
        </div>
    `;

    // Insert after the page header
    const header = document.querySelector('.page-header') || document.querySelector('.content-header');
    if (header) {
        header.after(bar);
    } else {
        document.querySelector('main').prepend(bar);
    }

    document.getElementById('clear-selection-btn').addEventListener('click', () => {
        selectedSuppliers.clear();
        document.querySelectorAll('.supplier-selected').forEach(c => c.classList.remove('supplier-selected'));
        updateMultiSelectUI();
    });

    document.getElementById('start-multi-rfq-btn').addEventListener('click', () => {
        if (selectedSuppliers.size === 0) {
            showToast('Select at least one supplier', 'warning');
            return;
        }
        if (selectedSuppliers.size === 1) {
            // Single supplier — use normal flow
            const id = [...selectedSuppliers][0];
            window.location.href = `/portal/form.html?type=RFQ&supplier=${id}`;
        } else {
            // Multi-supplier — pass all IDs
            const ids = [...selectedSuppliers].join(',');
            window.location.href = `/portal/form.html?type=RFQ&suppliers=${ids}`;
        }
    });
}

function updateMultiSelectUI() {
    const bar = document.getElementById('multi-select-bar');
    const count = selectedSuppliers.size;

    if (count > 0) {
        bar.classList.remove('hidden');
        document.getElementById('selected-count').textContent = count;
        document.getElementById('start-multi-rfq-btn').textContent =
            count === 1 ? '📝 Start RFQ' : `📝 Start Multi-Supplier RFQ (${count})`;
    } else {
        bar.classList.add('hidden');
    }
}

function supplierCardHTML(supplier, docType) {
    const isRFQ = docType === 'RFQ';
    const email = isRFQ ? supplier.quote_email : supplier.order_email;
    const typeLabel = supplier.type === 'glass' ? 'Glass' : 'Windows & Doors';
    const typeClass = supplier.type === 'glass' ? 'supplier-type-glass' : 'supplier-type-window';

    return `
    <div class="card card-clickable supplier-card" data-id="${esc(supplier.id)}">
      ${isRFQ ? '<div class="supplier-check-icon">✓</div>' : ''}
      <span class="supplier-type-badge ${typeClass}">${esc(typeLabel)}</span>
      <div class="card-title">${esc(supplier.name)}</div>
      <div class="card-subtitle">${esc(email)}</div>
      ${supplier.contact_name ? `<div class="text-xs text-muted">Contact: ${esc(supplier.contact_name)}</div>` : ''}
    </div>
  `;
}
