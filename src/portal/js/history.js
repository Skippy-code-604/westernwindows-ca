// ---- History Page Logic ----

let confirmationDocId = null;

document.addEventListener('DOMContentLoaded', async () => {
    if (!(await checkAuth())) return;
    setupLogout();

    // Load suppliers for filter dropdown
    await loadSupplierFilter();

    // Load all documents initially
    await searchDocuments();

    // Search button
    document.getElementById('search-btn').addEventListener('click', searchDocuments);

    // Enter key on search input
    document.getElementById('search-input').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') searchDocuments();
    });

    // Confirmation modal
    document.getElementById('cancel-confirmation-btn').addEventListener('click', closeConfirmationModal);
    document.getElementById('save-confirmation-btn').addEventListener('click', saveConfirmation);
});

async function loadSupplierFilter() {
    try {
        const res = await apiFetch('/suppliers');
        if (!res || !res.ok) return;
        const suppliers = await res.json();

        const select = document.getElementById('filter-supplier');
        for (const s of suppliers) {
            const opt = document.createElement('option');
            opt.value = s.id;
            opt.textContent = s.name;
            select.appendChild(opt);
        }
    } catch (err) {
        console.error('Error loading suppliers:', err);
    }
}

async function searchDocuments() {
    const params = new URLSearchParams();

    const search = document.getElementById('search-input').value;
    const docType = document.getElementById('filter-type').value;
    const supplierId = document.getElementById('filter-supplier').value;
    const status = document.getElementById('filter-status').value;
    const dateFrom = document.getElementById('filter-date-from').value;
    const dateTo = document.getElementById('filter-date-to').value;

    if (search) params.set('search', search);
    if (docType) params.set('doc_type', docType);
    if (supplierId) params.set('supplier_id', supplierId);
    if (status) params.set('status', status);
    if (dateFrom) params.set('date_from', dateFrom);
    if (dateTo) params.set('date_to', dateTo);

    try {
        const res = await apiFetch(`/documents?${params.toString()}`);
        if (!res || !res.ok) return;
        const docs = await res.json();

        renderResults(docs);
    } catch (err) {
        console.error('Search error:', err);
        showToast('Error searching documents', 'error');
    }
}

function renderResults(docs) {
    const tbody = document.getElementById('results-body');

    if (!docs || docs.length === 0) {
        tbody.innerHTML = `
      <tr>
        <td colspan="8" class="text-center text-muted" style="padding:32px;">
          No documents found matching your filters.
        </td>
      </tr>
    `;
        return;
    }

    tbody.innerHTML = docs.map(doc => `
    <tr>
      <td>${typeBadge(doc.doc_type)}</td>
      <td class="font-bold" style="white-space:nowrap;">${esc(doc.doc_number)}</td>
      <td style="white-space:nowrap;">${formatDate(doc.created_date)}</td>
      <td>${esc(doc.supplier_name)}</td>
      <td>${esc(doc.project_name) || '—'}</td>
      <td>${statusBadge(doc.status)}</td>
      <td style="white-space:nowrap;">${formatCurrency(doc.total_amount)}</td>
      <td>
        <div class="flex gap-1">
          <button class="btn btn-ghost btn-sm" onclick="viewDocument('${esc(doc.id)}')" title="View/Preview">👁️</button>
          <button class="btn btn-ghost btn-sm" onclick="editDocument('${esc(doc.id)}')" title="Edit">✏️</button>
          <button class="btn btn-ghost btn-sm" onclick="downloadDoc('${esc(doc.id)}')" title="Download PDF">📄</button>
          ${doc.batch_group ? `<button class="btn btn-ghost btn-sm" onclick="compareGroup('${esc(doc.batch_group)}')" title="Compare Quotes">📊</button>` : ''}
          ${doc.doc_type === 'PO' ? `<button class="btn btn-ghost btn-sm" onclick="openConfirmation('${esc(doc.id)}', '${esc(doc.doc_number)}')" title="Order Confirmation">📋</button>` : ''}
          <button class="btn btn-ghost btn-sm" onclick="deleteDocument('${esc(doc.id)}')" title="Delete" style="color:var(--danger);">🗑️</button>
        </div>
      </td>
    </tr>
  `).join('');
}

function viewDocument(id) {
    window.location.href = `/portal/preview.html?id=${id}`;
}

function compareGroup(group) {
    window.location.href = `/portal/compare.html?group=${encodeURIComponent(group)}`;
}

function editDocument(id) {
    window.location.href = `/portal/form.html?edit=${id}`;
}

async function downloadDoc(id) {
    try {
        const res = await apiFetch(`/email/pdf/${id}`);
        if (!res || !res.ok) throw new Error('Download failed');

        const arrayBuf = await res.arrayBuffer();
        const blob = new Blob([arrayBuf], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        // Get filename from Content-Disposition or default
        const disposition = res.headers.get('Content-Disposition');
        const match = disposition && disposition.match(/filename="(.+)"/);
        a.download = match ? match[1] : 'document.pdf';
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        showToast('PDF downloaded!', 'success');
    } catch (err) {
        console.error('Download error:', err);
        showToast('Error downloading PDF', 'error');
    }
}

async function deleteDocument(id) {
    if (!confirm('Are you sure you want to delete this document? This cannot be undone.')) return;

    try {
        const res = await apiFetch(`/documents/${id}`, { method: 'DELETE' });
        if (!res || !res.ok) {
            showToast('Error deleting document', 'error');
            return;
        }
        showToast('Document deleted', 'success');
        searchDocuments(); // Refresh
    } catch (err) {
        console.error('Delete error:', err);
        showToast('Error deleting document', 'error');
    }
}

function openConfirmation(docId, docNumber) {
    confirmationDocId = docId;
    document.getElementById('confirmation-doc-number').textContent = `Document: ${docNumber}`;
    document.getElementById('confirmation-text').value = '';
    document.getElementById('confirmation-modal').classList.remove('hidden');

    // Load existing confirmation if any
    apiFetch(`/documents/${docId}`).then(async (res) => {
        if (!res || !res.ok) return;
        const { document: doc } = await res.json();
        if (doc.order_confirmation) {
            document.getElementById('confirmation-text').value = doc.order_confirmation;
        }
    });
}

function closeConfirmationModal() {
    document.getElementById('confirmation-modal').classList.add('hidden');
    confirmationDocId = null;
}

async function saveConfirmation() {
    if (!confirmationDocId) return;

    const text = document.getElementById('confirmation-text').value;

    try {
        const res = await apiFetch(`/documents/${confirmationDocId}/confirmation`, {
            method: 'PATCH',
            body: { order_confirmation: text },
        });

        if (!res || !res.ok) {
            showToast('Error saving confirmation', 'error');
            return;
        }

        showToast('Order confirmation saved!', 'success');
        closeConfirmationModal();
        searchDocuments(); // Refresh
    } catch (err) {
        console.error('Confirmation error:', err);
        showToast('Error saving confirmation', 'error');
    }
}
