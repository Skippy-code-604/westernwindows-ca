// ---- Shared Utilities for WW Portal ----

const API = '/api';

async function apiFetch(url, options = {}) {
    const defaults = {
        headers: { 'Content-Type': 'application/json' },
    };
    const config = { ...defaults, ...options };

    // Add Firebase Auth token
    if (window.firebaseAuth) {
        const token = await window.firebaseAuth.getIdToken();
        if (token) {
            config.headers = config.headers || {};
            config.headers['Authorization'] = `Bearer ${token}`;
        }
    }

    if (options.body && typeof options.body === 'object') {
        config.body = JSON.stringify(options.body);
    }

    const res = await fetch(API + url, config);

    if (res.status === 401) {
        // Sign out Firebase user to prevent redirect loop
        if (window.firebaseAuth) {
            await window.firebaseAuth.signOut();
        }
        if (!window.location.pathname.includes('index.html') && window.location.pathname !== '/portal/') {
            window.location.href = '/portal/';
        }
        return null;
    }

    return res;
}

// Toast notifications
function showToast(message, type = 'info', duration = 4000) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
    toast.innerHTML = `<span>${icons[type] || ''}</span><span>${message}</span>`;

    container.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'slideOut 300ms ease forwards';
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

// Check auth on page load (for protected pages)
async function checkAuth() {
    // Wait for firebase-auth.js module to load
    let attempts = 0;
    while (!window.firebaseAuth && attempts < 50) {
        await new Promise(r => setTimeout(r, 100));
        attempts++;
    }

    if (!window.firebaseAuth) {
        window.location.href = '/portal/';
        return false;
    }

    const user = await window.firebaseAuth.isSignedIn();
    if (!user) {
        window.location.href = '/portal/';
        return false;
    }
    return true;
}

// Logout handler
function setupLogout() {
    const btn = document.getElementById('logout-btn');
    if (btn) {
        btn.addEventListener('click', async () => {
            if (window.firebaseAuth) {
                await window.firebaseAuth.signOut();
            }
            window.location.href = '/portal/';
        });
    }
}

// URL params helper
function getUrlParam(key) {
    return new URLSearchParams(window.location.search).get(key);
}

// Format date for display
function formatDate(dateStr) {
    if (!dateStr) return '—';
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' });
}

// Format currency
function formatCurrency(amount) {
    if (!amount || amount === 0) return '—';
    return '$' + Number(amount).toFixed(2);
}

// Status badge HTML
function statusBadge(status) {
    const s = (status || 'Draft').toLowerCase();
    return `<span class="badge badge-${s}">${status || 'Draft'}</span>`;
}

// Doc type badge HTML
function typeBadge(type) {
    const t = (type || 'RFQ').toLowerCase();
    return `<span class="badge badge-${t}">${type}</span>`;
}
