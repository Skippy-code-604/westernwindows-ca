// ---- Supplier Selection Page Logic ----

document.addEventListener('DOMContentLoaded', async () => {
    if (!(await checkAuth())) return;
    setupLogout();

    const docType = getUrlParam('type') || 'RFQ';
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
            card.addEventListener('click', () => {
                const supplierId = card.dataset.id;
                window.location.href = `/portal/form.html?type=${docType}&supplier=${supplierId}`;
            });
        });

    } catch (err) {
        console.error('Error loading suppliers:', err);
        showToast('Error loading suppliers', 'error');
    }
});

function supplierCardHTML(supplier, docType) {
    const isRFQ = docType === 'RFQ';
    const email = isRFQ ? supplier.quote_email : supplier.order_email;
    const typeLabel = supplier.type === 'glass' ? 'Glass' : 'Windows & Doors';
    const typeClass = supplier.type === 'glass' ? 'supplier-type-glass' : 'supplier-type-window';

    return `
    <div class="card card-clickable supplier-card" data-id="${supplier.id}">
      <span class="supplier-type-badge ${typeClass}">${typeLabel}</span>
      <div class="card-title">${supplier.name}</div>
      <div class="card-subtitle">${email || ''}</div>
      ${supplier.contact_name ? `<div class="text-xs text-muted">Contact: ${supplier.contact_name}</div>` : ''}
    </div>
  `;
}
