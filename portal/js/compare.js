// ---- Quote Comparison Page Logic ----

let docs = [];
let lineCount = 0;

document.addEventListener('DOMContentLoaded', async () => {
    if (!(await checkAuth())) return;
    setupLogout();

    const group = getUrlParam('group');
    const idsParam = getUrlParam('ids');

    if (group) {
        await loadByBatchGroup(group);
    } else if (idsParam) {
        const ids = idsParam.split(',').filter(Boolean);
        await loadByIds(ids);
    } else {
        showToast('No documents to compare', 'error');
        return;
    }

    if (docs.length > 0) {
        renderComparison();
        document.getElementById('actions-card').style.display = '';
        document.getElementById('save-prices-btn').addEventListener('click', savePrices);
    }
});

async function loadByBatchGroup(group) {
    try {
        const res = await apiFetch(`/documents/batch-group/${encodeURIComponent(group)}`);
        if (res && res.ok) {
            docs = await res.json();
        }
    } catch (err) {
        console.error('Error loading batch group:', err);
        showToast('Error loading documents', 'error');
    }
}

async function loadByIds(ids) {
    for (const id of ids) {
        try {
            const res = await apiFetch(`/documents/${id}`);
            if (res && res.ok) {
                const data = await res.json();
                docs.push(data.document);
            }
        } catch (err) {
            console.error(`Error loading doc ${id}:`, err);
        }
    }
}

function renderComparison() {
    if (docs.length === 0) return;

    // Use first doc's line items as reference
    const refDoc = docs[0];
    const lineItems = refDoc.line_items || [];
    lineCount = lineItems.length;

    document.getElementById('page-subtitle').textContent =
        `${refDoc.project_name || 'Project'} — ${docs.length} suppliers`;

    const content = document.getElementById('comparison-content');

    // Build the comparison table
    let html = `
        <div class="compare-table-wrapper">
            <table class="compare-table">
                <thead>
                    <tr>
                        <th class="compare-line-header">Line Item</th>
                        ${docs.map(d => `
                            <th class="compare-supplier-header">
                                <div class="compare-supplier-name">${esc(d.supplier_name)}</div>
                                <div class="text-xs text-muted">${esc(d.doc_number)}</div>
                                <span class="badge badge-${d.status.toLowerCase()}" style="margin-top:4px;">${d.status}</span>
                            </th>
                        `).join('')}
                    </tr>
                </thead>
                <tbody>
    `;

    // One row per line item
    for (let i = 0; i < lineItems.length; i++) {
        const item = lineItems[i];
        const lineLabel = getLineLabel(item);

        html += `<tr>`;
        html += `<td class="compare-line-cell">
            <div class="compare-line-label">${esc(lineLabel)}</div>
            <div class="text-xs text-muted">Qty: ${item.qty || 1} — ${esc(item.width || '')} × ${esc(item.height || '')}</div>
        </td>`;

        for (const doc of docs) {
            const docItem = (doc.line_items || [])[i];
            const quotedPrice = docItem ? (docItem.quoted_price || '') : '';
            html += `<td class="compare-price-cell">
                <div class="compare-price-input-wrap">
                    <span class="compare-dollar">$</span>
                    <input type="number" step="0.01" class="compare-price-input"
                        data-doc-id="${doc.id}" data-line="${i + 1}"
                        value="${quotedPrice}" placeholder="0.00">
                </div>
            </td>`;
        }

        html += `</tr>`;
    }

    // Totals row
    html += `<tr class="compare-totals-row">
        <td class="compare-line-cell"><strong>Total</strong></td>
        ${docs.map(d => `
            <td class="compare-price-cell">
                <div class="compare-total" id="total-${d.id}">$0.00</div>
            </td>
        `).join('')}
    </tr>`;

    html += `</tbody></table></div>`;
    content.innerHTML = html;

    // Add input listeners for totals
    content.querySelectorAll('.compare-price-input').forEach(input => {
        input.addEventListener('input', updateTotals);
    });

    updateTotals();
}

function getLineLabel(item) {
    if (item.product_type) return item.product_type;
    if (item.glass_type) return `${item.glass_type} Glass`;
    if (item.thickness) return `${item.thickness} Glass`;
    return `Line ${item.line_number}`;
}

