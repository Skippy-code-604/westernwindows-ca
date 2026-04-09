// ---- Projects Page Logic ----

let allProjects = [];

document.addEventListener('DOMContentLoaded', async () => {
  if (!(await checkAuth())) return;
  setupLogout();
  await loadProjects();

  // Search filter
  document.getElementById('project-search').addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase();
    renderProjects(allProjects.filter(p =>
      p.project_name.toLowerCase().includes(q) ||
      p.suppliers.some(s => s.toLowerCase().includes(q))
    ));
  });

  // Back button
  document.getElementById('back-to-projects').addEventListener('click', showProjectList);
});

async function loadProjects() {
  try {
    const res = await apiFetch('/documents/projects/list');
    if (!res || !res.ok) throw new Error('Failed to load projects');
    const data = await res.json();
    allProjects = data.projects || [];
    renderProjects(allProjects);
  } catch (err) {
    console.error('Error loading projects:', err);
    document.getElementById('projects-container').innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">⚠️</div>
        <p class="empty-state-text">Could not load projects. ${err.message}</p>
      </div>
    `;
  }
}

function renderProjects(projects) {
  const container = document.getElementById('projects-container');

  if (projects.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📁</div>
        <p class="empty-state-text">No projects found. Projects are automatically created when you add a "Project / Job Name" to a document.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="project-grid">
      ${projects.map(p => `
        <div class="card card-clickable project-card" data-project="${escapeAttr(p.project_name)}">
          <div class="project-card-header">
            <div class="project-card-name">${escapeHtml(p.project_name)}</div>
            <div class="project-card-date">${formatDate(p.last_activity)}</div>
          </div>
          <div class="project-card-stats">
            <div class="project-stat">
              <span class="project-stat-value">${p.rfq_count}</span>
              <span class="project-stat-label">RFQs</span>
            </div>
            <div class="project-stat">
              <span class="project-stat-value">${p.po_count}</span>
              <span class="project-stat-label">POs</span>
            </div>
            <div class="project-stat">
              <span class="project-stat-value">${p.doc_count}</span>
              <span class="project-stat-label">Total</span>
            </div>
            ${p.total_value > 0 ? `
              <div class="project-stat">
                <span class="project-stat-value project-stat-value--money">$${formatMoney(p.total_value)}</span>
                <span class="project-stat-label">PO Value</span>
              </div>
            ` : ''}
          </div>
          <div class="project-card-meta">
            <div class="project-suppliers">${p.suppliers.map(s => `<span class="badge badge-supplier">${escapeHtml(s)}</span>`).join(' ')}</div>
            <div class="project-statuses">${p.statuses.map(s => `<span class="badge badge-${s.toLowerCase()}">${s}</span>`).join(' ')}</div>
          </div>
        </div>
      `).join('')}
    </div>
  `;

  // Click handlers
  container.querySelectorAll('.project-card').forEach(card => {
    card.addEventListener('click', () => {
      const name = card.dataset.project;
      showProjectDetail(name);
    });
  });
}

async function showProjectDetail(projectName) {
  document.getElementById('projects-container').style.display = 'none';
  document.getElementById('project-search').style.display = 'none';
  const detail = document.getElementById('project-detail');
  detail.style.display = 'block';

  document.getElementById('project-detail-title').textContent = projectName;
  document.getElementById('project-detail-subtitle').textContent = 'Loading documents...';
  document.getElementById('project-docs-list').innerHTML = '';

  try {
    const res = await apiFetch(`/documents/projects/${encodeURIComponent(projectName)}`);
    if (!res || !res.ok) throw new Error('Failed to load project documents');
    const data = await res.json();
    const docs = data.documents || [];

    document.getElementById('project-detail-subtitle').textContent = `${docs.length} document${docs.length !== 1 ? 's' : ''}`;

    if (docs.length === 0) {
      document.getElementById('project-docs-list').innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">📄</div>
          <p class="empty-state-text">No documents found for this project.</p>
        </div>
      `;
      return;
    }

    document.getElementById('project-docs-list').innerHTML = `
      <table class="project-docs-table">
        <thead>
          <tr>
            <th>Document</th>
            <th>Type</th>
            <th>Supplier</th>
            <th>Status</th>
            <th>Items</th>
            <th>Total</th>
            <th>Date</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${docs.map(d => `
            <tr>
              <td class="doc-number-cell">${escapeHtml(d.doc_number || '—')}</td>
              <td><span class="badge badge-${(d.doc_type || '').toLowerCase()}">${d.doc_type}</span></td>
              <td>${escapeHtml(d.supplier_name || '—')}</td>
              <td><span class="badge badge-${(d.status || 'draft').toLowerCase()}">${d.status || 'Draft'}</span></td>
              <td>${(d.line_items || []).length}</td>
              <td class="ph-price">${d.total_amount ? '$' + Number(d.total_amount).toFixed(2) : '—'}</td>
              <td class="text-muted">${formatDate(d.created_at)}</td>
              <td>
                <a href="/portal/preview.html?id=${d.id}" class="btn btn-ghost btn-sm" title="View">👁️</a>
                <a href="/portal/form.html?edit=${d.id}&type=${d.doc_type}&supplier=${d.supplier_id}" class="btn btn-ghost btn-sm" title="Edit">✏️</a>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  } catch (err) {
    console.error('Error loading project detail:', err);
    document.getElementById('project-docs-list').innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">⚠️</div>
        <p class="empty-state-text">Error loading documents: ${err.message}</p>
      </div>
    `;
  }
}

function showProjectList() {
  document.getElementById('project-detail').style.display = 'none';
  document.getElementById('projects-container').style.display = 'block';
  document.getElementById('project-search').style.display = 'block';
}

// Helpers
function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str || '';
  return d.innerHTML;
}

function escapeAttr(str) {
  return (str || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleDateString('en-CA');
  } catch { return '—'; }
}

function formatMoney(amount) {
  if (!amount) return '0';
  return Number(amount).toLocaleString('en-CA', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}
