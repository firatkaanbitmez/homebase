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

    // Close any existing picker
    document.querySelectorAll('.icon-picker-popover').forEach(p => p.remove());

    const popover = document.createElement('div');
    popover.className = 'icon-picker-popover';
    popover.style.maxWidth = '320px';
    popover.innerHTML = `
        <div class="icon-picker-tabs">
            <button class="icon-picker-tab active" data-iptab="existing">${t('icon.existing')}</button>
            <button class="icon-picker-tab" data-iptab="url">${t('icon.url')}</button>
            <button class="icon-picker-tab" data-iptab="upload">${t('icon.upload')}</button>
        </div>
        <div class="icon-picker-panel active" data-ippanel="existing">
            ${iconCache && iconCache.length ? `<div class="icon-picker-grid">${iconCache.map(ic =>
                `<div class="icon-picker-item" data-icon="${escHtml(ic)}"><img src="${ic}" alt=""></div>`
            ).join('')}</div>` : `<div style="padding:1rem;text-align:center;color:var(--text-m);font-size:.8rem">${t('msg.noIcons')}</div>`}
        </div>
        <div class="icon-picker-panel" data-ippanel="url">
            <div style="padding:.5rem;display:flex;flex-direction:column;gap:.5rem">
                <input type="text" class="ip-url-input" placeholder="${t('icon.urlPlaceholder')}" style="background:var(--bg-3);border:1px solid var(--border);border-radius:6px;padding:.4rem .6rem;font-size:.78rem;color:var(--text);outline:none;width:100%">
                <div style="display:flex;align-items:center;gap:.5rem">
                    <img class="ip-url-preview" src="" alt="" style="width:32px;height:32px;object-fit:contain;border-radius:4px;display:none" onerror="this.style.display='none'">
                    <button class="section-btn primary section-btn-sm ip-url-use" style="margin-left:auto">${t('icon.use')}</button>
                </div>
            </div>
        </div>
        <div class="icon-picker-panel" data-ippanel="upload">
            <div class="ip-upload-zone" style="padding:1.5rem;text-align:center;border:2px dashed var(--border);border-radius:var(--rs);margin:.5rem;cursor:pointer;transition:border-color .15s">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--text-m)" stroke-width="1.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                <div style="font-size:.75rem;color:var(--text-m);margin-top:.3rem">${t('icon.uploadHint')}</div>
                <input type="file" class="ip-file-input" accept=".png,.svg,.ico,.jpg,.webp" style="display:none">
            </div>
        </div>`;

    const rect = inputEl.getBoundingClientRect();
    popover.style.position = 'fixed';
    popover.style.top = (rect.bottom + 4) + 'px';
    popover.style.left = Math.min(rect.left, window.innerWidth - 340) + 'px';
    document.body.appendChild(popover);

    const selectIcon = (icon) => {
        inputEl.value = icon;
        if (previewEl) { previewEl.src = icon; previewEl.style.display = 'inline'; }
        popover.remove();
    };

    // Tab switching
    popover.querySelectorAll('.icon-picker-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            popover.querySelectorAll('.icon-picker-tab').forEach(t => t.classList.remove('active'));
            popover.querySelectorAll('.icon-picker-panel').forEach(p => p.classList.remove('active'));
            tab.classList.add('active');
            popover.querySelector(`[data-ippanel="${tab.dataset.iptab}"]`).classList.add('active');
        });
    });

    // Existing icons
    popover.querySelectorAll('.icon-picker-item').forEach(item => {
        item.addEventListener('click', () => selectIcon(item.dataset.icon));
    });

    // URL input
    const urlInput = popover.querySelector('.ip-url-input');
    const urlPreview = popover.querySelector('.ip-url-preview');
    urlInput.addEventListener('input', () => {
        const url = urlInput.value.trim();
        if (url) { urlPreview.src = url; urlPreview.style.display = 'block'; }
        else urlPreview.style.display = 'none';
    });
    popover.querySelector('.ip-url-use').addEventListener('click', () => {
        const url = urlInput.value.trim();
        if (url) selectIcon(url);
    });

    // Upload
    const uploadZone = popover.querySelector('.ip-upload-zone');
    const fileInput = popover.querySelector('.ip-file-input');
    uploadZone.addEventListener('click', () => fileInput.click());
    uploadZone.addEventListener('dragover', e => { e.preventDefault(); uploadZone.style.borderColor = 'var(--accent)'; });
    uploadZone.addEventListener('dragleave', () => { uploadZone.style.borderColor = 'var(--border)'; });
    uploadZone.addEventListener('drop', e => {
        e.preventDefault();
        uploadZone.style.borderColor = 'var(--border)';
        if (e.dataTransfer.files.length) uploadIconFile(e.dataTransfer.files[0], selectIcon, uploadZone);
    });
    fileInput.addEventListener('change', () => {
        if (fileInput.files.length) uploadIconFile(fileInput.files[0], selectIcon, uploadZone);
    });

    // Close on click outside
    setTimeout(() => {
        const closeHandler = (e) => {
            if (!popover.contains(e.target)) { popover.remove(); document.removeEventListener('click', closeHandler); }
        };
        document.addEventListener('click', closeHandler);
    }, 10);
}

async function uploadIconFile(file, onSuccess, zone) {
    if (file.size > 512 * 1024) { showToast(t('msg.maxFileSize'), 'warning'); return; }
    zone.innerHTML = `<span class="spinner"></span> ${t('icon.uploading')}`;
    try {
        const fd = new FormData();
        fd.append('file', file);
        const res = await fetch('/api/System/icons/upload', { method: 'POST', body: fd });
        if (!res.ok) throw new Error();
        const data = await res.json();
        iconCache = null; // invalidate cache
        onSuccess(data.url);
    } catch {
        showToast(t('icon.uploadFail'), 'error');
        zone.innerHTML = `<div style="font-size:.75rem;color:var(--red)">${t('icon.uploadFail')}</div>`;
    }
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
