// ─── HomeBase — Entry Point ───
// Module load order: utils → i18n → ui → state → render → containers → settings → wizard → editor → audit → app

// ─── Nav / Hash Routing ───
const validViews = new Set(['dashboard', 'containers', 'auditlog', 'settings']);

function navigateTo(view) {
    const link = $(`.nav-link[data-view="${view}"]`);
    if (!link) return;
    $$('.nav-link').forEach(n => n.classList.remove('active'));
    link.classList.add('active');
    $$('.view').forEach(v => v.classList.remove('active'));
    $(`#${view}View`).classList.add('active');
    $('#pageTitle').textContent = link.querySelector('span[data-i18n]')?.textContent || link.querySelector('span').textContent;
    $('#sidebar').classList.remove('open');
    if (view === 'auditlog') loadAuditLogs();
    if (view === 'settings') loadEnv();
}

$$('.nav-link').forEach(l => l.addEventListener('click', () => {
    location.hash = l.dataset.view;
}));

window.addEventListener('hashchange', () => {
    const view = location.hash.replace('#', '');
    if (validViews.has(view)) navigateTo(view);
});

// Initial route
(function initRoute() {
    const initView = location.hash.replace('#', '');
    if (validViews.has(initView)) navigateTo(initView);
    else location.hash = 'dashboard';
})();

$('#hamburger').addEventListener('click', () => $('#sidebar').classList.toggle('open'));

// ─── View Toggle ───
function setViewMode(mode) {
    viewMode = mode;
    localStorage.setItem('viewMode', mode);
    $$('.vt-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
    $('#servicesGrid').classList.toggle('list-mode', mode === 'list');
}
$$('.vt-btn').forEach(b => b.addEventListener('click', () => setViewMode(b.dataset.mode)));
setViewMode(viewMode);

// ─── Search ───
$('#searchInput').addEventListener('input', e => {
    searchQuery = e.target.value.toLowerCase().trim();
    renderServices();
});

// ─── Clock ───
const updateClock = () => $('#clock').textContent = new Date().toLocaleTimeString(currentLang === 'en' ? 'en-US' : 'tr-TR');
setInterval(updateClock, 1000); updateClock();

// ─── Keyboard Shortcuts ───
document.addEventListener('keydown', e => {
    // Don't trigger if user is typing in an input
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;

    switch (e.key) {
        case '/':
            e.preventDefault();
            const searchInput = $('#searchInput');
            if (searchInput) searchInput.focus();
            break;
        case '1': location.hash = 'dashboard'; break;
        case '2': location.hash = 'containers'; break;
        case '3': location.hash = 'auditlog'; break;
        case '4': location.hash = 'settings'; break;
        case 'r':
            e.preventDefault();
            fetchAll();
            showToast(t('msg.refreshing'), 'info', 1500);
            break;
        case 't':
            e.preventDefault();
            toggleTheme();
            break;
        case 'Escape':
            // Close any open modal
            const modal = document.querySelector('.modal-overlay');
            if (modal) modal.remove();
            closeLogs();
            break;
        case 'n':
            if (e.ctrlKey || e.metaKey) return; // Don't interfere with browser shortcuts
            e.preventDefault();
            openOnboardingWizard();
            break;
    }
});

// ─── Init ───
// Set initial language
const langBtn = $('#langToggle');
if (langBtn) langBtn.textContent = currentLang.toUpperCase();
updateStaticStrings();

renderSkeletons();
loadEnvData(); // Load settings data for card display
fetchGpuInfo(); // Initial GPU check
setInterval(fetchGpuInfo, 10000); // GPU refresh every 10s
fetchAll();
// Start with polling, then transition to SignalR
pollTimer = setInterval(fetchAll, pollInterval);
initSignalR();
