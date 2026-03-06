// ---- Login Page Logic ----

document.addEventListener('DOMContentLoaded', () => {
    // Check if already logged in
    fetch('/api/auth/check', { credentials: 'include' })
        .then(r => r.json())
        .then(data => {
            if (data.authenticated) {
                window.location.href = '/portal/dashboard.html';
            }
        })
        .catch(() => { });

    const form = document.getElementById('login-form');
    const errorEl = document.getElementById('login-error');
    const loginBtn = document.getElementById('login-btn');

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        errorEl.classList.add('hidden');
        loginBtn.disabled = true;
        loginBtn.textContent = 'Signing in...';

        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;

        try {
            const res = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ username, password }),
            });

            if (res.ok) {
                window.location.href = '/portal/dashboard.html';
            } else {
                errorEl.classList.remove('hidden');
                loginBtn.disabled = false;
                loginBtn.textContent = 'Sign In';
            }
        } catch (err) {
            errorEl.textContent = 'Connection error. Please try again.';
            errorEl.classList.remove('hidden');
            loginBtn.disabled = false;
            loginBtn.textContent = 'Sign In';
        }
    });
});
