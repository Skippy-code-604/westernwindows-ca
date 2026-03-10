// ---- Dashboard Page Logic ----

document.addEventListener('DOMContentLoaded', async () => {
  if (!(await checkAuth())) return;
  setupLogout();

  // Action card navigation
  document.getElementById('new-rfq-card').addEventListener('click', () => {
    window.location.href = '/portal/select-supplier.html?type=RFQ';
  });
  document.getElementById('new-po-card').addEventListener('click', () => {
    window.location.href = '/portal/select-supplier.html?type=PO';
  });
  document.getElementById('history-card').addEventListener('click', () => {
    window.location.href = '/portal/history.html';
  });

  // Load quick stats and recent activity
  loadStats();
  loadRecentActivity();
});

async function loadStats() {
  try {
    // Fetch all documents (same endpoint history uses, no filter = all)
    const res = await apiFetch('/documents');
    if (!res || !res.ok) return;
    const docs = await res.json();

    // Drafts pending
    const drafts = docs.filter(d => d.status === 'Draft').length;
    document.getElementById('stat-drafts').textContent = drafts;

    // RFQs sent (any status except Draft)
    const rfqsSent = docs.filter(d => d.doc_type === 'RFQ' && d.status === 'Sent').length;
    document.getElementById('stat-rfqs-sent').textContent = rfqsSent;

    // POs this month
    const now = new Date();
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    const posThisMonth = docs.filter(d =>
      d.doc_type === 'PO' && d.created_date >= monthStart
    );
    document.getElementById('stat-pos-month').textContent = posThisMonth.length;

    // Total PO value this month
    const totalValue = posThisMonth.reduce((sum, d) => sum + (d.total_amount || 0), 0);
    document.getElementById('stat-total-value').textContent =
      totalValue > 0 ? `$${totalValue.toLocaleString('en-CA', { minimumFractionDigits: 0 })}` : '$0';

    // Pipeline counts
    const statusCounts = { Draft: 0, Sent: 0, Quoted: 0, Ordered: 0, Delivered: 0 };
    for (const d of docs) {
      if (statusCounts.hasOwnProperty(d.status)) {
        statusCounts[d.status]++;
      }
    }
    document.getElementById('pipe-draft').textContent = statusCounts.Draft;
    document.getElementById('pipe-sent').textContent = statusCounts.Sent;
    document.getElementById('pipe-quoted').textContent = statusCounts.Quoted;
    document.getElementById('pipe-ordered').textContent = statusCounts.Ordered;
    document.getElementById('pipe-delivered').textContent = statusCounts.Delivered;

  } catch (err) {
    console.error('Error loading stats:', err);
  }
}

async function loadRecentActivity() {
  try {
    const res = await apiFetch('/documents/recent/list');
    if (!res || !res.ok) return;
    const docs = await res.json();

    const container = document.getElementById('recent-activity');

    if (!docs || docs.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">📄</div>
          <p class="empty-state-text">No documents yet. Create your first RFQ or PO!</p>
        </div>
      `;
      return;
    }

    let html = `<div class="table-container"><table>
      <thead>
        <tr>
          <th>Type</th>
          <th>Doc #</th>
          <th>Date</th>
          <th>Supplier</th>
          <th>Project</th>
          <th>Status</th>
          <th>Actions</th>
        </tr>
      </thead><tbody>`;

    for (const doc of docs) {
      html += `
        <tr>
          <td>${typeBadge(doc.doc_type)}</td>
          <td class="font-bold">${esc(doc.doc_number)}</td>
          <td>${formatDate(doc.created_date)}</td>
          <td>${esc(doc.supplier_name)}</td>
          <td>${esc(doc.project_name) || '—'}</td>
          <td>${statusBadge(doc.status)}</td>
          <td>
            <button class="btn btn-ghost btn-sm" onclick="viewDoc('${esc(doc.id)}')">View</button>
          </td>
        </tr>
      `;
    }

    html += `</tbody></table></div>`;
    container.innerHTML = html;
  } catch (err) {
    console.error('Error loading recent:', err);
  }
}

function viewDoc(id) {
  window.location.href = `/portal/preview.html?id=${id}`;
}
