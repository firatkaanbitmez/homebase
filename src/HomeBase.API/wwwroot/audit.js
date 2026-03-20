// ─── Audit Module ───

// ─── Audit Log Viewer ───
let auditPage = 0;
const auditLimit = 20;
let auditDebounce = null;

function getAuditFilters() {
    return {
        action: $('#auditAction').value,
        search: $('#auditSearch').value,
        from: $('#auditFrom').value,
        to: $('#auditTo').value,
    };
}

async function loadAuditLogs() {
    const f = getAuditFilters();
    const params = new URLSearchParams();
    if (f.action) params.set('action', f.action);
    if (f.search) params.set('search', f.search);
    if (f.from) params.set('from', f.from);
    if (f.to) params.set('to', f.to);
    params.set('limit', auditLimit);
    params.set('offset', auditPage * auditLimit);

    try {
        const res = await fetch(`/api/System/logs?${params}`);
        const data = await res.json();
        renderAuditLogs(data.logs || data, data.total ?? (data.length || 0));
    } catch {
        $('#auditBody').innerHTML = `<tr><td colspan="4"><div class="error-state"><div class="error-state-msg">${t('audit.loadFail')}</div><button class="error-state-retry" onclick="loadAuditLogs()">${t('msg.retry')}</button></div></td></tr>`;
    }
}

function renderAuditLogs(logs, total) {
    const body = $('#auditBody');
    const isMobile = window.innerWidth <= 768;

    if (!logs || logs.length === 0) {
        body.innerHTML = `<tr><td colspan="4"><div class="empty-state"><svg class="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/></svg><div class="empty-state-msg">${t('audit.noRecords')}</div></div></td></tr>`;
        $('#auditPagination').innerHTML = '';
        return;
    }

    if (isMobile) $('#auditTableWrap').classList.add('audit-mobile');
    else $('#auditTableWrap').classList.remove('audit-mobile');

    body.innerHTML = logs.map(l => {
        const d = new Date(l.createdAt);
        const loc = currentLang === 'en' ? 'en-US' : 'tr-TR';
        const time = d.toLocaleDateString(loc) + ' ' + d.toLocaleTimeString(loc);
        const action = l.action || '';
        return `<tr>
            <td data-label="${t('audit.time')}">${time}</td>
            <td data-label="${t('audit.action')}"><span class="action-badge ${action}">${action}</span></td>
            <td data-label="${t('audit.target')}"><span class="ctr-name">${l.target || '-'}</span></td>
            <td data-label="${t('audit.detail')}"><span class="audit-detail" title="${escHtml(l.details)}">${l.details || '-'}</span></td>
        </tr>`;
    }).join('');

    const totalPages = Math.ceil(total / auditLimit);
    const pg = $('#auditPagination');
    if (totalPages <= 1) { pg.innerHTML = `<span class="pagination-info">${total} ${t('audit.records')}</span><span></span>`; return; }
    pg.innerHTML = `
        <span class="pagination-info">${t('audit.page')} ${auditPage+1}/${totalPages} — ${total} ${t('audit.records')}</span>
        <div class="pagination-btns">
            <button class="pg-btn" onclick="auditPage=0;loadAuditLogs()" ${auditPage===0?'disabled':''}>${t('audit.first')}</button>
            <button class="pg-btn" onclick="auditPage--;loadAuditLogs()" ${auditPage===0?'disabled':''}>${t('audit.prev')}</button>
            <button class="pg-btn" onclick="auditPage++;loadAuditLogs()" ${auditPage>=totalPages-1?'disabled':''}>${t('audit.next')}</button>
            <button class="pg-btn" onclick="auditPage=${totalPages-1};loadAuditLogs()" ${auditPage>=totalPages-1?'disabled':''}>${t('audit.last')}</button>
        </div>`;
}

['auditAction', 'auditFrom', 'auditTo'].forEach(id => {
    $(`#${id}`).addEventListener('change', () => { auditPage = 0; loadAuditLogs(); });
});
$('#auditSearch').addEventListener('input', () => {
    clearTimeout(auditDebounce);
    auditDebounce = setTimeout(() => { auditPage = 0; loadAuditLogs(); }, 400);
});
