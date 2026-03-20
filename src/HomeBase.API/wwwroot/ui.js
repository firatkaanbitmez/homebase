// ─── UI Module ───

// ─── Icon Picker ───
let iconCache = null;
async function openIconPicker(inputEl, previewEl) {
    if (!iconCache) {
        try {
            const res = await fetch('/api/System/icons');
            if (res.ok) iconCache = await res.json();
        } catch {}
    }
    if (!iconCache || !iconCache.length) { showToast('No icons found', 'warning'); return; }

    // Close any existing picker
    document.querySelectorAll('.icon-picker-popover').forEach(p => p.remove());

    const popover = document.createElement('div');
    popover.className = 'icon-picker-popover';
    popover.innerHTML = `<div class="icon-picker-grid">${iconCache.map(ic =>
        `<div class="icon-picker-item" data-icon="${escHtml(ic)}"><img src="${ic}" alt=""></div>`
    ).join('')}</div>`;

    // Position near button
    const rect = inputEl.getBoundingClientRect();
    popover.style.position = 'fixed';
    popover.style.top = (rect.bottom + 4) + 'px';
    popover.style.left = rect.left + 'px';
    document.body.appendChild(popover);

    popover.querySelectorAll('.icon-picker-item').forEach(item => {
        item.addEventListener('click', () => {
            const icon = item.dataset.icon;
            inputEl.value = icon;
            if (previewEl) { previewEl.src = icon; previewEl.style.display = 'inline'; }
            popover.remove();
        });
    });

    // Close on click outside
    setTimeout(() => {
        const closeHandler = (e) => {
            if (!popover.contains(e.target)) { popover.remove(); document.removeEventListener('click', closeHandler); }
        };
        document.addEventListener('click', closeHandler);
    }, 10);
}

// Container detail tracking
const containerHistory = {};  // { name: { cpu:[], mem:[], rx:[], tx:[] } }
const CTR_HLEN = 60;
const expandedContainers = new Set();
const containerInspectCache = {}; // { name: inspectData }
let gpuInfo = null; // { available, driverVersion, devices[] }

// ─── Theme ───
function initTheme() {
    const saved = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', saved);
    updateThemeIcon(saved);
}
function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') || 'dark';
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
    updateThemeIcon(next);
}
function updateThemeIcon(theme) {
    $('#themeIcon').innerHTML = theme === 'dark'
        ? '<path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/>'
        : '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>';
}
initTheme();
$('#themeToggle').addEventListener('click', toggleTheme);

// ─── Toast ───
function showToast(msg, type = 'info', duration = 4000) {
    const container = $('#toastContainer');
    const icons = {
        success: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--green)" stroke-width="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
        error: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--red)" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
        warning: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--yellow)" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
        info: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>'
    };
    // Limit visible toasts to 3
    const existing = container.querySelectorAll('.toast:not(.removing)');
    if (existing.length >= 3) {
        const oldest = existing[0];
        oldest.classList.add('removing');
        setTimeout(() => oldest.remove(), 300);
    }
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span class="toast-icon">${icons[type] || icons.info}</span><span class="toast-msg">${msg}</span>${duration > 0 ? `<div class="toast-progress"><div class="toast-progress-bar" style="animation-duration:${duration}ms"></div></div>` : ''}<button class="toast-close" onclick="this.parentElement.classList.add('removing');setTimeout(()=>this.parentElement.remove(),300)"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>`;
    container.appendChild(toast);
    if (duration > 0) {
        setTimeout(() => {
            if (toast.parentElement) {
                toast.classList.add('removing');
                setTimeout(() => toast.remove(), 300);
            }
        }, duration);
    }
}

// ─── Confirm Dialog ───
function showConfirm(title, message, confirmText, type = 'default') {
    if (!confirmText) confirmText = t('confirm.ok');
    return new Promise(resolve => {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.innerHTML = `
            <div class="modal ${type === 'danger' ? 'modal-danger' : ''}">
                <h3>${title}</h3>
                <p>${message}</p>
                <div class="modal-actions">
                    <button class="modal-cancel">${t('confirm.cancel')}</button>
                    <button class="modal-confirm">${confirmText}</button>
                </div>
            </div>`;
        document.body.appendChild(overlay);
        requestAnimationFrame(() => overlay.classList.add('active'));
        const close = (result) => {
            overlay.classList.remove('active');
            setTimeout(() => overlay.remove(), 200);
            resolve(result);
        };
        overlay.querySelector('.modal-cancel').addEventListener('click', () => close(false));
        overlay.querySelector('.modal-confirm').addEventListener('click', () => close(true));
        overlay.addEventListener('click', e => { if (e.target === overlay) close(false); });
        // Escape to close
        const escHandler = e => { if (e.key === 'Escape') { close(false); document.removeEventListener('keydown', escHandler); } };
        document.addEventListener('keydown', escHandler);
    });
}
