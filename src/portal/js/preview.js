// ---- Preview Page Logic ----

let currentDoc = null;

document.addEventListener('DOMContentLoaded', async () => {
    if (!(await checkAuth())) return;
    setupLogout();

    const docId = getUrlParam('id');
    if (!docId) {
        showToast('No document ID provided', 'error');
        return;
    }

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
});

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
