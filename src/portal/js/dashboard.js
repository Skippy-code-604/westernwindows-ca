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

  // Load recent activity
  loadRecentActivity();
});

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
          <td class="font-bold">${doc.doc_number}</td>
          <td>${formatDate(doc.created_date)}</td>
          <td>${doc.supplier_name}</td>
          <td>${doc.project_name || '—'}</td>
          <td>${statusBadge(doc.status)}</td>
          <td>
            <button class="btn btn-ghost btn-sm" onclick="viewDoc('${doc.id}')">View</button>
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
