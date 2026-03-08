// ---- Preview Page Logic ----

let currentDoc = null;
let batchDocs = [];   // For multi-supplier preview
let batchIds = [];

document.addEventListener('DOMContentLoaded', async () => {
    if (!(await checkAuth())) return;
    setupLogout();

    const docId = getUrlParam('id');
    const idsParam = getUrlParam('ids'); // comma-separated for batch

    if (idsParam) {
        // Multi-supplier batch preview
        batchIds = idsParam.split(',').filter(Boolean);
        await loadBatchDocuments(batchIds);
    } else if (docId) {
        await loadDocument(docId);

        document.getElementById('edit-btn').addEventListener('click', () => {
            window.location.href = `/portal/form.html?edit=${docId}`;
        });

        document.getElementById('download-btn').addEventListener('click', () => {
            downloadPDF(docId);
        });

        document.getElementById('send-btn').addEventListener('click', () => {
            sendToSupplier(docId);
        });

        document.getElementById('back-link').href = `/portal/form.html?edit=${docId}`;
    } else {
        showToast('No document ID provided', 'error');
    }
});

// ---- Single Document Preview ----

async function loadDocument(id) {
    try {
        const res = await apiFetch(`/documents/${id}`);
        if (!res || !res.ok) {
            showToast('Document not found', 'error');
            return;
        }

        const data = await res.json();
        currentDoc = data.document;

        // Update page headers
        document.getElementById('page-title').textContent = currentDoc.doc_number;
        document.getElementById('page-subtitle').textContent = `${currentDoc.supplier_name} — ${currentDoc.project_name || 'No project name'}`;

        const typeBadge = document.getElementById('doc-type-badge');
        typeBadge.textContent = currentDoc.doc_type;
        typeBadge.className = `badge badge-${currentDoc.doc_type.toLowerCase()}`;

        const statusBadge = document.getElementById('doc-status-badge');
        statusBadge.textContent = currentDoc.status;
        statusBadge.className = `badge badge-${currentDoc.status.toLowerCase()}`;

        // Load PDF preview with auth token
        try {
            const pdfRes = await apiFetch(`/email/pdf-preview/${id}`);
            if (pdfRes && pdfRes.ok) {
                const arrayBuf = await pdfRes.arrayBuffer();
                const blob = new Blob([arrayBuf], { type: 'application/pdf' });
                const blobUrl = URL.createObjectURL(blob);
                document.getElementById('pdf-preview').src = blobUrl;
            } else {
                document.getElementById('pdf-preview').style.display = 'none';
                showToast('Could not load PDF preview', 'warning');
            }
        } catch (pdfErr) {
            console.error('PDF preview error:', pdfErr);
            document.getElementById('pdf-preview').style.display = 'none';
            showToast('Could not load PDF preview', 'warning');
        }

        // Show send info
        const isRFQ = currentDoc.doc_type === 'RFQ';
        const targetEmail = isRFQ ? currentDoc.quote_email : currentDoc.order_email;
        document.getElementById('send-info').innerHTML = `
      <strong>Will send to:</strong> ${esc(targetEmail)}<br>
      <strong>CC:</strong> shane@westernwindows.ca<br>
      <strong>From:</strong> info@westernwindows.ca
    `;

        // Disable send if already sent
        if (currentDoc.status === 'Sent' || currentDoc.status === 'Confirmed') {
            document.getElementById('send-btn').innerHTML = '✅ Already Sent';
            document.getElementById('send-btn').classList.add('btn-outline');
            document.getElementById('send-btn').classList.remove('btn-accent');
        }

    } catch (err) {
        console.error('Error loading document:', err);
        showToast('Error loading document', 'error');
    }
}

// ---- Batch Preview (Multi-Supplier) ----

async function loadBatchDocuments(ids) {
    batchDocs = [];

    for (const id of ids) {
        try {
            const res = await apiFetch(`/documents/${id}`);
            if (res && res.ok) {
                const data = await res.json();
                batchDocs.push(data.document);
            }
        } catch (err) {
            console.error(`Error loading doc ${id}:`, err);
        }
    }

    if (batchDocs.length === 0) {
        showToast('No documents found', 'error');
        return;
    }

    // Update page headers for batch mode
    document.getElementById('page-title').textContent = 'Multi-Supplier RFQ Preview';
    document.getElementById('page-subtitle').textContent =
        batchDocs[0].project_name || 'Competitive Bid';

    const typeBadge = document.getElementById('doc-type-badge');
    typeBadge.textContent = 'RFQ';
    typeBadge.className = 'badge badge-rfq';

    const statusBadge = document.getElementById('doc-status-badge');
    statusBadge.textContent = `${batchDocs.length} Documents`;
    statusBadge.className = 'badge badge-draft';

    // Hide single-doc elements, show batch UI
    const pdfPreview = document.getElementById('pdf-preview');
    if (pdfPreview) pdfPreview.style.display = 'none';

    const sendInfo = document.getElementById('send-info');
    const actionsEl = document.querySelector('.preview-actions') || document.querySelector('.card-actions');

    // Build batch summary
    sendInfo.innerHTML = `
        <div class="batch-summary">
            <h3 style="margin-bottom:12px;">📋 Documents to Send</h3>
            ${batchDocs.map((doc, i) => `
                <div class="batch-doc-row" id="batch-row-${doc.id}">
                    <div class="batch-doc-info">
                        <strong>${esc(doc.doc_number)}</strong>
                        <span class="text-muted">→</span>
                        <strong>${esc(doc.supplier_name)}</strong>
                        <span class="text-xs text-muted">(${esc(doc.quote_email || doc.order_email || 'no email')})</span>
                    </div>
                    <div class="batch-doc-status">
                        <span class="badge badge-${doc.status.toLowerCase()}" id="batch-status-${doc.id}">${doc.status}</span>
                    </div>
                </div>
            `).join('')}
        </div>
    `;

    // Replace buttons
    const editBtn = document.getElementById('edit-btn');
    const downloadBtn = document.getElementById('download-btn');
    const sendBtn = document.getElementById('send-btn');
    const backLink = document.getElementById('back-link');

    if (editBtn) editBtn.style.display = 'none';
    if (downloadBtn) downloadBtn.style.display = 'none';
    if (backLink) backLink.href = `/portal/suppliers.html?type=RFQ`;

    if (sendBtn) {
        sendBtn.innerHTML = `📧 Send All (${batchDocs.length} suppliers)`;
        sendBtn.onclick = () => sendBatch(ids);
    }
}