function updateTotals() {
    const allInputs = document.querySelectorAll('.compare-price-input');
    const totals = {};
    let lowestTotal = Infinity;
    let lowestDocId = null;

    // Calculate per-doc totals
    allInputs.forEach(input => {
        const docId = input.dataset.docId;
        const lineNum = parseInt(input.dataset.line);
        const price = parseFloat(input.value) || 0;

        // Find qty for this line
        const doc = docs.find(d => d.id === docId);
        const item = doc ? (doc.line_items || [])[lineNum - 1] : null;
        const qty = item ? (item.qty || 1) : 1;

        if (!totals[docId]) totals[docId] = 0;
        totals[docId] += price * qty;
    });

    // Update totals and find cheapest
    for (const [docId, total] of Object.entries(totals)) {
        const totalEl = document.getElementById(`total-${docId}`);
        if (totalEl) {
            totalEl.textContent = `$${total.toFixed(2)}`;
            totalEl.classList.remove('compare-cheapest', 'compare-expensive');
        }
        if (total > 0 && total < lowestTotal) {
            lowestTotal = total;
            lowestDocId = docId;
        }
    }

    // Highlight cheapest
    if (lowestDocId) {
        const cheapestEl = document.getElementById(`total-${lowestDocId}`);
        if (cheapestEl) cheapestEl.classList.add('compare-cheapest');

        // Show convert button for winner
        const convertBtn = document.getElementById('convert-winner-btn');
        const winner = docs.find(d => d.id === lowestDocId);
        if (convertBtn && winner) {
            convertBtn.style.display = '';
            convertBtn.textContent = `📋 Convert ${winner.supplier_name} to PO`;
            convertBtn.onclick = () => convertWinnerToPO(lowestDocId);
        }

        // Highlight per-line cheapest
        highlightCheapestPerLine();
    }
}

function highlightCheapestPerLine() {
    for (let line = 1; line <= lineCount; line++) {
        const inputs = document.querySelectorAll(`.compare-price-input[data-line="${line}"]`);
        let cheapest = Infinity;
        let cheapestInput = null;

        inputs.forEach(input => {
            const val = parseFloat(input.value) || 0;
            input.parentElement.classList.remove('compare-cell-cheapest');
            if (val > 0 && val < cheapest) {
                cheapest = val;
                cheapestInput = input;
            }
        });

        // Only highlight if there are at least 2 prices to compare
        const filledCount = [...inputs].filter(i => parseFloat(i.value) > 0).length;
        if (cheapestInput && filledCount >= 2) {
            cheapestInput.parentElement.classList.add('compare-cell-cheapest');
        }
    }
}

async function savePrices() {
    const saveBtn = document.getElementById('save-prices-btn');
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<span class="spinner"></span> Saving...';

    try {
        for (const doc of docs) {
            const inputs = document.querySelectorAll(`.compare-price-input[data-doc-id="${doc.id}"]`);
            const prices = [];

            inputs.forEach(input => {
                prices.push({
                    line_number: parseInt(input.dataset.line),
                    quoted_price: parseFloat(input.value) || 0,
                });
            });

            await apiFetch(`/documents/${doc.id}/quote-prices`, {
                method: 'PATCH',
                body: { prices },
            });
        }

        showToast('All prices saved!', 'success');
    } catch (err) {
        console.error('Save error:', err);
        showToast('Error saving prices', 'error');
    }

    saveBtn.disabled = false;
    saveBtn.innerHTML = '💾 Save Prices';
}

async function convertWinnerToPO(docId) {
    try {
        const res = await apiFetch(`/documents/${docId}/convert-to-po`, { method: 'POST' });
        if (!res || !res.ok) {
            const err = await res.json();
            showToast(err.error || 'Conversion failed', 'error');
            return;
        }
        const { document: po } = await res.json();
        showToast(`Created ${po.doc_number}!`, 'success');
        window.location.href = `/portal/form.html?edit=${po.id}`;
    } catch (err) {
        console.error('Convert error:', err);
        showToast('Error converting to PO', 'error');
    }
}