async function sendBatch(ids) {
    const sendBtn = document.getElementById('send-btn');
    sendBtn.disabled = true;
    sendBtn.innerHTML = '<span class="spinner"></span> Sending...';

    try {
        const res = await apiFetch('/email/send-batch', {
            method: 'POST',
            body: { ids },
        });

        if (!res || !res.ok) {
            const err = await res.json();
            showToast(err.error || 'Batch send failed', 'error');
            sendBtn.disabled = false;
            sendBtn.innerHTML = `📧 Send All (${ids.length} suppliers)`;
            return;
        }

        const { results } = await res.json();

        let successCount = 0;
        let failCount = 0;

        for (const r of results) {
            const statusEl = document.getElementById(`batch-status-${r.id}`);
            const rowEl = document.getElementById(`batch-row-${r.id}`);

            if (r.success) {
                successCount++;
                if (statusEl) {
                    statusEl.textContent = 'Sent';
                    statusEl.className = 'badge badge-sent';
                }
                if (rowEl) rowEl.style.borderLeft = '3px solid var(--green, #22c55e)';
            } else {
                failCount++;
                if (statusEl) {
                    statusEl.textContent = 'Failed';
                    statusEl.className = 'badge badge-error';
                }
                if (rowEl) rowEl.style.borderLeft = '3px solid var(--red, #ef4444)';
            }
        }

        sendBtn.innerHTML = '✅ All Sent';
        sendBtn.classList.add('btn-outline');
        sendBtn.classList.remove('btn-accent');

        if (failCount > 0) {
            showToast(`${successCount} sent, ${failCount} failed`, 'warning');
        } else {
            showToast(`All ${successCount} RFQs sent successfully!`, 'success');
        }

        // Show result summary
        const resultDiv = document.getElementById('send-result');
        if (resultDiv) {
            resultDiv.classList.remove('hidden');
            resultDiv.innerHTML = `
                <div class="toast toast-success" style="position:static; animation:none;">
                    <span>✅</span>
                    <div>
                        <strong>${successCount} of ${results.length} RFQs sent</strong><br>
                        ${results.filter(r => r.success).map(r =>
                `<span class="text-xs">${esc(r.doc_number)} → ${esc(r.supplier_name)} (${esc(r.sent_to)})</span><br>`
            ).join('')}
                    </div>
                </div>
            `;
        }

    } catch (err) {
        console.error('Batch send error:', err);
        showToast('Error sending batch', 'error');
        sendBtn.disabled = false;
        sendBtn.innerHTML = `📧 Send All (${ids.length} suppliers)`;
    }
}

// ---- Single Document Actions ----

async function downloadPDF(id) {
    try {
        const res = await apiFetch(`/email/pdf/${id}`);
        if (!res || !res.ok) throw new Error('Download failed');

        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${currentDoc.doc_number}.pdf`;
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

async function sendToSupplier(id) {
    const sendBtn = document.getElementById('send-btn');
    sendBtn.disabled = true;
    sendBtn.innerHTML = '<span class="spinner"></span> Sending...';

    try {
        const res = await apiFetch(`/email/send/${id}`, { method: 'POST' });

        if (!res || !res.ok) {
            const err = await res.json();
            showToast(err.error || 'Send failed', 'error');
            sendBtn.disabled = false;
            sendBtn.innerHTML = '📧 Send to Supplier';
            return;
        }

        const result = await res.json();

        const resultDiv = document.getElementById('send-result');
        resultDiv.classList.remove('hidden');

        if (result.warning) {
            resultDiv.innerHTML = `
        <div class="toast toast-warning" style="position:static; animation:none;">
          <span>⚠️</span>
          <div>
            <strong>PDF saved but email not configured.</strong><br>
            <span class="text-xs">${esc(result.warning)}</span><br>
            <span class="text-xs">Would send to: ${esc(result.would_send_to)}</span>
          </div>
        </div>
      `;
            showToast('PDF saved! Email not yet configured.', 'warning');
        } else {
            resultDiv.innerHTML = `
        <div class="toast toast-success" style="position:static; animation:none;">
          <span>✅</span>
          <div>
            <strong>Email sent successfully!</strong><br>
            <span class="text-xs">To: ${esc(result.sent_to)} | CC: ${esc(result.cc)}</span>
          </div>
        </div>
      `;
            showToast('Email sent to supplier!', 'success');
        }

        sendBtn.innerHTML = '✅ Sent';
        sendBtn.classList.add('btn-outline');
        sendBtn.classList.remove('btn-accent');

        // Update status badge
        const statusBadge = document.getElementById('doc-status-badge');
        statusBadge.textContent = 'Sent';
        statusBadge.className = 'badge badge-sent';

    } catch (err) {
        console.error('Send error:', err);
        showToast('Error sending email', 'error');
        sendBtn.disabled = false;
        sendBtn.innerHTML = '📧 Send to Supplier';
    }
}
