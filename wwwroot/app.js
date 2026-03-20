const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);

let containers = [], services = [];
let envSections = []; // settings data per service
let disksData = []; // disk usage for settings health dashboard
const cpuH = [], memH = [], HLEN = 60;
let viewMode = localStorage.getItem('viewMode') || 'grid';
const transitioning = new Set();
let searchQuery = '';
let initialLoad = true;
let consecutiveErrors = 0;
let pollInterval = parseInt(localStorage.getItem('pollInterval')) || 5000;
let pollTimer = null;
let manageModeActive = false;

// ─── i18n ───
const LANG = {
  tr: {
    // Nav/Header
    'nav.dashboard':'Dashboard','nav.containers':'Containers','nav.auditlog':'Kayıt Geçmişi','nav.settings':'Settings','nav.menu':'MENU',
    'topbar.theme':'Tema Değiştir','topbar.live':'LIVE',
    // Badges/Status
    'status.online':'Online','status.offline':'Offline','status.stopping':'Stopping','status.starting':'Starting','status.stopped':'Stopped',
    // Toast/Messages
    'msg.timeout':'zaman aşımı — durumu kontrol edin','msg.notFound':'bulunamadı — yeniden oluşturulması gerekebilir',
    'msg.started':'başlatıldı','msg.ready':'hazır','msg.stopped':'başarıyla durduruldu',
    'msg.actionTimeout':'işlemi zaman aşımına uğradı','msg.actionFail':'başarısız',
    'msg.restartFail':'restart başarısız','msg.connectFail':'Sunucuya bağlanılamadı. Bağlantınızı kontrol edin.',
    'msg.connectionIssues':'Bağlantı sorunları yaşanıyor. Yenileme hızı düşürüldü.',
    'msg.refreshing':'Yenileniyor...','msg.retry':'Tekrar Dene',
    'msg.deployOk':'başarıyla deploy edildi','msg.deployFail':'Deploy hatası',
    'msg.deploying':'deploy ediliyor...','msg.saved':'kaydedildi','msg.saveFail':'kaydedilemedi',
    'msg.settingsSaved':'Ayarlar kaydedildi','msg.settingsSavedRestart':'Ayarlar kaydedildi, container yeniden başlatılıyor...',
    'msg.settingsSaveWarn':'Kaydedildi ancak container yeniden başlatılamadı',
    'msg.settingsFail':'Ayarlar yüklenemedi','msg.logFail':'Log alınamadı','msg.logEmpty':'Log bulunamadı.',
    'msg.portToggleOk.open':'dışa açıldı','msg.portToggleOk.close':'yerel erişime alındı',
    'msg.portToggleFail':'Port durumu güncellenemedi',
    'msg.firewallSyncOk':'Firewall kuralları senkronize edildi','msg.firewallSyncFail':'Firewall senkronizasyon hatası',
    'msg.enableOk':'etkinleştirildi','msg.enableFail':'Etkinleştirme hatası',
    'msg.enableAllOk':'Tüm containerlar etkinleştirildi','msg.enableAllFail':'Toplu etkinleştirme hatası',
    'msg.svcUpdated':'Servis güncellendi','msg.svcAdded':'Servis eklendi',
    'msg.svcDeleted':'silindi','msg.svcDeleteFail':'Silme başarısız',
    'msg.nameRequired':'Ad ve Container Adı zorunludur','msg.nameImageRequired':'Ad ve Image zorunlu',
    'msg.noResults':'Sonuç bulunamadı','msg.searchHint':"Aramaya başlayın — Docker Hub'dan gerçek zamanlı sonuçlar",
    'msg.searching':'Aranıyor...','msg.dhError':'Docker Hub arama hatası — çevrimdışı olabilirsiniz',
    'msg.saving':'Kaydediliyor...','msg.applying':'Applying...',
    'msg.apiDown':'API yanıt vermedi',
    // Confirm Dialog
    'confirm.stopTitle':'Container Durdur','confirm.stop':'Durdur',
    'confirm.restartTitle':'Container Yeniden Başlat','confirm.restart':'Yeniden Başlat',
    'confirm.cancel':'İptal','confirm.ok':'Onayla',
    'confirm.stopMsg':"container'ı durdurmak istediğinize emin misiniz?",
    'confirm.restartMsg':"container'ı yeniden başlatmak istediğinize emin misiniz?",
    'confirm.deleteTitle':'Servis Sil','confirm.delete':'Sil',
    'confirm.deleteMsg':'servisini silmek istediğinize emin misiniz?',
    'confirm.deleteDetail':'Bu servis tamamen kaldırılacak: container durdurulup silinecek, compose tanımı ve ayarlar temizlenecek. Proje dosyalarına dokunulmaz.',
    'msg.deleting':'siliniyor...',
    'confirm.deploy':'Deploy','confirm.deployMsg':'servisini deploy etmek istiyor musunuz?',
    // Card
    'card.on':'On','card.off':'Off',
    // Settings
    'settings.title':'HomeBase Ayarları','settings.health':'Sistem Sağlığı','settings.healthSub':'Anlık kaynak kullanımı',
    'settings.config':'Yapılandırma','settings.configSub':'Uygulama ayarları',
    'settings.polling':'Polling Interval','settings.theme':'Tema',
    'settings.activeContainers':'Active Containers','settings.registeredServices':'Registered Services',
    'settings.protectedContainers':'Protected Containers','settings.none':'Yok',
    'settings.homebaseSettings':'HomeBase Ayarları','settings.homebaseSettingsSub':'Çevresel değişkenler',
    'settings.firewall':'Firewall — Tüm Portlar','settings.firewallSub':'Port erişim yönetimi',
    'settings.recentChanges':'Son Değişiklikler','settings.recentChangesSub':'Son yapılan işlemler',
    'settings.disabledContainers':'Devre Dışı Containerlar','settings.enableAll':'Tümünü Etkinleştir',
    'settings.enable':'Etkinleştir','settings.searchPlaceholder':'Ayar ara...',
    'settings.language':'Language','settings.syncFirewall':'Senkronize Et','settings.portSearch':'Port ara...',
    'settings.memUsed':'kullanımda',
    // Port Toggle
    'port.exposed':'Dışa Açık','port.localOnly':'Sadece Yerel',
    // Wizard
    'wizard.title':'Servis Ekle','wizard.dockerhub':'Docker Hub Ara','wizard.recommended':'Önerilen','wizard.manual':'Manuel',
    'wizard.step1':'Temel','wizard.step2':'Network','wizard.step3':'Storage & Env','wizard.step4':'Önizleme',
    'wizard.name':'Servis Adı','wizard.image':'Docker Image','wizard.desc':'Açıklama','wizard.icon':'İkon',
    'wizard.color':'Renk','wizard.ports':'Port Mapping','wizard.volumes':'Volumes','wizard.env':'Environment',
    'wizard.restartPolicy':'Restart Policy','wizard.addPort':'+ Port Ekle','wizard.addVolume':'+ Volume Ekle','wizard.addEnv':'+ Env Ekle',
    'wizard.next':'İleri','wizard.back':'Geri','wizard.deploy':'Deploy','wizard.deployProgress':'Deploy ediliyor...',
    'wizard.summary':'Özet','wizard.yamlPreview':'YAML Preview','wizard.yamlHint':'Alanları doldurunca preview burada görünecek',
    'wizard.namePlaceholder':'örn: My Service','wizard.imagePlaceholder':'örn: nginx:latest','wizard.descPlaceholder':'Servis açıklaması',
    // Editor
    'editor.title':'Servis Düzenle','editor.addTitle':'Yeni Servis Ekle','editor.info':'Servis Bilgileri',
    'editor.name':'Ad','editor.desc':'Açıklama','editor.icon':'İkon URL','editor.color':'Renk',
    'editor.container':'Container Adı','editor.preferPort':'PreferPort','editor.urlPath':'URL Path',
    'editor.sort':'Sıralama','editor.save':'Kaydet','editor.add':'Ekle','editor.pickIcon':'Seç',
    'editor.config':'Yapılandırma',
    // Containers
    'containers.title':'All Containers','containers.noContainers':'Çalışan container bulunamadı',
    'containers.loading':'Yükleniyor...','containers.dataLoading':'Veri toplanıyor...',
    'containers.log':'Log','containers.protected':'protected',
    // Audit
    'audit.title':'Kayıt Geçmişi','audit.allActions':'Tüm İşlemler','audit.noRecords':'Kayıt bulunamadı',
    'audit.loadFail':'Kayıtlar yüklenemedi','audit.time':'Zaman','audit.action':'İşlem',
    'audit.target':'Hedef','audit.detail':'Detay','audit.records':'kayıt',
    'audit.page':'Sayfa','audit.first':'İlk','audit.prev':'Önceki','audit.next':'Sonraki','audit.last':'Son',
    'audit.fromDate':'Başlangıç tarihi','audit.toDate':'Bitiş tarihi','audit.search':'Ara...',
    // Logs panel
    'logs.title':'Container Logs','logs.lines':'satır','logs.autoScroll':'Auto-scroll','logs.refresh':'Yenile','logs.close':'Kapat',
    'logs.loading':'Loglar yükleniyor...','logs.error':'Hata: ',
    // Empty states
    'empty.firstDeploy':'İlk servisinizi deploy edin',
    'empty.firstDeployDesc':"Docker Hub'dan arayın, katalogdan seçin veya manuel olarak yapılandırın.",
    'empty.noMatch':'Aramanızla eşleşen servis bulunamadı','empty.clearSearch':'Aramayı Temizle',
    'empty.noSettings':'Ayar bulunamadı. Servisleri yapılandırdıktan sonra ayarlar burada görünecek.',
    'empty.noMatchSettings':'ile eşleşen ayar bulunamadı',
    // Search
    'search.placeholder':'Search services...','search.portPlaceholder':'Port ara...',
    // Container detail
    'detail.resources':'Kaynak Kullanımı','detail.info':'Container Bilgisi',
    'detail.created':'Oluşturulma','detail.usage':'Kullanım','detail.temp':'Sıcaklık','detail.power':'Güç',
    'detail.disk':'Disk','detail.writableLayer':'Yazılabilir katman — Toplam image:',
    'detail.health':'Health','detail.network':'Network','detail.blockio':'Block I/O','detail.pids':'PIDs',
    // Misc
    'misc.active':'active','misc.idle':'idle','misc.containerActive':'container aktif',
    'misc.now':'şimdi','misc.ago':'önce','misc.saveApply':'Save & Apply',
    'misc.configure':'Yapılandır','misc.all':'Tümü','misc.addService':'Servis Ekle',
    'misc.configureService':'Yapılandır',
    // AI
    'settings.aiConfig':'AI Yapılandırması','settings.aiConfigSub':'Yapay zeka entegrasyon ayarları',
    'wizard.ai':'AI Wizard',
    'ai.selectProject':'Proje Dizini Seçin','ai.selectedPath':'Seçili Dizin',
    'ai.analyze':'Analiz Et','ai.analyzing':'Proje yapısı analiz ediliyor...',
    'ai.explanation':'AI Açıklaması',
    'ai.noApiKey':'OpenAI API anahtarı ayarlanmamış. Ayarlardan yapılandırın.',
    'ai.disabled':'AI özelliği devre dışı. Ayarlardan etkinleştirin.',
    'ai.error':'AI analizi başarısız','ai.retry':'Tekrar Dene',
    'ai.dockerfile':'Oluşturulan Dockerfile','ai.generatedConfig':'Oluşturulan Yapılandırma',
    'ai.step1':'Proje Seç','ai.step2':'AI Analiz','ai.step3':'İncele','ai.step4':'Deploy',
    'ai.scanning':'Taranan dosyalar','ai.goToSettings':'Ayarlara Git',
  },
  en: {
    // Nav/Header
    'nav.dashboard':'Dashboard','nav.containers':'Containers','nav.auditlog':'Audit Log','nav.settings':'Settings','nav.menu':'MENU',
    'topbar.theme':'Toggle Theme','topbar.live':'LIVE',
    // Badges/Status
    'status.online':'Online','status.offline':'Offline','status.stopping':'Stopping','status.starting':'Starting','status.stopped':'Stopped',
    // Toast/Messages
    'msg.timeout':'timed out — check status','msg.notFound':'not found — may need recreation',
    'msg.started':'started','msg.ready':'ready','msg.stopped':'stopped successfully',
    'msg.actionTimeout':'operation timed out','msg.actionFail':'failed',
    'msg.restartFail':'restart failed','msg.connectFail':'Cannot connect to server. Check your connection.',
    'msg.connectionIssues':'Connection issues detected. Refresh rate reduced.',
    'msg.refreshing':'Refreshing...','msg.retry':'Retry',
    'msg.deployOk':'deployed successfully','msg.deployFail':'Deploy error',
    'msg.deploying':'deploying...','msg.saved':'saved','msg.saveFail':'could not save',
    'msg.settingsSaved':'Settings saved','msg.settingsSavedRestart':'Settings saved, restarting container...',
    'msg.settingsSaveWarn':'Saved but container restart failed',
    'msg.settingsFail':'Failed to load settings','msg.logFail':'Failed to fetch logs','msg.logEmpty':'No logs found.',
    'msg.portToggleOk.open':'exposed externally','msg.portToggleOk.close':'set to local only',
    'msg.portToggleFail':'Failed to update port status',
    'msg.firewallSyncOk':'Firewall rules synchronized','msg.firewallSyncFail':'Firewall sync error',
    'msg.enableOk':'enabled','msg.enableFail':'Enable error',
    'msg.enableAllOk':'All containers enabled','msg.enableAllFail':'Bulk enable error',
    'msg.svcUpdated':'Service updated','msg.svcAdded':'Service added',
    'msg.svcDeleted':'deleted','msg.svcDeleteFail':'Delete failed',
    'msg.nameRequired':'Name and Container Name are required','msg.nameImageRequired':'Name and Image are required',
    'msg.noResults':'No results found','msg.searchHint':'Start typing — real-time results from Docker Hub',
    'msg.searching':'Searching...','msg.dhError':'Docker Hub search error — you may be offline',
    'msg.saving':'Saving...','msg.applying':'Applying...',
    'msg.apiDown':'API not responding',
    // Confirm Dialog
    'confirm.stopTitle':'Stop Container','confirm.stop':'Stop',
    'confirm.restartTitle':'Restart Container','confirm.restart':'Restart',
    'confirm.cancel':'Cancel','confirm.ok':'Confirm',
    'confirm.stopMsg':'Are you sure you want to stop this container?',
    'confirm.restartMsg':'Are you sure you want to restart this container?',
    'confirm.deleteTitle':'Delete Service','confirm.delete':'Delete',
    'confirm.deleteMsg':'Are you sure you want to delete this service?',
    'confirm.deleteDetail':'This service will be completely removed: container will be stopped and removed, compose definition and settings will be cleaned up. Project files are never touched.',
    'msg.deleting':'deleting...',
    'confirm.deploy':'Deploy','confirm.deployMsg':'Do you want to deploy this service?',
    // Card
    'card.on':'On','card.off':'Off',
    // Settings
    'settings.title':'HomeBase Settings','settings.health':'System Health','settings.healthSub':'Real-time resource usage',
    'settings.config':'Configuration','settings.configSub':'Application settings',
    'settings.polling':'Polling Interval','settings.theme':'Theme',
    'settings.activeContainers':'Active Containers','settings.registeredServices':'Registered Services',
    'settings.protectedContainers':'Protected Containers','settings.none':'None',
    'settings.homebaseSettings':'HomeBase Settings','settings.homebaseSettingsSub':'Environment variables',
    'settings.firewall':'Firewall — All Ports','settings.firewallSub':'Port access management',
    'settings.recentChanges':'Recent Changes','settings.recentChangesSub':'Recent operations',
    'settings.disabledContainers':'Disabled Containers','settings.enableAll':'Enable All',
    'settings.enable':'Enable','settings.searchPlaceholder':'Search settings...',
    'settings.language':'Language','settings.syncFirewall':'Synchronize','settings.portSearch':'Search port...',
    'settings.memUsed':'in use',
    // Port Toggle
    'port.exposed':'Exposed','port.localOnly':'Local Only',
    // Wizard
    'wizard.title':'Add Service','wizard.dockerhub':'Docker Hub Search','wizard.recommended':'Recommended','wizard.manual':'Manual',
    'wizard.step1':'Basics','wizard.step2':'Network','wizard.step3':'Storage & Env','wizard.step4':'Preview',
    'wizard.name':'Service Name','wizard.image':'Docker Image','wizard.desc':'Description','wizard.icon':'Icon',
    'wizard.color':'Color','wizard.ports':'Port Mapping','wizard.volumes':'Volumes','wizard.env':'Environment',
    'wizard.restartPolicy':'Restart Policy','wizard.addPort':'+ Add Port','wizard.addVolume':'+ Add Volume','wizard.addEnv':'+ Add Env',
    'wizard.next':'Next','wizard.back':'Back','wizard.deploy':'Deploy','wizard.deployProgress':'Deploying...',
    'wizard.summary':'Summary','wizard.yamlPreview':'YAML Preview','wizard.yamlHint':'Preview will appear as you fill in the fields',
    'wizard.namePlaceholder':'e.g. My Service','wizard.imagePlaceholder':'e.g. nginx:latest','wizard.descPlaceholder':'Service description',
    // Editor
    'editor.title':'Edit Service','editor.addTitle':'Add New Service','editor.info':'Service Info',
    'editor.name':'Name','editor.desc':'Description','editor.icon':'Icon URL','editor.color':'Color',
    'editor.container':'Container Name','editor.preferPort':'PreferPort','editor.urlPath':'URL Path',
    'editor.sort':'Sort Order','editor.save':'Save','editor.add':'Add','editor.pickIcon':'Pick',
    'editor.config':'Configuration',
    // Containers
    'containers.title':'All Containers','containers.noContainers':'No running containers found',
    'containers.loading':'Loading...','containers.dataLoading':'Collecting data...',
    'containers.log':'Log','containers.protected':'protected',
    // Audit
    'audit.title':'Audit Log','audit.allActions':'All Actions','audit.noRecords':'No records found',
    'audit.loadFail':'Failed to load records','audit.time':'Time','audit.action':'Action',
    'audit.target':'Target','audit.detail':'Detail','audit.records':'records',
    'audit.page':'Page','audit.first':'First','audit.prev':'Previous','audit.next':'Next','audit.last':'Last',
    'audit.fromDate':'Start date','audit.toDate':'End date','audit.search':'Search...',
    // Logs panel
    'logs.title':'Container Logs','logs.lines':'lines','logs.autoScroll':'Auto-scroll','logs.refresh':'Refresh','logs.close':'Close',
    'logs.loading':'Loading logs...','logs.error':'Error: ',
    // Empty states
    'empty.firstDeploy':'Deploy your first service',
    'empty.firstDeployDesc':'Search Docker Hub, pick from catalog, or configure manually.',
    'empty.noMatch':'No services match your search','empty.clearSearch':'Clear Search',
    'empty.noSettings':'No settings found. Settings will appear here after configuring services.',
    'empty.noMatchSettings':'No settings match',
    // Search
    'search.placeholder':'Search services...','search.portPlaceholder':'Search port...',
    // Container detail
    'detail.resources':'Resource Usage','detail.info':'Container Info',
    'detail.created':'Created','detail.usage':'Usage','detail.temp':'Temperature','detail.power':'Power',
    'detail.disk':'Disk','detail.writableLayer':'Writable layer — Total image:',
    'detail.health':'Health','detail.network':'Network','detail.blockio':'Block I/O','detail.pids':'PIDs',
    // Misc
    'misc.active':'active','misc.idle':'idle','misc.containerActive':'containers active',
    'misc.now':'now','misc.ago':'ago','misc.saveApply':'Save & Apply',
    'misc.configure':'Configure','misc.all':'All','misc.addService':'Add Service',
    'misc.configureService':'Configure',
    // AI
    'settings.aiConfig':'AI Configuration','settings.aiConfigSub':'AI integration settings',
    'wizard.ai':'AI Wizard',
    'ai.selectProject':'Select Project Directory','ai.selectedPath':'Selected Path',
    'ai.analyze':'Analyze','ai.analyzing':'Analyzing project structure...',
    'ai.explanation':'AI Explanation',
    'ai.noApiKey':'OpenAI API key not configured. Set it in Settings.',
    'ai.disabled':'AI feature is disabled. Enable in Settings.',
    'ai.error':'AI analysis failed','ai.retry':'Retry',
    'ai.dockerfile':'Generated Dockerfile','ai.generatedConfig':'Generated Configuration',
    'ai.step1':'Select Project','ai.step2':'AI Analysis','ai.step3':'Review','ai.step4':'Deploy',
    'ai.scanning':'Scanned files','ai.goToSettings':'Go to Settings',
  }
};
let currentLang = localStorage.getItem('lang') || 'tr';
function t(key) { return LANG[currentLang]?.[key] ?? LANG['tr']?.[key] ?? key; }
function setLang(lang) {
  currentLang = lang;
  localStorage.setItem('lang', lang);
  updateStaticStrings();
  renderServices(); renderContainers();
  if ($('#settingsView').classList.contains('active')) renderEnv();
  // Update lang toggle button text
  const langBtn = $('#langToggle');
  if (langBtn) langBtn.textContent = currentLang.toUpperCase();
}
function updateStaticStrings() {
  $$('[data-i18n]').forEach(el => el.textContent = t(el.dataset.i18n));
  $$('[data-i18n-placeholder]').forEach(el => el.placeholder = t(el.dataset.i18nPlaceholder));
  $$('[data-i18n-title]').forEach(el => el.title = t(el.dataset.i18nTitle));
}

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
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span class="toast-icon">${icons[type] || icons.info}</span><span class="toast-msg">${msg}</span><button class="toast-close" onclick="this.parentElement.classList.add('removing');setTimeout(()=>this.parentElement.remove(),300)"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>`;
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
        const close = (result) => {
            overlay.remove();
            resolve(result);
        };
        overlay.querySelector('.modal-cancel').addEventListener('click', () => close(false));
        overlay.querySelector('.modal-confirm').addEventListener('click', () => close(true));
        overlay.addEventListener('click', e => { if (e.target === overlay) close(false); });
    });
}

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

// ─── Service → Settings mapping (ServiceId-aware, compose-aware fallback) ───
function getEnvForService(svc) {
    if (!envSections.length) return null;
    // Primary: match by serviceId
    if (svc.id) {
        for (const sec of envSections) {
            if (sec.serviceId && sec.serviceId === svc.id) return sec;
        }
    }
    // Fallback: match by composeName
    if (svc.composeName) {
        for (const sec of envSections) {
            if (sec.composeName === svc.composeName) return sec;
        }
    }
    // Match by containerName
    for (const sec of envSections) {
        if (sec.composeName && sec.composeName === svc.containerName) return sec;
    }
    // Fuzzy match: if service name appears in section name
    for (const sec of envSections) {
        if (sec.name.toLowerCase().includes(svc.name.toLowerCase().split(' ')[0])) return sec;
    }
    return null;
}

// Load env data at startup (for card settings display)
async function loadEnvData() {
    try {
        const res = await fetch('/api/Settings/env/raw');
        if (res.ok) envSections = await res.json();
    } catch {}
}

// ─── Wait for service readiness after container recreation ───
function waitForServiceReady(containerName) {
    transitioning.add(containerName);
    updateCardState(containerName);
    renderServices();

    let checks = 0;
    let containerMissing = 0; // track how many times container is not found
    const poll = setInterval(async () => {
        checks++;
        if (checks > 40) { // 60s timeout
            clearInterval(poll);
            transitioning.delete(containerName);
            fetchAll();
            showToast(`${containerName} ${t('msg.timeout')}`, 'warning');
            return;
        }
        try {
            const r = await fetch('/api/Containers');
            if (!r.ok) return;
            const ctrs = await r.json();
            const ctr = ctrs.find(c => c.name === containerName);

            if (!ctr) {
                containerMissing++;
                // Container might be recreating via compose — wait a bit
                // But if missing for too long, give up
                if (containerMissing > 10) {
                    clearInterval(poll);
                    transitioning.delete(containerName);
                    containers = ctrs;
                    fetchAll();
                    showToast(`${containerName} ${t('msg.notFound')}`, 'warning');
                }
                return;
            }
            containerMissing = 0; // reset counter once found

            if (ctr.state !== 'running') return; // not running yet

            // Container running, now check if service HTTP endpoint is reachable
            const svc = services.find(s => s.containerName === containerName);
            if (!svc) { clearInterval(poll); transitioning.delete(containerName); containers = ctrs; fetchAll(); return; }
            const url = getSvcUrl(svc, ctr);
            if (!url || url === '#') {
                // No URL to check, just wait a bit for container to stabilize
                if (checks >= 3) {
                    clearInterval(poll);
                    transitioning.delete(containerName);
                    containers = ctrs;
                    updateStats(); renderServices(); renderContainers();
                    showToast(`${containerName} ${t('msg.started')}`, 'success');
                }
                return;
            }
            try {
                const hc = await fetch(url, { mode: 'no-cors', signal: AbortSignal.timeout(3000) });
                clearInterval(poll);
                transitioning.delete(containerName);
                containers = ctrs;
                updateStats(); renderServices(); renderContainers();
                showToast(`${containerName} ${t('msg.ready')}`, 'success');
            } catch {
                // Service not yet reachable, keep polling
            }
        } catch {}
    }, 1500);
}

// ─── Toggle Container ───
async function toggleContainer(name, state) {
    if (transitioning.has(name)) return;
    const action = state === 'running' ? 'stop' : 'start';

    if (action === 'stop') {
        const ok = await showConfirm(
            t('confirm.stopTitle'),
            `<strong>${name}</strong> ${t('confirm.stopMsg')}`,
            t('confirm.stop'), 'danger'
        );
        if (!ok) return;
    }

    transitioning.add(name);
    updateCardState(name);
    renderServices(); // Immediately show transitioning state

    try {
        const res = await fetch(`/api/Containers/${encodeURIComponent(name)}/${action}`, { method: 'POST' });
        if (!res.ok) {
            let errMsg = `${action} ${t('msg.actionFail')}`;
            try {
                const data = await res.json();
                // API returns ApiError with code/message/detail
                errMsg = data.message || data.error || data.detail || data.Message || errMsg;
            } catch {}
            throw new Error(errMsg);
        }

        // For start: use waitForServiceReady which checks HTTP reachability
        if (action === 'start') {
            waitForServiceReady(name);
            return;
        }

        // Stop: poll until container is no longer running (or gone)
        let checks = 0;
        const poll = setInterval(async () => {
            checks++;
            if (checks > 20) {
                clearInterval(poll);
                transitioning.delete(name);
                showToast(`${name} ${t('msg.actionTimeout')}`, 'warning');
                fetchAll();
                return;
            }
            try {
                const r = await fetch('/api/Containers');
                if (!r.ok) return;
                const ctrs = await r.json();
                const ctr = ctrs.find(c => c.name === name);
                // Container is stopped or doesn't exist anymore
                if (!ctr || ctr.state !== 'running') {
                    clearInterval(poll);
                    transitioning.delete(name);
                    containers = ctrs;
                    updateStats();
                    renderServices();
                    renderContainers();
                    showToast(`${name} ${t('msg.stopped')}`, 'success');
                }
            } catch {}
        }, 1500);
    } catch (err) {
        transitioning.delete(name);
        fetchAll(); // Re-render everything to clear stuck states
        showToast(err.message, 'error');
    }
}

async function restartContainer(name) {
    if (transitioning.has(name)) return;
    const ok = await showConfirm(
        t('confirm.restartTitle'),
        `<strong>${name}</strong> ${t('confirm.restartMsg')}`,
        t('confirm.restart'), 'danger'
    );
    if (!ok) return;

    transitioning.add(name);
    updateCardState(name);

    try {
        const res = await fetch(`/api/Containers/${encodeURIComponent(name)}/restart`, { method: 'POST' });
        if (!res.ok) {
            let errMsg = t('msg.restartFail');
            try { const d = await res.json(); errMsg = d.message || d.error || d.detail || d.Message || errMsg; } catch {}
            throw new Error(errMsg);
        }
        // Use health-check aware waiting
        waitForServiceReady(name);
    } catch (err) {
        transitioning.delete(name);
        fetchAll(); // Re-render to clear stuck states
        showToast(err.message, 'error');
    }
}

// Update a single card's busy state without re-rendering everything
function updateCardState(name) {
    const card = document.querySelector(`.svc-card[data-name="${name}"]`);
    if (!card) return;
    const busy = transitioning.has(name);
    card.classList.toggle('busy', busy);
    const toggle = card.querySelector(`.toggle[data-ctr="${name}"]`);
    if (toggle) toggle.classList.toggle('busy', busy);
    const lbl = card.querySelector('.toggle-lbl');
    if (lbl && busy) {
        const ctr = containers.find(c => c.name === name);
        lbl.textContent = ctr?.state === 'running' ? t('status.stopping') : t('status.starting');
    }
    // Update badge
    const badge = card.querySelector('.badge');
    if (badge && busy) {
        badge.className = 'badge transition';
        const ctr = containers.find(c => c.name === name);
        badge.innerHTML = `<span class="spinner"></span>${ctr?.state === 'running' ? t('status.stopping') : t('status.starting')}`;
    }
}

// ─── Skeleton Rendering ───
function renderSkeletons() {
    const g = $('#servicesGrid');
    g.innerHTML = Array(6).fill(0).map(() => `
        <div class="skeleton-card">
            <div class="sk-row"><div class="sk-circle skeleton"></div><div style="flex:1"><div class="sk-bar w60 skeleton" style="margin-bottom:6px"></div><div class="sk-bar w40 skeleton"></div></div></div>
            <div class="sk-bar w80 skeleton"></div>
            <div class="sk-bar w100 skeleton"></div>
        </div>`).join('');
}

// ─── Fetch ───
async function fetchAll() {
    try {
        const [s, c, d] = await Promise.all([
            fetch('/api/Services'),
            fetch('/api/Containers'),
            fetch('/api/System/disks')
        ]);
        if (!s.ok || !c.ok) throw new Error(t('msg.apiDown'));
        services = (await s.json()).filter(svc => svc.isEnabled !== false);
        containers = await c.json();
        disksData = await d.json();
        renderDisks(disksData);
        consecutiveErrors = 0;
        const savedPoll = parseInt(localStorage.getItem('pollInterval')) || 5000;
        if (consecutiveErrors === 0 && pollInterval !== savedPoll) {
            pollInterval = savedPoll;
            restartPolling();
        }
    } catch(e) {
        consecutiveErrors++;
        if (consecutiveErrors >= 3 && pollInterval < 15000) {
            pollInterval = 15000;
            restartPolling();
            showToast(t('msg.connectionIssues'), 'warning', 6000);
        }
        if (initialLoad) {
            $('#servicesGrid').innerHTML = `
                <div class="error-state">
                    <svg class="error-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                    <div class="error-state-msg">${t('msg.connectFail')}</div>
                    <button class="error-state-retry" onclick="fetchAll()">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg>
                        ${t('msg.retry')}
                    </button>
                </div>`;
        }
        return;
    }
    initialLoad = false;
    updateContainerHistory();
    updateStats();
    renderServices();
    renderContainers();
}

function restartPolling() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(fetchAll, pollInterval);
}

function renderDisks(disks) {
    const el = $('#diskBars');
    if (!disks || !disks.length) { el.innerHTML = ''; return; }
    el.innerHTML = disks.map(d => {
        const cls = d.percent > 90 ? 'var(--red)' : d.percent > 70 ? 'var(--yellow)' : 'var(--accent)';
        return `<div style="margin-bottom:.4rem">
            <div class="disk-label"><span>${d.name}</span><span>${d.used}/${d.total} GB</span></div>
            <div class="brief-bar"><div class="brief-fill" style="width:${d.percent}%;background:${cls}"></div></div>
        </div>`;
    }).join('');
}

// ─── Stats ───
function animateValue(el, newVal, suffix = '') {
    const current = parseFloat(el.textContent) || 0;
    if (Math.abs(current - newVal) < 0.5) { el.textContent = newVal + suffix; return; }
    const steps = 12;
    const diff = newVal - current;
    let step = 0;
    const timer = setInterval(() => {
        step++;
        const val = current + diff * (step / steps);
        el.textContent = (Number.isInteger(newVal) ? Math.round(val) : val.toFixed(1)) + suffix;
        if (step >= steps) clearInterval(timer);
    }, 25);
}

function updateStats() {
    const run = containers.filter(c => c.state === 'running');
    const cpu = run.reduce((a,c) => a + parseFloat(c.stats?.cpu||0), 0);
    const mem = run.reduce((a,c) => a + parseInt(c.stats?.memMB||0), 0);
    cpuH.push(cpu); memH.push(mem);
    if (cpuH.length > HLEN) cpuH.shift();
    if (memH.length > HLEN) memH.shift();

    animateValue($('#totalCpu'), parseFloat(cpu.toFixed(1)), '%');
    animateValue($('#totalMem'), mem, ' MB');
    $('#runCount').textContent = run.length;
    $('#stopCount').textContent = containers.length;

    const cp = Math.min(cpu, 100);
    $('#sidebarCpu').style.width = cp + '%';
    $('#sidebarCpu').style.background = cp > 80 ? 'var(--red)' : cp > 50 ? 'var(--yellow)' : 'var(--accent)';
    $('#sidebarCpuText').textContent = cp.toFixed(0) + '%';

    const mp = Math.min(run.reduce((a,c) => a + parseFloat(c.stats?.memPercent||0), 0), 100);
    $('#sidebarMem').style.width = mp + '%';
    $('#sidebarMem').style.background = mp > 80 ? 'var(--red)' : mp > 50 ? 'var(--yellow)' : 'var(--green)';
    $('#sidebarMemText').textContent = mp.toFixed(0) + '%';

    // Sidebar container count & nav badge
    $('#sidebarCtrCount').innerHTML = `<span class="ctr-num">${run.length}</span> / ${containers.length} ${t('misc.containerActive')}`;
    const navBadge = $('#navSvcCount');
    if (navBadge) navBadge.textContent = run.length;

    // Sidebar network I/O
    let totalRx = 0, totalTx = 0;
    run.forEach(c => { totalRx += c.stats?.rxBytes || 0; totalTx += c.stats?.txBytes || 0; });
    $('#sidebarNet').innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 014-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 01-4 4H3"/></svg> ↓${fmtBytes(totalRx)} ↑${fmtBytes(totalTx)}`;

    miniChart('#cpuChart', cpuH, 'rgba(99,102,241,.5)', 'rgba(99,102,241,.06)');
    miniChart('#memChart', memH, 'rgba(16,185,129,.5)', 'rgba(16,185,129,.06)');
}

function fmtBytes(b) {
    if (b < 1024) return b + 'B';
    if (b < 1048576) return (b/1024).toFixed(1) + 'K';
    if (b < 1073741824) return (b/1048576).toFixed(1) + 'M';
    return (b/1073741824).toFixed(2) + 'G';
}

function miniChart(sel, data, stroke, fill) {
    const el = $(sel), w = 72, h = 32;
    if (data.length < 2) { el.innerHTML = ''; return; }
    const mx = Math.max(...data, 1);
    const pts = data.map((v,i) => [(i/(HLEN-1))*w, h-(v/mx)*(h-4)-2]);
    const path = bezierPath(pts);
    const polyPts = pts.map(p => p.join(',')).join(' ');
    el.innerHTML = `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><polygon points="0,${h} ${polyPts} ${w},${h}" fill="${fill}"/><path d="${path}" fill="none" stroke="${stroke}" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
}

function bezierPath(pts) {
    if (pts.length < 2) return '';
    let d = `M${pts[0][0]},${pts[0][1]}`;
    for (let i = 1; i < pts.length; i++) {
        const prev = pts[i-1], curr = pts[i];
        const cpx1 = prev[0] + (curr[0]-prev[0])*0.4;
        const cpx2 = prev[0] + (curr[0]-prev[0])*0.6;
        d += ` C${cpx1},${prev[1]} ${cpx2},${curr[1]} ${curr[0]},${curr[1]}`;
    }
    return d;
}

// ─── Expanded Chart ───
document.querySelectorAll('.stat-card[data-chart]').forEach(card => {
    card.addEventListener('click', () => {
        const type = card.dataset.chart;
        if (!type) return;
        const data = type === 'cpu' ? cpuH : memH;
        const label = type === 'cpu' ? 'CPU (%)' : 'Memory (MB)';
        const color = type === 'cpu' ? '#6366f1' : '#10b981';
        showExpandedChart(label, data, color);
    });
});

function showExpandedChart(label, data, color) {
    if (data.length < 2) return;
    const overlay = document.createElement('div');
    overlay.className = 'chart-expanded';
    overlay.innerHTML = `
        <div class="chart-expanded-inner">
            <div class="chart-expanded-header">
                <h3>${label} — Son ${data.length * 5}s</h3>
                <button class="chart-expanded-close"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
            </div>
            <div class="chart-expanded-body" id="expandedChartBody"></div>
        </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('.chart-expanded-close').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

    const body = overlay.querySelector('#expandedChartBody');
    const W = body.clientWidth, H = 250;
    const mx = Math.max(...data, 1);
    const pad = { t: 20, r: 20, b: 30, l: 45 };
    const cw = W - pad.l - pad.r, ch = H - pad.t - pad.b;
    const pts = data.map((v,i) => [pad.l + (i/(data.length-1))*cw, pad.t + ch - (v/mx)*ch]);
    const path = bezierPath(pts);

    let gridLines = '';
    for (let i = 0; i <= 4; i++) {
        const y = pad.t + (ch/4)*i;
        const val = (mx * (4-i)/4).toFixed(1);
        gridLines += `<line x1="${pad.l}" y1="${y}" x2="${W-pad.r}" y2="${y}" stroke="var(--border)" stroke-width="0.5"/>`;
        gridLines += `<text x="${pad.l-8}" y="${y+4}" fill="var(--text-m)" font-size="10" text-anchor="end">${val}</text>`;
    }
    const intervals = Math.min(6, data.length - 1);
    for (let i = 0; i <= intervals; i++) {
        const idx = Math.floor(i * (data.length-1) / intervals);
        const x = pad.l + (idx/(data.length-1))*cw;
        const secsAgo = (data.length - 1 - idx) * 5;
        const lbl = secsAgo === 0 ? t('misc.now') : `-${secsAgo}s`;
        gridLines += `<text x="${x}" y="${H-5}" fill="var(--text-m)" font-size="10" text-anchor="middle">${lbl}</text>`;
    }

    const polyPts = pts.map(p => p.join(',')).join(' ');
    body.innerHTML = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
        ${gridLines}
        <polygon points="${pad.l},${pad.t+ch} ${polyPts} ${W-pad.r},${pad.t+ch}" fill="${color}15"/>
        <path d="${path}" fill="none" stroke="${color}" stroke-width="2"/>
        ${pts.map((p,i) => `<circle cx="${p[0]}" cy="${p[1]}" r="0" fill="${color}" data-idx="${i}" class="chart-dot"/>`).join('')}
    </svg><div class="chart-tooltip" id="chartTooltip" style="display:none"></div>`;

    const svg = body.querySelector('svg');
    const tooltip = body.querySelector('#chartTooltip');
    svg.addEventListener('mousemove', e => {
        const rect = svg.getBoundingClientRect();
        const mx2 = e.clientX - rect.left;
        let closest = 0, minD = Infinity;
        pts.forEach((p,i) => { const d = Math.abs(p[0] - mx2); if (d < minD) { minD = d; closest = i; } });
        if (minD < 30) {
            tooltip.style.display = 'block';
            tooltip.style.left = pts[closest][0] + 'px';
            tooltip.style.top = pts[closest][1] + 'px';
            tooltip.textContent = data[closest].toFixed(1);
            svg.querySelectorAll('.chart-dot').forEach((dot,i) => dot.setAttribute('r', i === closest ? '4' : '0'));
        } else {
            tooltip.style.display = 'none';
            svg.querySelectorAll('.chart-dot').forEach(dot => dot.setAttribute('r', '0'));
        }
    });
    svg.addEventListener('mouseleave', () => {
        tooltip.style.display = 'none';
        svg.querySelectorAll('.chart-dot').forEach(dot => dot.setAttribute('r', '0'));
    });
}

// ─── Helpers ───
const HOST = location.hostname;
const getCtr = svc => containers.find(c => c.name === svc.containerName);
const barCls = v => { const n = parseFloat(v); return n < 50 ? 'lo' : n < 80 ? 'mi' : 'hi'; };
function getSvcUrl(svc, ctr) {
    if (!ctr || !ctr.ports.length) return '#';
    if (svc.preferPort) {
        const match = ctr.ports.find(p => p.public === svc.preferPort);
        if (match) return `http://${HOST}:${match.public}${svc.urlPath||''}`;
    }
    return `http://${HOST}:${ctr.ports[0].public}${svc.urlPath||''}`;
}
function idleStr(m) {
    if (m == null) return '';
    if (m < 1) return 'active';
    if (m < 60) return `${m}m idle`;
    return `${Math.floor(m/60)}h ${m%60}m idle`;
}
function escHtml(s) { return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

// Format env vars for display in card settings
function formatEnvLabel(key) {
    // STIRLING_PORT → Port, NPM_ADMIN_EMAIL → Admin Email
    const parts = key.split('_');
    // Remove common prefixes (first 1-2 parts are usually the service name)
    const meaningful = parts.length > 2 ? parts.slice(1) : parts;
    return meaningful.map(p => p.charAt(0) + p.slice(1).toLowerCase()).join(' ');
}
function isSecretKey(key) {
    const k = key.toLowerCase();
    return k.includes('password') || k.includes('secret') || k.includes('token');
}

// ─── Smart Render Services (no flicker) ───
function buildCardHtml(svc) {
    const c = getCtr(svc), up = c?.state === 'running';
    const url = getSvcUrl(svc, c);
    const cpu = c?.stats?.cpu||'0', mem = c?.stats?.memMB||'0', mp = c?.stats?.memPercent||'0';
    const prot = c?.protected, idle = up ? idleStr(c?.idleMinutes) : '';
    const idleCls = idle === 'active' ? 'active' : idle ? 'idle' : '';
    const busy = transitioning.has(svc.containerName);
    const stopping = busy && up;

    // Image tag display
    const imageTag = svc.image ? `<div class="svc-image-tag" title="${escHtml(svc.image)}">${escHtml(svc.image)}</div>` : '';
    // Category badge
    const catBadge = svc.category ? `<span class="svc-category">${escHtml(svc.category)}</span>` : '';

    return `<div class="svc-accent" style="background:${svc.color}"></div>
        <a class="svc-body" href="${up && !busy ? url : '#'}" target="${up && !busy ? '_blank' : ''}" ${!up || busy ? 'onclick="return false"' : ''}>
            <img class="svc-logo" src="${svc.icon}" alt="" onerror="this.style.display='none'">
            <div class="svc-info">
                <div class="svc-head">
                    <span class="svc-name">${escHtml(svc.name)}${catBadge}</span>
                    ${busy
                        ? `<span class="badge transition"><span class="spinner"></span>${stopping ? t('status.stopping') : t('status.starting')}</span>`
                        : `<span class="badge ${up?'up':'down'}"><span class="badge-dot"></span>${up?t('status.online'):t('status.offline')}</span>`
                    }
                </div>
                <div class="svc-desc">${escHtml(svc.description)}</div>
                ${imageTag}
                ${up && !stopping ? `<div class="svc-metrics">
                    <div class="metric"><span class="metric-lbl">CPU</span><span class="metric-val">${cpu}% <span class="bar"><span class="bar-fill ${barCls(cpu)}" style="width:${Math.min(cpu,100)}%"></span></span></span></div>
                    <div class="metric"><span class="metric-lbl">MEM</span><span class="metric-val">${mem}MB <span class="bar"><span class="bar-fill ${barCls(mp)}" style="width:${Math.min(mp,100)}%"></span></span></span></div>
                    <div class="metric"><span class="metric-lbl">UP</span><span class="metric-val">${c.status.replace('Up ','')}</span></div>
                </div>` : !busy ? `<div class="svc-metrics"><div class="metric"><span class="metric-lbl">Status</span><span class="metric-val" style="color:var(--red)">${t('status.stopped')}</span></div></div>` : ''}
            </div>
        </a>
        <div class="svc-foot">
            <div style="display:flex;align-items:center;gap:.4rem">
                ${idleCls && !busy ? `<span class="idle-tag ${idleCls}">${idle}</span>` : ''}
            </div>
            <div class="svc-foot-actions">
                <button class="svc-action-btn" onclick="event.preventDefault();event.stopPropagation();restartContainer('${svc.containerName}')" title="${t('confirm.restart')}">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg>
                </button>
                <button class="svc-action-btn" onclick="event.preventDefault();event.stopPropagation();openLogs('${svc.containerName}')" title="${t('logs.title')}">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                </button>
                <button class="svc-action-btn" onclick="event.preventDefault();event.stopPropagation();openServiceEditor(${svc.id})" title="${t('editor.title')}">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                </button>
            </div>
            <div style="display:flex;align-items:center;gap:.5rem">
                ${!prot && c ? `<div class="toggle-area">
                    <span class="toggle-lbl">${busy ? (stopping ? t('status.stopping') : t('status.starting')) : (up ? t('card.on') : t('card.off'))}</span>
                    <button class="toggle ${up ? 'on' : ''} ${busy ? 'busy' : ''}" data-ctr="${svc.containerName}" onclick="event.preventDefault();event.stopPropagation();toggleContainer('${svc.containerName}','${c.state}')"></button>
                </div>` : ''}
            </div>
        </div>`;
}

function renderServices() {
    const g = $('#servicesGrid');
    const filtered = services.filter(svc => {
        return !searchQuery || svc.name.toLowerCase().includes(searchQuery) || (svc.description||'').toLowerCase().includes(searchQuery);
    });

    // Empty states
    if (!initialLoad && services.length === 0) {
        g.innerHTML = `<div class="empty-state" style="padding:4rem 2rem">
            <svg class="empty-state-icon-large" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><polyline points="7.5 4.21 12 6.81 16.5 4.21"/><polyline points="7.5 19.79 7.5 14.6 3 12"/><polyline points="21 12 16.5 14.6 16.5 19.79"/><line x1="12" y1="22" x2="12" y2="12"/></svg>
            <div style="font-size:1rem;font-weight:600;color:var(--text-d);margin-bottom:.3rem">${t('empty.firstDeploy')}</div>
            <div class="empty-state-msg">${t('empty.firstDeployDesc')}</div>
            <button class="section-btn primary" onclick="openOnboardingWizard()" style="margin-top:.5rem">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                ${t('misc.addService')}
            </button>
        </div>`;
        return;
    }
    if (!initialLoad && filtered.length === 0 && searchQuery) {
        g.innerHTML = `<div class="empty-state">
            <svg class="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <div class="empty-state-msg">${t('empty.noMatch')}</div>
            <button class="empty-state-action" onclick="document.getElementById('searchInput').value='';searchQuery='';renderServices();">${t('empty.clearSearch')}</button>
        </div>`;
        return;
    }

    // Clear skeleton placeholders on first real render
    g.querySelectorAll('.skeleton-card').forEach(el => el.remove());

    // Smart DOM update: reuse existing cards, only update innerHTML
    const existingCards = g.querySelectorAll('.svc-card');
    const existingMap = {};
    existingCards.forEach(card => { existingMap[card.dataset.name] = card; });

    const newNames = new Set(filtered.map(s => s.containerName));

    // Remove cards that are no longer in the list
    existingCards.forEach(card => {
        if (!newNames.has(card.dataset.name)) card.remove();
    });

    // Update or create cards in order
    let prevCard = null;
    for (const svc of filtered) {
        const c = getCtr(svc), up = c?.state === 'running';
        const busy = transitioning.has(svc.containerName);
        const stopping = busy && up;

        let card = existingMap[svc.containerName];
        if (!card) {
            // New card
            card = document.createElement('div');
            card.className = `svc-card ${up && !stopping ? '' : 'stopped'} ${busy ? 'busy' : ''}`;
            card.dataset.name = svc.containerName;
            card.innerHTML = buildCardHtml(svc);
            if (prevCard && prevCard.nextSibling) {
                g.insertBefore(card, prevCard.nextSibling);
            } else if (prevCard) {
                g.appendChild(card);
            } else {
                g.prepend(card);
            }
        } else {
            // Update existing card
            card.className = `svc-card ${up && !stopping ? '' : 'stopped'} ${busy ? 'busy' : ''}`;
            card.innerHTML = buildCardHtml(svc);
        }
        prevCard = card;
    }
}

// ─── Render Containers ───
function renderContainers() {
    const body = $('#containersBody');

    // Clear skeleton rows on first real render
    body.querySelectorAll('.skeleton-row').forEach(r => r.remove());

    if (!initialLoad && containers.length === 0) {
        body.innerHTML = `<tr><td colspan="9"><div class="empty-state"><svg class="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/></svg><div class="empty-state-msg">${t('containers.noContainers')}</div></div></td></tr>`;
        return;
    }

    const existingRows = {};
    body.querySelectorAll('tr[data-name]').forEach(r => { existingRows[r.dataset.name] = r; });
    const wantedNames = new Set(containers.map(c => c.name));

    // Remove stale rows
    for (const [name, row] of Object.entries(existingRows)) {
        if (!wantedNames.has(name)) {
            const dr = body.querySelector(`.ctr-detail-row[data-detail="${name}"]`);
            if (dr) dr.remove();
            row.remove();
            expandedContainers.delete(name);
            delete existingRows[name];
        }
    }

    let insertRef = null;
    containers.forEach(c => {
        const cpu = c.stats?.cpu||'-', mem = c.stats?.memMB||'-', mp = c.stats?.memPercent||'0';
        const idle = c.idleMinutes, is = c.state === 'running' ? idleStr(idle) : '';
        const busy = transitioning.has(c.name);
        const isExpanded = expandedContainers.has(c.name);
        const chevron = `<svg class="ctr-expand-icon ${isExpanded ? 'open' : ''}" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>`;

        const cellsHtml = `
            <td class="ctr-expand-cell">${chevron}</td>
            <td><span class="dot ${c.state}"></span></td>
            <td class="ctr-name">${c.name}</td>
            <td class="ctr-img">${c.image}</td>
            <td>${c.status}${is && !busy ? ` <span class="idle-tag ${is==='active'?'active':'idle'}">${is}</span>` : ''}${busy ? ' <span class="badge transition"><span class="spinner"></span></span>' : ''}</td>
            <td>${c.state==='running' ? `${cpu}% <span class="bar"><span class="bar-fill ${barCls(cpu)}" style="width:${Math.min(cpu,100)}%"></span></span>` : '-'}</td>
            <td>${c.state==='running' ? `${mem}MB <span class="bar"><span class="bar-fill ${barCls(mp)}" style="width:${Math.min(mp,100)}%"></span></span>` : '-'}</td>
            <td>${c.ports.map(p=>`<span class="port-chip">${p.public}:${p.private}</span>`).join('')}</td>
            <td><div style="display:flex;gap:.3rem;align-items:center">
                ${c.state==='running' ? `<button class="log-btn" onclick="event.stopPropagation();openLogs('${c.name}')">${t('containers.log')}</button>` : ''}
                ${!c.protected ? `<button class="toggle ${c.state==='running'?'on':''} ${busy?'busy':''}" data-ctr="${c.name}" onclick="event.stopPropagation();toggleContainer('${c.name}','${c.state}')"></button>` : `<span style="font-size:.6rem;color:var(--text-m)">${t('containers.protected')}</span>`}
            </div></td>`;

        let row = existingRows[c.name];
        if (row) {
            row.innerHTML = cellsHtml;
            row.className = isExpanded ? 'ctr-row-expanded' : '';
        } else {
            row = document.createElement('tr');
            row.dataset.name = c.name;
            row.className = isExpanded ? 'ctr-row-expanded' : '';
            row.style.cursor = 'pointer';
            row.innerHTML = cellsHtml;
            row.addEventListener('click', () => toggleContainerDetail(c.name));
            if (insertRef) insertRef.insertAdjacentElement('afterend', row);
            else body.prepend(row);
        }

        // Detail row: only create once, then patch live values
        const existingDetail = body.querySelector(`.ctr-detail-row[data-detail="${c.name}"]`);
        if (isExpanded) {
            if (!existingDetail) {
                const dr = document.createElement('tr');
                dr.className = 'ctr-detail-row';
                dr.dataset.detail = c.name;
                dr.innerHTML = `<td colspan="9"><div class="ctr-detail"><div class="ctr-detail-loading"><span class="spinner"></span> ${t('containers.loading')}</div></div></td>`;
                row.insertAdjacentElement('afterend', dr);
                // Full render for new detail rows
                renderContainerDetail(c.name);
            } else {
                // Patch only live values — no DOM rebuild
                patchDetailLiveValues(c.name);
            }
            insertRef = body.querySelector(`.ctr-detail-row[data-detail="${c.name}"]`) || row;
        } else {
            if (existingDetail) existingDetail.remove();
            insertRef = row;
        }
    });
}

// ─── Container History ───
function updateContainerHistory() {
    containers.forEach(c => {
        if (c.state !== 'running' || !c.stats) return;
        if (!containerHistory[c.name]) containerHistory[c.name] = { cpu: [], mem: [], rx: [], tx: [] };
        const h = containerHistory[c.name];
        h.cpu.push(parseFloat(c.stats.cpu || 0));
        h.mem.push(parseInt(c.stats.memMB || 0));
        h.rx.push(c.stats.rxBytes || 0);
        h.tx.push(c.stats.txBytes || 0);
        if (h.cpu.length > CTR_HLEN) { h.cpu.shift(); h.mem.shift(); h.rx.shift(); h.tx.shift(); }
    });
}

// ─── Container Detail Panel ───
function toggleContainerDetail(name) {
    if (expandedContainers.has(name)) {
        expandedContainers.delete(name);
        const detailRow = document.querySelector(`.ctr-detail-row[data-detail="${name}"]`);
        if (detailRow) detailRow.remove();
        // Update main row style
        const mainRow = document.querySelector(`tr[data-name="${name}"]`);
        if (mainRow) mainRow.classList.remove('ctr-row-expanded');
    } else {
        expandedContainers.add(name);
        // Update main row style
        const mainRow = document.querySelector(`tr[data-name="${name}"]`);
        if (mainRow) mainRow.classList.add('ctr-row-expanded');
        // Insert detail row immediately
        insertDetailRow(name);
        // Fetch inspect data
        loadContainerInspect(name);
    }
}

function insertDetailRow(name) {
    // Remove existing if any
    const existing = document.querySelector(`.ctr-detail-row[data-detail="${name}"]`);
    if (existing) existing.remove();

    const mainRow = document.querySelector(`tr[data-name="${name}"]`);
    if (!mainRow) return;

    const detailRow = document.createElement('tr');
    detailRow.className = 'ctr-detail-row';
    detailRow.dataset.detail = name;
    detailRow.innerHTML = `<td colspan="9"><div class="ctr-detail"><div class="ctr-detail-loading"><span class="spinner"></span> ${t('containers.loading')}</div></div></td>`;
    mainRow.insertAdjacentElement('afterend', detailRow);

    // Render immediately with available stats data
    renderContainerDetail(name);
}

async function loadContainerInspect(name) {
    if (containerInspectCache[name]) {
        renderContainerDetail(name);
        return;
    }
    try {
        const res = await fetch(`/api/Containers/${encodeURIComponent(name)}/inspect`);
        if (res.ok) {
            containerInspectCache[name] = await res.json();
            renderContainerDetail(name);
        }
    } catch {}
}

function renderContainerDetail(name) {
    const detailRow = document.querySelector(`.ctr-detail-row[data-detail="${name}"]`);
    if (!detailRow) return;
    const c = containers.find(ct => ct.name === name);
    if (!c) return;

    const inspect = containerInspectCache[name];
    const h = containerHistory[name];
    const s = c.stats;

    // Gauges
    const cpuVal = parseFloat(s?.cpu || 0);
    const memMB = parseInt(s?.memMB || 0);
    const memPct = parseFloat(s?.memPercent || 0);
    const blockR = s?.blockRead || 0;
    const blockW = s?.blockWrite || 0;
    const rxB = s?.rxBytes || 0;
    const txB = s?.txBytes || 0;
    const pids = s?.pidCount || 0;

    const detailSparkline = detailSparklineSvg; // alias

    // CPU gauge with limit info
    let cpuLimitTag = '';
    if (inspect?.cpuLimit > 0) cpuLimitTag = `<span class="ctr-limit-tag">Limit: ${inspect.cpuLimit.toFixed(1)} core</span>`;

    // Memory gauge with limit info
    let memLimitTag = '';
    if (inspect?.memoryLimit > 0) {
        const limitMB = Math.round(inspect.memoryLimit / 1024 / 1024);
        const limitStr = limitMB >= 1024 ? (limitMB / 1024).toFixed(1) + 'GB' : limitMB + 'MB';
        memLimitTag = `<span class="ctr-limit-tag">Limit: ${limitStr}</span>`;
    }

    // Disk usage
    let diskHtml = '';
    if (inspect) {
        const sizeRw = inspect.sizeRw || 0;
        const sizeRoot = inspect.sizeRootFs || 0;
        if (sizeRw > 0 || sizeRoot > 0) {
            diskHtml = `<div class="ctr-gauge">
                <div class="ctr-gauge-header"><span>${t('detail.disk')}</span><span class="ctr-gauge-val">${fmtBytes(sizeRw)}</span></div>
                <div class="ctr-gauge-sub">${t('detail.writableLayer')} ${fmtBytes(sizeRoot)}</div>
            </div>`;
        }
    }

    // GPU section
    let gpuHtml = '';
    if (gpuInfo?.available && gpuInfo.devices?.length > 0) {
        gpuHtml = gpuInfo.devices.map(gpu => `
            <div class="ctr-gauge ctr-gauge-gpu">
                <div class="ctr-gauge-header"><span>GPU ${gpu.index}: ${escHtml(gpu.name)}</span></div>
                <div class="ctr-gpu-metrics">
                    <span class="ctr-gpu-metric"><span class="ctr-gpu-lbl">${t('detail.usage')}</span>${gpu.utilizationGpu}</span>
                    <span class="ctr-gpu-metric"><span class="ctr-gpu-lbl">VRAM</span>${gpu.memoryUsed} / ${gpu.memoryTotal}</span>
                    <span class="ctr-gpu-metric"><span class="ctr-gpu-lbl">${t('detail.temp')}</span>${gpu.temperatureC}</span>
                    <span class="ctr-gpu-metric"><span class="ctr-gpu-lbl">${t('detail.power')}</span>${gpu.powerDraw}</span>
                </div>
            </div>`).join('');
    }

    // Info section
    let infoHtml = '';
    if (inspect) {
        const created = new Date(inspect.created).toLocaleDateString(currentLang === 'en' ? 'en-US' : 'tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

        // Health status badge
        let healthBadge = '';
        if (inspect.healthStatus) {
            const hCls = inspect.healthStatus === 'healthy' ? 'up' : inspect.healthStatus === 'unhealthy' ? 'down' : 'transition';
            healthBadge = `<div class="ctr-info-item"><span class="ctr-info-label">${t('detail.health')}</span><span class="badge ${hCls}" style="font-size:.6rem">${inspect.healthStatus}</span></div>`;
        }

        // Restart policy
        let restartPolicyStr = inspect.restartPolicy || 'no';
        if (inspect.restartMaxRetry > 0) restartPolicyStr += ` (max: ${inspect.restartMaxRetry})`;

        // Networks
        let networksHtml = '';
        if (inspect.networks?.length > 0) {
            networksHtml = inspect.networks.map(n =>
                `<div class="ctr-info-item"><span class="ctr-info-label">${escHtml(n.name)}</span><span class="ctr-info-value">${n.ipAddress}${n.gateway ? ` <span class="txt-muted">(gw: ${n.gateway})</span>` : ''}</span></div>`
            ).join('');
        }

        infoHtml = `
            <div class="ctr-info-grid">
                <div class="ctr-info-section-title">${t('detail.info')}</div>
                <div class="ctr-info-item"><span class="ctr-info-label">Image</span><span class="ctr-info-value" title="${escHtml(inspect.image)}">${escHtml(inspect.image)}</span></div>
                <div class="ctr-info-item"><span class="ctr-info-label">Image ID</span><span class="ctr-info-value">${inspect.imageId}</span></div>
                <div class="ctr-info-item"><span class="ctr-info-label">${t('detail.created')}</span><span class="ctr-info-value">${created}</span></div>
                <div class="ctr-info-item"><span class="ctr-info-label">Restart</span><span class="ctr-info-value">${inspect.restartCount} <span class="txt-muted">(policy: ${restartPolicyStr})</span></span></div>
                ${healthBadge}
                ${networksHtml ? `<div class="ctr-info-section-title" style="margin-top:.5rem">${t('detail.network')}</div>${networksHtml}` : ''}
            </div>`;
    }

    // Mounts
    let mountsHtml = '';
    if (inspect?.mounts?.length > 0) {
        mountsHtml = `
            <div class="ctr-mounts">
                <div class="ctr-mounts-header">Volumes (${inspect.mounts.length})</div>
                ${inspect.mounts.map(m => `
                    <div class="ctr-mount">
                        <span class="ctr-mount-type">${m.type}</span>
                        <span class="ctr-mount-path">${escHtml(m.source)} → ${escHtml(m.destination)}</span>
                        ${m.readOnly ? '<span class="ctr-mount-ro">RO</span>' : ''}
                    </div>`).join('')}
            </div>`;
    }

    detailRow.innerHTML = `<td colspan="9"><div class="ctr-detail">
        <div class="ctr-detail-grid">
            <div class="ctr-gauges">
                <div class="ctr-gauges-title">${t('detail.resources')}</div>
                <div class="ctr-gauge">
                    <div class="ctr-gauge-header"><span>CPU</span><span class="ctr-gauge-val"><span data-live="cpu">${cpuVal.toFixed(1)}%</span> ${cpuLimitTag}</span></div>
                    <div class="ctr-mini-chart" data-chart-type="cpu">${detailSparkline(h?.cpu, '#6366f1')}</div>
                </div>
                <div class="ctr-gauge">
                    <div class="ctr-gauge-header"><span>Memory</span><span class="ctr-gauge-val"><span data-live="mem">${memMB}MB (${memPct}%)</span> ${memLimitTag}</span></div>
                    <div class="ctr-mini-chart" data-chart-type="mem">${detailSparkline(h?.mem, '#10b981')}</div>
                </div>
                ${diskHtml}
                <div class="ctr-gauge">
                    <div class="ctr-gauge-header"><span>${t('detail.blockio')}</span><span class="ctr-gauge-val" data-live="blockio">R:${fmtBytes(blockR)} W:${fmtBytes(blockW)}</span></div>
                </div>
                <div class="ctr-gauge">
                    <div class="ctr-gauge-header"><span>${t('detail.network')}</span><span class="ctr-gauge-val" data-live="net">↓${fmtBytes(rxB)} ↑${fmtBytes(txB)}</span></div>
                </div>
                <div class="ctr-gauge">
                    <div class="ctr-gauge-header"><span>${t('detail.pids')}</span><span class="ctr-gauge-val" data-live="pids">${pids}</span></div>
                </div>
                ${gpuHtml}
            </div>
            <div class="ctr-detail-info">
                ${infoHtml}
            </div>
        </div>
        ${mountsHtml}
    </div></td>`;
}

// ─── Patch Detail Live Values (no DOM rebuild) ───
function patchDetailLiveValues(name) {
    const detailRow = document.querySelector(`.ctr-detail-row[data-detail="${name}"]`);
    if (!detailRow) return;
    const c = containers.find(ct => ct.name === name);
    if (!c) return;
    const s = c.stats;
    const h = containerHistory[name];

    // Patch gauge values via data-live attributes
    const patches = {
        cpu: parseFloat(s?.cpu || 0).toFixed(1) + '%',
        mem: `${parseInt(s?.memMB || 0)}MB (${parseFloat(s?.memPercent || 0)}%)`,
        blockio: `R:${fmtBytes(s?.blockRead || 0)} W:${fmtBytes(s?.blockWrite || 0)}`,
        net: `↓${fmtBytes(s?.rxBytes || 0)} ↑${fmtBytes(s?.txBytes || 0)}`,
        pids: String(s?.pidCount || 0),
    };
    for (const [key, val] of Object.entries(patches)) {
        const el = detailRow.querySelector(`[data-live="${key}"]`);
        if (el && el.textContent !== val) el.textContent = val;
    }

    // Patch sparklines
    if (h) {
        const cpuChart = detailRow.querySelector('[data-chart-type="cpu"]');
        if (cpuChart) cpuChart.innerHTML = detailSparklineSvg(h.cpu, '#6366f1');
        const memChart = detailRow.querySelector('[data-chart-type="mem"]');
        if (memChart) memChart.innerHTML = detailSparklineSvg(h.mem, '#10b981');
    }
}

function detailSparklineSvg(data, color) {
    if (!data || data.length < 2) return `<div class="ctr-no-data">${t('containers.dataLoading')}</div>`;
    const w = 120, ht = 32;
    const mx = Math.max(...data, 1);
    const pts = data.map((v, i) => [(i / (CTR_HLEN - 1)) * w, ht - (v / mx) * (ht - 4) - 2]);
    const polyPts = pts.map(p => p.join(',')).join(' ');
    const path = bezierPath(pts);
    return `<svg width="${w}" height="${ht}" viewBox="0 0 ${w} ${ht}"><polygon points="0,${ht} ${polyPts} ${w},${ht}" fill="${color}15"/><path d="${path}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round"/></svg>`;
}

// ─── Logs Panel ───
let logsContainer = null;
let logsRefreshTimer = null;

function openLogs(containerName) {
    logsContainer = containerName;
    $('#logsPanelTitle').textContent = containerName;
    $('#logsPanel').classList.add('open');
    $('#logsBody').textContent = t('logs.loading');
    fetchLogs();
    if (logsRefreshTimer) clearInterval(logsRefreshTimer);
    logsRefreshTimer = setInterval(fetchLogs, 3000);
}

function closeLogs() {
    $('#logsPanel').classList.remove('open');
    logsContainer = null;
    if (logsRefreshTimer) { clearInterval(logsRefreshTimer); logsRefreshTimer = null; }
}

async function fetchLogs() {
    if (!logsContainer) return;
    const lines = $('#logsLines').value;
    try {
        const res = await fetch(`/api/Containers/${encodeURIComponent(logsContainer)}/logs?lines=${lines}&timestamps=true`);
        if (!res.ok) throw new Error(t('msg.logFail'));
        const data = await res.json();
        const body = $('#logsBody');
        body.textContent = data.logs || t('msg.logEmpty');
        if ($('#logsAutoScroll').checked) body.scrollTop = body.scrollHeight;
    } catch (err) {
        $('#logsBody').textContent = t('logs.error') + err.message;
    }
}

$('#logsCloseBtn').addEventListener('click', closeLogs);
$('#logsRefreshBtn').addEventListener('click', fetchLogs);
$('#logsLines').addEventListener('change', fetchLogs);

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

// ─── Service Management ───
$('#manageBtn')?.addEventListener('click', () => {
    manageModeActive = !manageModeActive;
    const btn = $('#manageBtn');
    if (btn) {
        btn.style.borderColor = manageModeActive ? 'var(--accent)' : '';
        btn.style.color = manageModeActive ? 'var(--accent-l)' : '';
    }
    $('#servicesGrid').classList.toggle('manage-active', manageModeActive);
    renderServices();
});

async function openServiceEditor(id) {
    const isEdit = id != null;
    const svc = isEdit ? services.find(s => s.id === id) : null;
    const data = svc || {};

    // Find env section for this service
    const env = isEdit ? getEnvForService(data) : null;
    const envVars = env ? env.vars : [];
    const composeSvc = env ? (env.composeName || data.composeName || '') : (data.composeName || '');
    const serviceId = env ? env.serviceId : (data.id || null);

    // Load port firewall states
    let portStates = [];
    try {
        const psRes = await fetch('/api/Settings/firewall/ports');
        if (psRes.ok) portStates = await psRes.json();
    } catch {}

    // Build env settings rows with port toggle
    let envSettingsHtml = '';
    if (envVars.length > 0) {
        envSettingsHtml = `
            <div class="svc-form-divider">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9"/></svg>
                ${t('editor.config')} (${env.name})
            </div>
            ${envVars.map((v, i) => {
                const isPort = v.isPort || v.key.endsWith('_PORT');
                if (isPort) {
                    const portNum = parseInt(v.value);
                    const ps = portStates.find(p => p.port === portNum);
                    const isExternal = ps ? ps.isExternal : true;
                    return `
                    <div class="svc-form-row">
                        <label>${formatEnvLabel(v.key)} <span class="svc-form-envkey">${v.key}</span></label>
                        <div class="port-row">
                            <input class="env-field" data-env-key="${escHtml(v.key)}" data-env-orig="${escHtml(v.value)}" type="text" value="${escHtml(v.value)}">
                            <div class="port-access-indicator">
                                <button type="button" class="port-mini-toggle ${isExternal ? 'on' : ''}" data-port-key="${escHtml(v.key)}" data-port-external="${isExternal}" onclick="this.classList.toggle('on');this.dataset.portExternal=this.classList.contains('on');const lbl=this.nextElementSibling;lbl.textContent=this.classList.contains('on')?t('port.exposed'):t('port.localOnly');lbl.className='port-access-label '+(this.classList.contains('on')?'external':'local')"></button>
                                <span class="port-access-label ${isExternal ? 'external' : 'local'}">
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                                    ${isExternal ? t('port.exposed') : t('port.localOnly')}
                                </span>
                            </div>
                        </div>
                    </div>`;
                }
                return `
                <div class="svc-form-row">
                    <label>${formatEnvLabel(v.key)} <span class="svc-form-envkey">${v.key}</span></label>
                    <input class="env-field" data-env-key="${escHtml(v.key)}" data-env-orig="${escHtml(v.value)}"
                        type="${isSecretKey(v.key) ? 'password' : 'text'}"
                        value="${escHtml(v.value)}"
                        onfocus="if(this.type==='password')this.type='text'"
                        onblur="if(this.dataset.envKey.toLowerCase().includes('password')||this.dataset.envKey.toLowerCase().includes('secret'))this.type='password'">
                </div>`;
            }).join('')}`;
    }

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
        <div class="modal" style="max-width:540px">
            <h3>${isEdit ? t('editor.title') : t('editor.addTitle')}</h3>
            <div class="svc-form" style="max-height:70vh;overflow-y:auto;padding-right:.3rem">
                <div class="svc-form-divider">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/></svg>
                    ${t('editor.info')}
                </div>
                <div class="svc-form-row"><label>${t('editor.name')}</label><input id="svcName" value="${escHtml(data.name||'')}"></div>
                <div class="svc-form-row"><label>${t('editor.desc')}</label><input id="svcDesc" value="${escHtml(data.description||'')}"></div>
                <div class="svc-form-grid">
                    <div class="svc-form-row"><label>${t('editor.icon')}</label>
                        <div class="icon-input-row">
                            <input id="svcIcon" value="${escHtml(data.icon||'')}" style="flex:1">
                            <button type="button" class="icon-picker-btn" onclick="openIconPicker(this.parentElement.querySelector('#svcIcon'),this.parentElement.querySelector('.icon-preview'))">${t('editor.pickIcon')}</button>
                            <img class="icon-preview" src="${escHtml(data.icon||'')}" alt="" style="${data.icon ? '' : 'display:none'}" onerror="this.style.display='none'">
                        </div>
                    </div>
                    <div class="svc-form-row"><label>${t('editor.color')}</label><input id="svcColor" type="color" value="${(data.color && /^#[0-9a-fA-F]{6}$/.test(data.color)) ? data.color : '#6366f1'}"></div>
                </div>
                <div class="svc-form-row"><label>${t('editor.container')}</label><input id="svcContainer" value="${escHtml(data.containerName||'')}"></div>
                <div class="svc-form-grid">
                    <div class="svc-form-row"><label>${t('editor.preferPort')}</label><input id="svcPort" type="number" value="${data.preferPort||''}"></div>
                    <div class="svc-form-row"><label>${t('editor.urlPath')}</label><input id="svcUrlPath" value="${escHtml(data.urlPath||'')}"></div>
                </div>
                <div class="svc-form-row"><label>${t('editor.sort')}</label><input id="svcSort" type="number" value="${data.sortOrder||0}"></div>
                ${envSettingsHtml}
            </div>
            <div class="modal-actions" style="margin-top:1rem">
                ${isEdit && !containers.find(c => c.name === data.containerName)?.protected ? `<button class="svc-delete-btn" id="svcDeleteBtn">${t('confirm.delete')}</button>` : '<span></span>'}
                <div style="display:flex;gap:.5rem">
                    <button class="modal-cancel">${t('confirm.cancel')}</button>
                    <button class="modal-confirm" id="svcSaveBtn">${isEdit ? t('editor.save') : t('editor.add')}</button>
                </div>
            </div>
        </div>`;
    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    overlay.querySelector('.modal-cancel').addEventListener('click', close);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

    const deleteBtn = overlay.querySelector('#svcDeleteBtn');
    if (deleteBtn) {
        deleteBtn.addEventListener('click', async () => {
            overlay.remove();
            await deleteService(id, data.name);
        });
    }

    overlay.querySelector('#svcSaveBtn').addEventListener('click', async () => {
        const btn = overlay.querySelector('#svcSaveBtn');
        const formData = {
            name: overlay.querySelector('#svcName').value.trim(),
            description: overlay.querySelector('#svcDesc').value.trim(),
            icon: overlay.querySelector('#svcIcon').value.trim(),
            color: overlay.querySelector('#svcColor').value,
            containerName: overlay.querySelector('#svcContainer').value.trim(),
            preferPort: parseInt(overlay.querySelector('#svcPort').value) || null,
            urlPath: overlay.querySelector('#svcUrlPath').value.trim() || null,
            sortOrder: parseInt(overlay.querySelector('#svcSort').value) || 0,
            isEnabled: true,
        };
        if (!formData.name || !formData.containerName) {
            showToast(t('msg.nameRequired'), 'warning');
            return;
        }

        btn.disabled = true;
        btn.innerHTML = `<span class="spinner"></span> ${t('msg.saving')}`;

        try {
            // 1. Save service metadata
            const svcUrl = isEdit ? `/api/Services/${id}` : '/api/Services';
            const method = isEdit ? 'PUT' : 'POST';
            const res = await fetch(svcUrl, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(formData) });
            if (!res.ok) throw new Error(t('msg.saveFail'));

            // 2a. Save port firewall toggles
            const portToggles = overlay.querySelectorAll('.port-mini-toggle');
            for (const toggle of portToggles) {
                const portKey = toggle.dataset.portKey;
                const isExternal = toggle.dataset.portExternal === 'true';
                const portInput = overlay.querySelector(`.env-field[data-env-key="${portKey}"]`);
                const portVal = parseInt(portInput?.value);
                if (portVal) {
                    try {
                        await fetch('/api/Settings/firewall/toggle', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ port: portVal, external: isExternal, serviceName: composeSvc || null })
                        });
                    } catch {}
                }
            }

            // 2b. Save env changes if any
            const envFields = overlay.querySelectorAll('.env-field');
            const envChanges = [];
            envFields.forEach(inp => {
                if (inp.value !== inp.dataset.envOrig) {
                    envChanges.push({ key: inp.dataset.envKey, value: inp.value, oldValue: inp.dataset.envOrig });
                }
            });

            if (envChanges.length > 0) {
                // Validate ports
                let portValid = true;
                for (const change of envChanges) {
                    if (change.key.includes('PORT')) {
                        try {
                            const vRes = await fetch('/api/Settings/validate-port', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ key: change.key, value: change.value, section: env?.name || '' }),
                            });
                            const vData = await vRes.json();
                            if (!vData.valid) {
                                showToast(vData.error, 'error');
                                portValid = false;
                                break;
                            }
                        } catch {}
                    }
                }

                if (portValid) {
                    const envRes = await fetch('/api/Settings/env', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ changes: envChanges, service: composeSvc, serviceId: serviceId }),
                    });
                    const envResult = await envRes.json();

                    if (envResult.ok) {
                        if (envResult.recreated) {
                            showToast(t('msg.settingsSavedRestart'), 'info');
                            waitForServiceReady(formData.containerName);
                        } else if (envResult.error) {
                            showToast(t('msg.settingsSaveWarn'), 'warning');
                        } else {
                            showToast(t('msg.settingsSaved'), 'success');
                        }
                    } else {
                        showToast(t('msg.settingsSaveWarn') + ': ' + (envResult.error || ''), 'warning');
                    }
                    loadEnvData(); // refresh card chips
                } else {
                    btn.disabled = false;
                    btn.textContent = isEdit ? 'Kaydet' : 'Ekle';
                    return;
                }
            } else {
                showToast(isEdit ? t('msg.svcUpdated') : t('msg.svcAdded'), 'success');
            }

            close();
            fetchAll();
        } catch (err) {
            showToast('Hata: ' + err.message, 'error');
            btn.disabled = false;
            btn.textContent = isEdit ? 'Kaydet' : 'Ekle';
        }
    });
}

async function deleteService(id, name) {
    const ok = await showConfirm(
        t('confirm.deleteTitle'),
        `<strong>${escHtml(name)}</strong><br><br>${t('confirm.deleteDetail')}`,
        t('confirm.delete'),
        'danger'
    );
    if (!ok) return;

    showToast(`${name} ${t('msg.deleting')}`, 'info', 10000);

    try {
        const res = await fetch(`/api/Services/${id}`, { method: 'DELETE' });
        const data = await res.json();
        if (data.ok) {
            showToast(`${name} ${t('msg.svcDeleted')}`, 'success');
            if (data.warnings?.length) {
                data.warnings.forEach(w => showToast(w, 'warning', 5000));
            }
        } else {
            showToast(`${t('msg.svcDeleteFail')}: ${data.error || ''}`, 'error');
        }
        fetchAll();
        loadEnvData();
    } catch (err) {
        showToast(`${t('msg.svcDeleteFail')}: ${err.message}`, 'error');
    }
}

// ─── Settings Page ───
let envData = null;
let settingsSearchQuery = '';

async function loadEnv() {
    try {
        // Ensure containers/services data is loaded (needed for health stats)
        if (!containers.length && !services.length) await fetchAll();
        const res = await fetch('/api/Settings/env/raw');
        envData = await res.json();
        renderEnv();
    } catch {
        showToast(t('msg.settingsFail'), 'error');
    }
}

const systemSections = new Set(['General', 'Dashboard', 'AI Configuration']);

function updatePollInterval(val) {
    pollInterval = parseInt(val);
    localStorage.setItem('pollInterval', pollInterval);
    restartPolling();
    showToast(`Polling interval: ${pollInterval / 1000}s`, 'success');
}

function relativeTime(dateStr) {
    const d = new Date(dateStr);
    const diff = Math.floor((Date.now() - d.getTime()) / 1000);
    const ago = t('misc.ago');
    if (diff < 60) return `${diff}s ${ago}`;
    if (diff < 3600) return `${Math.floor(diff/60)}m ${ago}`;
    if (diff < 86400) return `${Math.floor(diff/3600)}h ${ago}`;
    return `${Math.floor(diff/86400)}d ${ago}`;
}

function getBarColor(pct) {
    return pct > 90 ? 'var(--red)' : pct > 70 ? 'var(--yellow)' : 'var(--accent)';
}

// Find service icon from loaded services list (serviceId-aware, compose-aware fallback)
function getSvcIcon(sectionName, sectionComposeName, serviceId) {
    if (serviceId) {
        const svc = services.find(s => s.id === serviceId);
        if (svc) return svc.icon;
    }
    if (sectionComposeName) {
        const svc = services.find(s => s.composeName === sectionComposeName || s.containerName === sectionComposeName);
        if (svc) return svc.icon;
    }
    const svc = services.find(s => s.name === sectionName);
    return svc ? svc.icon : null;
}

async function renderEnv() {
    const el = $('#envSections');
    if (!envData || !envData.length) {
        el.innerHTML = `<div class="empty-state">
            <svg class="empty-state-icon-large" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9"/></svg>
            <div class="empty-state-msg">${t('empty.noSettings')}</div>
        </div>`;
        return;
    }

    const q = settingsSearchQuery.toLowerCase();
    const systemCat = [];
    envData.forEach((sec, si) => {
        if (q) {
            const nameMatch = sec.name.toLowerCase().includes(q);
            const varMatch = sec.vars.some(v => v.key.toLowerCase().includes(q));
            if (!nameMatch && !varMatch) return;
        }
        if (systemSections.has(sec.name)) systemCat.push({ sec, si });
    });

    let html = '';

    // ── 3A: System Health Dashboard ──
    if (!q) {
        const run = containers.filter(c => c.state === 'running');
        const cpu = run.reduce((a,c) => a + parseFloat(c.stats?.cpu||0), 0);
        const mem = run.reduce((a,c) => a + parseInt(c.stats?.memMB||0), 0);
        const memPct = Math.min(run.reduce((a,c) => a + parseFloat(c.stats?.memPercent||0), 0), 100);
        let totalRx = 0, totalTx = 0;
        run.forEach(c => { totalRx += c.stats?.rxBytes || 0; totalTx += c.stats?.txBytes || 0; });
        const cpuPct = Math.min(cpu, 100);

        html += `<div class="settings-category">
            <div class="settings-cat-header">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
                ${t('settings.health')}
                <span style="font-size:.6rem;font-weight:400;text-transform:none;letter-spacing:0;color:var(--text-m);margin-left:.5rem">${t('settings.healthSub')}</span>
            </div>
            <div class="health-grid">
                <div class="health-card">
                    <div class="health-card-label">CPU</div>
                    <div class="health-card-val" style="color:${getBarColor(cpuPct)}">${cpuPct.toFixed(1)}%</div>
                    <div class="health-bar"><div class="health-bar-fill" style="width:${cpuPct}%;background:${getBarColor(cpuPct)}"></div></div>
                </div>
                <div class="health-card">
                    <div class="health-card-label">Memory</div>
                    <div class="health-card-val" style="color:${getBarColor(memPct)}">${memPct.toFixed(1)}%</div>
                    <div class="health-card-sub">${mem} MB ${t('settings.memUsed')}</div>
                    <div class="health-bar"><div class="health-bar-fill" style="width:${memPct}%;background:${getBarColor(memPct)}"></div></div>
                </div>
                ${(disksData || []).map(d => {
                    const dPct = d.percent || 0;
                    return `<div class="health-card">
                        <div class="health-card-label">Disk — ${escHtml(d.name)}</div>
                        <div class="health-card-val" style="color:${getBarColor(dPct)}">${dPct}%</div>
                        <div class="health-card-sub">${d.used}/${d.total} GB</div>
                        <div class="health-bar"><div class="health-bar-fill" style="width:${dPct}%;background:${getBarColor(dPct)}"></div></div>
                    </div>`;
                }).join('')}
                <div class="health-card">
                    <div class="health-card-label">Network I/O</div>
                    <div class="health-card-val" style="font-size:.85rem">↓${fmtBytes(totalRx)} ↑${fmtBytes(totalTx)}</div>
                </div>
                ${gpuInfo?.available && gpuInfo.devices?.length ? gpuInfo.devices.map(gpu => {
                    const util = parseInt(gpu.utilizationGpu) || 0;
                    return `<div class="health-card">
                        <div class="health-card-label">GPU ${gpu.index}</div>
                        <div class="health-card-val" style="color:${getBarColor(util)}">${util}%</div>
                        <div class="health-card-sub">${gpu.temperatureC} · VRAM ${gpu.memoryUsed}/${gpu.memoryTotal}</div>
                        <div class="health-bar"><div class="health-bar-fill" style="width:${util}%;background:${getBarColor(util)}"></div></div>
                    </div>`;
                }).join('') : ''}
            </div>
        </div>`;
    }

    // ── 3B: Yapılandırma (Configurable Settings) ──
    if (!q || [t('settings.config').toLowerCase(), 'polling', t('settings.theme').toLowerCase()].some(k => k.includes(q))) {
        const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
        html += `<div class="settings-category">
            <div class="settings-cat-header">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12.22 2h-.44a2 2 0 00-2 2v.18a2 2 0 01-1 1.73l-.43.25a2 2 0 01-2 0l-.15-.08a2 2 0 00-2.73.73l-.22.38a2 2 0 00.73 2.73l.15.1a2 2 0 011 1.72v.51a2 2 0 01-1 1.74l-.15.09a2 2 0 00-.73 2.73l.22.38a2 2 0 002.73.73l.15-.08a2 2 0 012 0l.43.25a2 2 0 011 1.73V20a2 2 0 002 2h.44a2 2 0 002-2v-.18a2 2 0 011-1.73l.43-.25a2 2 0 012 0l.15.08a2 2 0 002.73-.73l.22-.39a2 2 0 00-.73-2.73l-.15-.08a2 2 0 01-1-1.74v-.5a2 2 0 011-1.74l.15-.09a2 2 0 00.73-2.73l-.22-.38a2 2 0 00-2.73-.73l-.15.08a2 2 0 01-2 0l-.43-.25a2 2 0 01-1-1.73V4a2 2 0 00-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
                ${t('settings.config')}
                <span style="font-size:.6rem;font-weight:400;text-transform:none;letter-spacing:0;color:var(--text-m);margin-left:.5rem">${t('settings.configSub')}</span>
            </div>
            <div class="env-section open" style="margin-bottom:.75rem">
                <div class="env-body" style="display:block;padding:.5rem">
                    <div class="env-row">
                        <span class="env-key">${t('settings.language')}</span>
                        <select style="background:var(--bg-3);border:1px solid var(--border);border-radius:6px;padding:.3rem .5rem;font-size:.75rem;color:var(--text);font-family:inherit;outline:none" onchange="setLang(this.value)">
                            <option value="tr" ${currentLang==='tr'?'selected':''}>Türkçe</option>
                            <option value="en" ${currentLang==='en'?'selected':''}>English</option>
                        </select>
                    </div>
                    <div class="env-row">
                        <span class="env-key">${t('settings.polling')}</span>
                        <select style="background:var(--bg-3);border:1px solid var(--border);border-radius:6px;padding:.3rem .5rem;font-size:.75rem;color:var(--text);font-family:inherit;outline:none" onchange="updatePollInterval(this.value)">
                            <option value="3000" ${pollInterval===3000?'selected':''}>3s</option>
                            <option value="5000" ${pollInterval===5000?'selected':''}>5s</option>
                            <option value="10000" ${pollInterval===10000?'selected':''}>10s</option>
                            <option value="15000" ${pollInterval===15000?'selected':''}>15s</option>
                            <option value="30000" ${pollInterval===30000?'selected':''}>30s</option>
                        </select>
                    </div>
                    <div class="env-row">
                        <span class="env-key">${t('settings.theme')}</span>
                        <span style="color:var(--text-d);font-size:.78rem">${currentTheme === 'dark' ? 'Dark' : 'Light'}</span>
                    </div>
                    <div class="env-row">
                        <span class="env-key">${t('settings.activeContainers')}</span>
                        <span style="color:var(--text-d);font-size:.78rem">${containers.filter(c=>c.state==='running').length} / ${containers.length}</span>
                    </div>
                    <div class="env-row">
                        <span class="env-key">${t('settings.registeredServices')}</span>
                        <span style="color:var(--text-d);font-size:.78rem">${services.length}</span>
                    </div>
                    <div class="env-row">
                        <span class="env-key">${t('settings.protectedContainers')}</span>
                        <span style="color:var(--text-d);font-size:.78rem">${containers.filter(c=>c.protected).map(c=>c.name).join(', ') || t('settings.none')}</span>
                    </div>
                </div>
            </div>
        </div>`;
    }

    // HomeBase Settings (env vars)
    if (systemCat.length > 0) {
        html += `<div class="settings-category"><div class="settings-cat-header"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/><line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/></svg> ${t('settings.homebaseSettings')} <span style="font-size:.6rem;font-weight:400;text-transform:none;letter-spacing:0;color:var(--text-m);margin-left:.5rem">${t('settings.homebaseSettingsSub')}</span></div>`;
        html += systemCat.map(({ sec, si }) => buildEnvSection(sec, si)).join('');
        html += `</div>`;
    }

    // ── 3C: Enhanced Firewall Port Table ──
    let portTableHtml = '';
    try {
        const psRes = await fetch('/api/Settings/firewall/ports');
        if (psRes.ok) {
            const ports = await psRes.json();
            if (ports.length > 0) {
                portTableHtml = `
                <div class="settings-category">
                    <div class="settings-cat-header">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                        ${t('settings.firewall')}
                        <span class="env-var-count">${ports.length}</span>
                        <span style="font-size:.6rem;font-weight:400;text-transform:none;letter-spacing:0;color:var(--text-m);margin-left:.5rem">${t('settings.firewallSub')}</span>
                    </div>
                    <div class="env-section open" style="margin-bottom:.75rem">
                        <div class="env-body" style="display:block;padding:.5rem">
                            <div style="margin-bottom:.5rem;display:flex;gap:.5rem;align-items:center">
                                <div class="search-box" style="margin:0;max-width:220px;flex:1">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                                    <input type="text" placeholder="Port ara..." autocomplete="off" oninput="filterPortTable(this.value)">
                                </div>
                                <button class="section-btn" onclick="syncFirewall()" title="${t('settings.syncFirewall')}">
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg>
                                    ${t('settings.syncFirewall')}
                                </button>
                            </div>
                            <table class="port-table" id="portTable">
                                <thead><tr><th>Status</th><th>Port</th><th>Protocol</th><th>Service</th><th>${t('port.exposed')}</th></tr></thead>
                                <tbody>
                                    ${ports.map(p => `<tr data-port="${p.port}">
                                        <td><span class="dot" style="width:6px;height:6px;background:${p.isExternal ? 'var(--green)' : 'var(--text-m)'}"></span></td>
                                        <td><span class="port-chip">${p.port}</span></td>
                                        <td>${p.protocol}</td>
                                        <td>${p.serviceComposeName || '-'}</td>
                                        <td><button class="port-mini-toggle ${p.isExternal ? 'on' : ''}" onclick="togglePortExternal(${p.port},this)" title="${p.isExternal ? t('port.exposed') : t('port.localOnly')}"></button></td>
                                    </tr>`).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>`;
            }
        }
    } catch {}
    html += portTableHtml;

    // ── 3D: Son Değişiklikler (Recent Changes) ──
    if (!q) {
        try {
            const logsRes = await fetch('/api/System/logs?limit=8');
            if (logsRes.ok) {
                const logsData = await logsRes.json();
                const logs = logsData.logs || logsData;
                if (logs && logs.length > 0) {
                    html += `<div class="settings-category">
                        <div class="settings-cat-header">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                            ${t('settings.recentChanges')}
                            <span style="font-size:.6rem;font-weight:400;text-transform:none;letter-spacing:0;color:var(--text-m);margin-left:.5rem">${t('settings.recentChangesSub')}</span>
                        </div>
                        <div class="env-section open" style="margin-bottom:.75rem">
                            <div class="env-body" style="display:block;padding:.5rem">
                                <div class="timeline">
                                    ${logs.map(l => `<div class="timeline-item">
                                        <span class="timeline-time">${relativeTime(l.createdAt)}</span>
                                        <span class="action-badge ${l.action || ''}">${l.action || '-'}</span>
                                        <div class="timeline-body">
                                            <div class="timeline-target">${escHtml(l.target || '-')}</div>
                                            <div class="timeline-detail" title="${escHtml(l.details || '')}">${escHtml(l.details || '-')}</div>
                                        </div>
                                    </div>`).join('')}
                                </div>
                            </div>
                        </div>
                    </div>`;
                }
            }
        } catch {}
    }

    // ── 3E: Devre Dışı Container'lar ──
    if (!q) {
        try {
            const disRes = await fetch('/api/Containers/disabled');
            if (disRes.ok) {
                const disabled = await disRes.json();
                if (disabled.length > 0) {
                    html += `<div class="settings-category">
                        <div class="settings-cat-header">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
                            ${t('settings.disabledContainers')}
                            <span class="env-var-count">${disabled.length}</span>
                            <span style="flex:1"></span>
                            <button class="section-btn primary section-btn-sm" onclick="enableAllContainers()">${t('settings.enableAll')}</button>
                        </div>
                        <div class="env-section open" style="margin-bottom:.75rem">
                            <div class="env-body" style="display:block;padding:.5rem">
                                <div class="disabled-list">
                                    ${disabled.map(d => `<div class="disabled-item">
                                        <span class="disabled-item-name">${escHtml(d.name || d.containerName || d)}</span>
                                        <button onclick="enableContainer('${escHtml(d.containerName || d.name || d)}')">${t('settings.enable')}</button>
                                    </div>`).join('')}
                                </div>
                            </div>
                        </div>
                    </div>`;
                }
            }
        } catch {}
    }

    if (!html) {
        html = `<div class="empty-state">
            <svg class="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <div class="empty-state-msg">"${escHtml(settingsSearchQuery)}" ${t('empty.noMatchSettings')}</div>
        </div>`;
    }

    el.innerHTML = html;
}

async function togglePortExternal(port, btn) {
    const isNowExternal = !btn.classList.contains('on');
    btn.classList.toggle('on', isNowExternal);
    try {
        await fetch('/api/Settings/firewall/toggle', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ port, external: isNowExternal })
        });
        showToast(`Port ${port} ${isNowExternal ? t('msg.portToggleOk.open') : t('msg.portToggleOk.close')}`, 'success');
    } catch {
        btn.classList.toggle('on', !isNowExternal);
        showToast(t('msg.portToggleFail'), 'error');
    }
}

function filterPortTable(query) {
    const q = query.toLowerCase().trim();
    const rows = document.querySelectorAll('#portTable tbody tr');
    rows.forEach(row => {
        const port = row.dataset.port || '';
        const text = row.textContent.toLowerCase();
        row.style.display = (!q || port.includes(q) || text.includes(q)) ? '' : 'none';
    });
}

async function syncFirewall() {
    try {
        const res = await fetch('/api/Settings/firewall/sync', { method: 'POST' });
        if (res.ok) {
            showToast(t('msg.firewallSyncOk'), 'success');
            loadEnv();
        } else {
            showToast(t('msg.firewallSyncFail'), 'error');
        }
    } catch {
        showToast(t('msg.firewallSyncFail'), 'error');
    }
}

async function enableContainer(name) {
    try {
        const res = await fetch(`/api/Services/enable/${encodeURIComponent(name)}`, { method: 'POST' });
        if (res.ok) {
            showToast(`${name} ${t('msg.enableOk')}`, 'success');
            fetchAll();
            loadEnv();
        } else {
            showToast(t('msg.enableFail'), 'error');
        }
    } catch {
        showToast(t('msg.enableFail'), 'error');
    }
}

async function enableAllContainers() {
    try {
        const res = await fetch('/api/Containers/enable-all', { method: 'POST' });
        if (res.ok) {
            showToast(t('msg.enableAllOk'), 'success');
            fetchAll();
            loadEnv();
        } else {
            showToast(t('msg.enableAllFail'), 'error');
        }
    } catch {
        showToast('Toplu etkinleştirme hatası', 'error');
    }
}

function buildEnvSection(sec, si) {
    const composeSvc = sec.composeName || '';
    const svcId = sec.serviceId || null;
    const icon = getSvcIcon(sec.name, sec.composeName, svcId);
    const iconHtml = icon ? `<img class="settings-svc-icon" src="${icon}" alt="" onerror="this.style.display='none'">` : '';
    const varCount = sec.vars.length;
    const isSystem = systemSections.has(sec.name);

    // Find the service to show slug badge (for multi-instance disambiguation)
    const svc = svcId ? services.find(s => s.id === svcId) : null;
    const slugBadge = svc && svc.serviceSlug ? `<span class="env-file-target">${svc.serviceSlug}</span>` : '';
    const envTarget = svc && svc.serviceSlug
        ? `<span class="env-file-target">services/${svc.serviceSlug}/.env</span>`
        : '';

    return `
    <div class="env-section" data-si="${si}" data-service-id="${svcId || ''}">
        <div class="env-section-header" onclick="this.parentElement.classList.toggle('open')">
            <span class="env-section-title">
                <svg class="chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
                ${iconHtml}
                ${sec.name}
                <span class="env-var-count">${varCount}</span>
                ${envTarget}
            </span>
        </div>
        <div class="env-body">
            ${sec.vars.map(v => `
            <div class="env-row">
                <span class="env-key">${v.key}${v.isPort ? '<span class="env-port-badge">PORT</span>' : ''}${v.description ? `<span class="env-description">${escHtml(v.description)}</span>` : ''}</span>
                <input class="env-val" type="${isSecretKey(v.key) ? 'password' : 'text'}"
                    data-key="${v.key}" data-si="${si}" data-orig="${escHtml(v.value)}"
                    value="${escHtml(v.value)}"
                    oninput="markChanged(${si})"
                    onfocus="if(this.type==='password')this.type='text'"
                    onblur="if(this.dataset.key.toLowerCase().includes('password')||this.dataset.key.toLowerCase().includes('secret'))this.type='password'">
            </div>`).join('')}
            <div class="env-actions" id="actions-${si}">
                <button class="env-apply-btn" onclick="applySection(${si},'${composeSvc}',${svcId || 'null'})">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
                    Save & Apply
                </button>
                <span class="env-status" id="status-${si}"></span>
            </div>
        </div>
    </div>`;
}

function markChanged(si) {
    const section = document.querySelector(`[data-si="${si}"]`);
    const inputs = section.querySelectorAll('.env-val');
    let hasChanges = false;
    inputs.forEach(inp => {
        const changed = inp.value !== inp.dataset.orig;
        inp.classList.toggle('changed', changed);
        if (changed) hasChanges = true;
    });
    $(`#actions-${si}`).classList.toggle('has-changes', hasChanges);
}

async function applySection(si, composeSvc, serviceId) {
    const section = document.querySelector(`[data-si="${si}"]`);
    const inputs = section.querySelectorAll('.env-val');
    const changes = [];
    inputs.forEach(inp => {
        if (inp.value !== inp.dataset.orig) {
            changes.push({ key: inp.dataset.key, value: inp.value, oldValue: inp.dataset.orig });
        }
    });
    if (!changes.length) return;

    const btn = section.querySelector('.env-apply-btn');
    const sectionName = section.querySelector('.env-section-title')?.textContent?.trim() || '';

    for (const change of changes) {
        if (change.key.includes('PORT')) {
            try {
                const vRes = await fetch('/api/Settings/validate-port', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ key: change.key, value: change.value, section: sectionName }),
                });
                const vData = await vRes.json();
                if (!vData.valid) { showToast(vData.error, 'error'); return; }
            } catch {}
        }
    }

    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Applying...';

    try {
        const res = await fetch('/api/Settings/env', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ changes, service: composeSvc, serviceId: serviceId || null }),
        });
        const data = await res.json();

        if (data.ok) {
            inputs.forEach(inp => { inp.dataset.orig = inp.value; inp.classList.remove('changed'); });
            $(`#actions-${si}`).classList.remove('has-changes');

            if (data.recreated) {
                showToast(t('msg.settingsSavedRestart'), 'info');
                if (composeSvc) waitForServiceReady(composeSvc);
            } else if (data.error) {
                showToast(t('msg.settingsSaveWarn') + ': ' + data.error, 'warning');
            } else {
                showToast(t('msg.settingsSaved'), 'success');
            }

            // Reload env data for card display
            loadEnvData();
        } else {
            showToast('Hata: ' + (data.error || 'Bilinmeyen hata'), 'error');
        }
    } catch (e) {
        showToast(t('msg.actionFail') + ': ' + e.message, 'error');
    }

    btn.disabled = false;
    btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> Save & Apply';
}

// ─── Settings Search ───
$('#settingsSearchInput').addEventListener('input', e => {
    settingsSearchQuery = e.target.value.trim();
    renderEnv();
});

// ─── Sync Services Button ───
$('#syncServicesBtn')?.addEventListener('click', async () => {
    const btn = $('#syncServicesBtn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Syncing...';
    try {
        const res = await fetch('/api/Services/sync', { method: 'POST' });
        const data = await res.json();
        showToast(`Sync: ${data.created} created, ${data.updated} updated, ${data.orphaned} removed`, 'success');
        fetchAll();
        loadEnv();
        loadEnvData();
    } catch (e) {
        showToast('Sync failed: ' + e.message, 'error');
    }
    btn.disabled = false;
    btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg> Sync Services';
});

// ─── GPU Polling ───
async function fetchGpuInfo() {
    try {
        const res = await fetch('/api/System/gpu');
        if (res.ok) {
            gpuInfo = await res.json();
            renderSidebarGpu();
        }
    } catch {}
}

function renderSidebarGpu() {
    const el = $('#sidebarGpu');
    if (!gpuInfo?.available || !gpuInfo.devices?.length) { el.innerHTML = ''; return; }
    el.innerHTML = gpuInfo.devices.map(gpu => {
        const util = parseInt(gpu.utilizationGpu) || 0;
        const cls = util > 80 ? 'var(--red)' : util > 50 ? 'var(--yellow)' : 'rgba(168,85,247,.8)';
        return `<div class="brief-row"><span>GPU</span><div class="brief-bar"><div class="brief-fill" style="width:${util}%;background:${cls}"></div></div><span>${util}%</span></div>
        <div class="sidebar-gpu-detail">${gpu.temperatureC} · ${gpu.memoryUsed}</div>`;
    }).join('');
}

// ─── Onboarding Wizard ───
let catalogData = null;

async function loadCatalog() {
    if (catalogData) return catalogData;
    try {
        const res = await fetch('/api/Onboarding/catalog');
        if (res.ok) catalogData = await res.json();
    } catch {}
    return catalogData || [];
}

function fmtPullCount(n) {
    if (n >= 1e9) return (n/1e9).toFixed(1) + 'B';
    if (n >= 1e6) return (n/1e6).toFixed(1) + 'M';
    if (n >= 1e3) return (n/1e3).toFixed(1) + 'K';
    return String(n);
}

// ─── Wizard State ───
let wizardOverlayRef = null;
let wizardCloseRef = null;
let wizardState = { source: null, aiProjectPath: null, aiAnalysis: null };

async function openOnboardingWizard() {
    const catalog = await loadCatalog();
    const categories = [...new Set(catalog.map(c => c.category))].sort();
    wizardState = { source: null, aiProjectPath: null, aiAnalysis: null };

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    wizardOverlayRef = overlay;
    overlay.innerHTML = `
        <div class="modal" style="max-width:800px;max-height:85vh;width:95%">
            <h3>${t('wizard.title')}</h3>
            <!-- Phase 1: Source Selection -->
            <div id="wizardPhase1">
                <div class="wizard-tabs">
                    <button class="wizard-tab active" data-tab="dockerhub">${t('wizard.dockerhub')}</button>
                    <button class="wizard-tab" data-tab="catalog">${t('wizard.recommended')}</button>
                    <button class="wizard-tab" data-tab="ai">${t('wizard.ai')}</button>
                    <button class="wizard-tab" data-tab="manual">${t('wizard.manual')}</button>
                </div>
                <div class="wizard-body" style="overflow-y:auto;max-height:65vh">
                    <!-- Docker Hub Search -->
                    <div class="wizard-panel active" data-panel="dockerhub">
                        <div class="search-box" style="margin:0 0 .8rem;max-width:100%">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                            <input type="text" id="dhSearch" placeholder="Docker Hub (e.g. nginx, postgres, grafana)" autocomplete="off">
                        </div>
                        <div id="dhResults" class="dh-results">
                            <div class="empty-state" style="padding:2rem"><div class="empty-state-msg">${t('msg.searchHint')}</div></div>
                        </div>
                    </div>

                    <!-- Catalog (Recommended) -->
                    <div class="wizard-panel" data-panel="catalog">
                        <div class="cat-chips" id="catChips">
                            <button class="cat-chip active" data-cat="">${t('misc.all')}</button>
                            ${categories.map(c => `<button class="cat-chip" data-cat="${c}">${c}</button>`).join('')}
                        </div>
                        <div class="catalog-grid" id="catalogGrid">
                            ${renderCatalogItems(catalog)}
                        </div>
                    </div>

                    <!-- AI Wizard (Steps 1-2 in Phase 1) -->
                    <div class="wizard-panel" data-panel="ai">
                        <div id="aiWizardContent">
                            <div id="aiStatusMsg" style="display:none;padding:1.5rem;text-align:center"></div>
                            <div id="aiStepIndicator" class="wizard-steps">
                                <div class="wizard-step active" data-ai-step="1"><span class="step-num">1</span><span class="step-label">${t('ai.step1')}</span></div>
                                <div class="wizard-step" data-ai-step="2"><span class="step-num">2</span><span class="step-label">${t('ai.step2')}</span></div>
                            </div>
                            <!-- AI Step 1: Select Project -->
                            <div class="ai-step-panel active" data-ai-step-panel="1">
                                <div class="dir-breadcrumb" id="aiBreadcrumb"></div>
                                <div class="dir-tree" id="aiDirTree"><div style="padding:1rem;color:var(--text-m)"><span class="spinner"></span> Loading...</div></div>
                                <div id="aiSelectedPath" style="margin-top:.6rem;font-size:.8rem;color:var(--text-d);display:none">
                                    <strong>${t('ai.selectedPath')}:</strong> <span id="aiSelectedPathVal"></span>
                                </div>
                                <div class="wizard-nav" style="margin-top:.8rem">
                                    <span></span>
                                    <button class="section-btn primary" id="aiAnalyzeBtn" disabled onclick="startAiAnalysis()">${t('ai.analyze')} →</button>
                                </div>
                            </div>
                            <!-- AI Step 2: Analyzing -->
                            <div class="ai-step-panel" data-ai-step-panel="2">
                                <div class="ai-loading" style="text-align:center;padding:2rem">
                                    <div><span class="spinner" style="width:32px;height:32px"></span></div>
                                    <div style="margin-top:1rem;color:var(--text-d)">${t('ai.analyzing')}</div>
                                    <div id="aiScanList" class="ai-scan-list" style="margin-top:1rem;text-align:left"></div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Manual — simple entry to Phase 2 -->
                    <div class="wizard-panel" data-panel="manual">
                        <div style="text-align:center;padding:2rem">
                            <p style="color:var(--text-d);margin-bottom:1rem;font-size:.85rem">Image, port, volume ve environment ayarlarını kendiniz girin.</p>
                            <button class="section-btn primary" onclick="goToPhase2({source:'manual'})">Configure →</button>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Phase 2: Unified Configure & Deploy -->
            <div id="wizardPhase2" style="display:none">
                <div class="wizard-body" style="overflow-y:auto;max-height:65vh">
                    <div class="svc-form">
                        <div class="svc-form-row"><label>${t('wizard.name')}</label><input id="cfgName" placeholder="${t('wizard.namePlaceholder')}"></div>
                        <div class="svc-form-row"><label>${t('wizard.image')}</label><input id="cfgImage" placeholder="${t('wizard.imagePlaceholder')}"></div>
                        <div class="svc-form-row"><label>Build Context</label><input id="cfgBuild" placeholder="./my-project (image yerine)"></div>
                        <div class="svc-form-row"><label>${t('wizard.desc')}</label><input id="cfgDesc" placeholder="${t('wizard.descPlaceholder')}"></div>
                        <div class="svc-form-grid">
                            <div class="svc-form-row"><label>${t('wizard.icon')}</label>
                                <div class="icon-input-row">
                                    <input id="cfgIcon" placeholder="/icons/..." style="flex:1">
                                    <button type="button" class="icon-picker-btn" onclick="openIconPicker(this.parentElement.querySelector('#cfgIcon'),this.parentElement.querySelector('.icon-preview'))">${t('editor.pickIcon')}</button>
                                    <img class="icon-preview" src="" alt="" style="display:none" onerror="this.style.display='none'">
                                </div>
                            </div>
                            <div class="svc-form-row"><label>${t('wizard.color')}</label><input id="cfgColor" type="color" value="#6366f1"></div>
                        </div>
                        <div class="svc-form-divider"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="20" rx="2"/><line x1="7" y1="2" x2="7" y2="22"/></svg> ${t('wizard.ports')}</div>
                        <div id="cfgPorts" class="mapping-rows"></div>
                        <button class="mapping-add mapping-add-wide" data-action="add-port">${t('wizard.addPort')}</button>
                        <div class="svc-form-row" style="margin-top:.8rem"><label>${t('wizard.restartPolicy')}</label>
                            <select id="cfgRestart" style="background:var(--bg-3);border:1px solid var(--border);border-radius:6px;padding:.4rem .6rem;font-size:.8rem;color:var(--text);font-family:inherit;outline:none">
                                <option value="unless-stopped" selected>unless-stopped</option>
                                <option value="always">always</option>
                                <option value="on-failure">on-failure</option>
                                <option value="no">no</option>
                            </select>
                        </div>
                        <div class="svc-form-divider"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg> ${t('wizard.volumes')}</div>
                        <div id="cfgVolumes" class="mapping-rows"></div>
                        <button class="mapping-add mapping-add-wide" data-action="add-volume">${t('wizard.addVolume')}</button>
                        <div class="svc-form-divider"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/></svg> ${t('wizard.env')}</div>
                        <div id="cfgEnvs" class="mapping-rows"></div>
                        <button class="mapping-add mapping-add-wide" data-action="add-env">${t('wizard.addEnv')}</button>
                        <div id="cfgDockerfileSection" style="display:none;margin-top:.8rem">
                            <div class="svc-form-divider">${t('ai.dockerfile')}</div>
                            <textarea id="cfgDockerfileContent" class="ai-dockerfile-preview" rows="12" style="width:100%;font-family:monospace;font-size:.78rem;background:var(--bg-2);color:var(--text);border:1px solid var(--border);border-radius:var(--rs);padding:.5rem;resize:vertical"></textarea>
                        </div>
                    </div>
                    <div style="margin-top:.8rem">
                        <div class="wizard-preview-title">${t('wizard.yamlPreview')}</div>
                        <div class="yaml-preview-box" id="cfgYamlPreview"><span style="color:var(--text-m)">${t('wizard.yamlHint')}</span></div>
                    </div>
                    <div id="cfgDeployProgress" class="deploy-progress" style="display:none">
                        <div class="deploy-progress-bar"><div class="deploy-progress-fill" style="width:100%"></div></div>
                        <div class="deploy-progress-text">${t('wizard.deployProgress')}</div>
                    </div>
                </div>
                <div class="wizard-nav">
                    <button class="section-btn" onclick="goToPhase1()">← ${t('wizard.back')}</button>
                    <button class="section-btn primary" id="cfgDeployBtn" onclick="doUnifiedDeploy()">Deploy →</button>
                </div>
            </div>
        </div>`;
    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    wizardCloseRef = close;
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

    // Tab switching
    let aiInitialized = false;
    overlay.querySelectorAll('.wizard-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            overlay.querySelectorAll('.wizard-tab').forEach(t => t.classList.remove('active'));
            overlay.querySelectorAll('.wizard-panel').forEach(p => p.classList.remove('active'));
            tab.classList.add('active');
            overlay.querySelector(`[data-panel="${tab.dataset.tab}"]`).classList.add('active');
            if (tab.dataset.tab === 'ai' && !aiInitialized) {
                aiInitialized = true;
                initAiWizard(overlay);
            }
        });
    });

    // Docker Hub search with debounce
    let dhTimer = null;
    overlay.querySelector('#dhSearch').addEventListener('input', e => {
        clearTimeout(dhTimer);
        const q = e.target.value.trim();
        if (!q) {
            overlay.querySelector('#dhResults').innerHTML = `<div class="empty-state" style="padding:2rem"><div class="empty-state-msg">${t('msg.searchHint')}</div></div>`;
            return;
        }
        overlay.querySelector('#dhResults').innerHTML = `<div class="dh-loading"><span class="spinner"></span> ${t('msg.searching')}</div>`;
        dhTimer = setTimeout(() => searchDockerHub(q, overlay), 400);
    });

    // Docker Hub — delegated click on results
    overlay.querySelector('#dhResults').addEventListener('click', e => {
        const item = e.target.closest('.dh-item');
        if (!item) return;
        const imageName = item.dataset.image;
        const displayName = imageName.includes('/') ? imageName.split('/').pop() : imageName;
        const svcName = displayName.charAt(0).toUpperCase() + displayName.slice(1);
        goToPhase2({ source: 'dockerhub', name: svcName, image: imageName + ':latest' });
    });

    // Category chip filtering — delegated
    overlay.querySelector('#catChips').addEventListener('click', e => {
        const chip = e.target.closest('.cat-chip');
        if (!chip) return;
        overlay.querySelectorAll('.cat-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        const cat = chip.dataset.cat;
        const filtered = cat ? catalog.filter(c => c.category === cat) : catalog;
        overlay.querySelector('#catalogGrid').innerHTML = renderCatalogItems(filtered);
    });

    // Catalog — delegated click
    overlay.querySelector('#catalogGrid').addEventListener('click', e => {
        const item = e.target.closest('.catalog-item');
        if (!item) return;
        const name = item.dataset.name;
        const catEntry = catalog.find(c => c.name === name);
        if (!catEntry) return;
        const ports = (catEntry.defaultPorts || []).map(p => {
            const parts = p.split(':');
            return { host: parts[0], container: parts[1] || parts[0], exposed: true };
        });
        goToPhase2({
            source: 'catalog', name: catEntry.name, image: catEntry.image,
            description: catEntry.description, ports,
            envVars: catEntry.defaultEnv || {}, volumes: catEntry.defaultVolumes || [],
            category: catEntry.category
        });
    });

    // Phase 2 — delegated events
    const phase2 = overlay.querySelector('#wizardPhase2');
    phase2.addEventListener('click', e => {
        if (e.target.closest('.mapping-remove')) {
            e.target.closest('.mapping-row').remove();
            updateUnifiedPreview();
            return;
        }
        if (e.target.closest('.port-mini-toggle')) {
            const btn = e.target.closest('.port-mini-toggle');
            btn.classList.toggle('on');
            const lbl = btn.nextElementSibling;
            if (lbl) {
                lbl.textContent = btn.classList.contains('on') ? t('port.exposed') : t('port.localOnly');
                lbl.className = 'port-access-label ' + (btn.classList.contains('on') ? 'external' : 'local');
            }
            return;
        }
        if (e.target.matches('[data-action="add-port"]')) { addRow('#cfgPorts', 'port'); return; }
        if (e.target.matches('[data-action="add-volume"]')) { addRow('#cfgVolumes', 'volume'); return; }
        if (e.target.matches('[data-action="add-env"]')) { addRow('#cfgEnvs', 'env'); return; }
    });
    phase2.addEventListener('input', () => updateUnifiedPreview());
}

// ─── Phase Navigation ───
function goToPhase2(data) {
    const overlay = wizardOverlayRef;
    if (!overlay) return;
    wizardState = { ...wizardState, ...data };

    overlay.querySelector('#wizardPhase1').style.display = 'none';
    overlay.querySelector('#wizardPhase2').style.display = 'block';

    overlay.querySelector('#cfgName').value = data.name || '';
    overlay.querySelector('#cfgImage').value = data.image || '';
    overlay.querySelector('#cfgBuild').value = data.buildContext || '';
    overlay.querySelector('#cfgDesc').value = data.description || '';

    // Ports
    const portsEl = overlay.querySelector('#cfgPorts');
    portsEl.innerHTML = '';
    const ports = data.ports || [];
    if (ports.length) {
        ports.forEach(p => {
            if (typeof p === 'string') {
                const parts = p.split(':');
                addRow(portsEl, 'port', parts[0], parts[1] || parts[0], true);
            } else {
                addRow(portsEl, 'port', p.host, p.container, p.exposed !== false);
            }
        });
    } else {
        addRow(portsEl, 'port');
    }

    // Volumes
    const volsEl = overlay.querySelector('#cfgVolumes');
    volsEl.innerHTML = '';
    const vols = data.volumes || [];
    if (vols.length) {
        vols.forEach(v => {
            const parts = v.split(':');
            addRow(volsEl, 'volume', parts[0], parts.slice(1).join(':'));
        });
    } else {
        addRow(volsEl, 'volume');
    }

    // Envs
    const envsEl = overlay.querySelector('#cfgEnvs');
    envsEl.innerHTML = '';
    const envs = data.envVars ? Object.entries(data.envVars) : [];
    if (envs.length) {
        envs.forEach(([k, v]) => addRow(envsEl, 'env', k, v));
    } else {
        addRow(envsEl, 'env');
    }

    // Dockerfile
    const dfSection = overlay.querySelector('#cfgDockerfileSection');
    if (data.dockerfile) {
        dfSection.style.display = 'block';
        overlay.querySelector('#cfgDockerfileContent').value = data.dockerfile;
    } else {
        dfSection.style.display = 'none';
    }

    overlay.querySelector('#cfgDeployProgress').style.display = 'none';
    const btn = overlay.querySelector('#cfgDeployBtn');
    btn.disabled = false;
    btn.textContent = 'Deploy →';

    updateUnifiedPreview();
}

function goToPhase1() {
    const overlay = wizardOverlayRef;
    if (!overlay) return;
    overlay.querySelector('#wizardPhase1').style.display = 'block';
    overlay.querySelector('#wizardPhase2').style.display = 'none';
}

// ─── Unified Row Helpers ───
function addRow(containerSel, type, val1, val2, exposed) {
    const container = typeof containerSel === 'string' ? document.querySelector(containerSel) : containerSel;
    if (!container) return;
    const row = document.createElement('div');
    row.className = 'mapping-row';
    if (type === 'port') {
        row.innerHTML = `<input type="number" placeholder="Host Port" class="mp-host" value="${val1 || ''}"><span class="mapping-sep">:</span><input type="number" placeholder="Container Port" class="mp-container" value="${val2 || ''}"><div class="port-access-indicator"><button type="button" class="port-mini-toggle ${exposed !== false ? 'on' : ''} mp-ext"></button><span class="port-access-label ${exposed !== false ? 'external' : 'local'}"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>${exposed !== false ? t('port.exposed') : t('port.localOnly')}</span></div><button class="mapping-remove">×</button>`;
    } else if (type === 'volume') {
        row.innerHTML = `<input type="text" placeholder="./data" class="mv-host" value="${escHtml(val1 || '')}"><span class="mapping-sep">:</span><input type="text" placeholder="/data" class="mv-container" value="${escHtml(val2 || '')}"><button class="mapping-remove">×</button>`;
    } else if (type === 'env') {
        row.innerHTML = `<input type="text" placeholder="KEY" class="me-key" value="${escHtml(val1 || '')}"><span class="mapping-sep">=</span><input type="text" placeholder="value" class="me-val" value="${escHtml(val2 || '')}"><button class="mapping-remove">×</button>`;
    }
    container.appendChild(row);
}

// ─── Unified Preview & Deploy ───
function highlightYaml(yaml) {
    return escHtml(yaml)
        .replace(/^(\s+\w[\w-]*):/gm, '<span class="yaml-key">$1</span>:')
        .replace(/(".*?")/g, '<span class="yaml-str">$1</span>')
        .replace(/(#.*$)/gm, '<span class="yaml-comment">$1</span>');
}

function updateUnifiedPreview() {
    const overlay = wizardOverlayRef;
    if (!overlay) return;
    const el = overlay.querySelector('#cfgYamlPreview');
    if (!el) return;

    const name = overlay.querySelector('#cfgName')?.value?.trim() || 'my-service';
    const image = overlay.querySelector('#cfgImage')?.value?.trim();
    const build = overlay.querySelector('#cfgBuild')?.value?.trim();
    const composeName = name.toLowerCase().replace(/[^a-z0-9-]/g, '-');
    const restart = overlay.querySelector('#cfgRestart')?.value || 'unless-stopped';

    let yaml = `  ${composeName}:\n`;
    if (build) yaml += `    build: ${build}\n`;
    else if (image) yaml += `    image: ${image}\n`;
    else yaml += `    image: image:latest\n`;
    yaml += `    container_name: ${composeName}\n    restart: ${restart}\n`;

    const ports = [];
    overlay.querySelectorAll('#cfgPorts .mapping-row').forEach(row => {
        const h = row.querySelector('.mp-host')?.value;
        const c = row.querySelector('.mp-container')?.value;
        if (h && c) ports.push(`${h}:${c}`);
    });
    if (ports.length) {
        yaml += '    ports:\n';
        ports.forEach(p => yaml += `      - "${p}"\n`);
    }

    const vols = [];
    overlay.querySelectorAll('#cfgVolumes .mapping-row').forEach(row => {
        const h = row.querySelector('.mv-host')?.value?.trim();
        const c = row.querySelector('.mv-container')?.value?.trim();
        if (h && c) vols.push(`${h}:${c}`);
    });
    if (vols.length) {
        yaml += '    volumes:\n';
        vols.forEach(v => yaml += `      - ${v}\n`);
    }

    const envs = [];
    overlay.querySelectorAll('#cfgEnvs .mapping-row').forEach(row => {
        const k = row.querySelector('.me-key')?.value?.trim();
        const v = row.querySelector('.me-val')?.value?.trim();
        if (k) envs.push(`${k}=${v || ''}`);
    });
    if (envs.length) {
        yaml += '    environment:\n';
        envs.forEach(e => yaml += `      - ${e}\n`);
    }

    el.innerHTML = highlightYaml(yaml);
}

async function doUnifiedDeploy() {
    const overlay = wizardOverlayRef;
    const close = wizardCloseRef;
    if (!overlay) return;

    const name = overlay.querySelector('#cfgName').value.trim();
    const image = overlay.querySelector('#cfgImage').value.trim() || null;
    const buildContext = overlay.querySelector('#cfgBuild')?.value?.trim() || null;
    if (!name || (!image && !buildContext)) { showToast(t('msg.nameImageRequired'), 'warning'); return; }

    const ports = {};
    let portIdx = 0;
    overlay.querySelectorAll('#cfgPorts .mapping-row').forEach(row => {
        const host = row.querySelector('.mp-host')?.value;
        const container = row.querySelector('.mp-container')?.value;
        if (host && container) {
            const suffix = portIdx === 0 ? '_PORT' : `_PORT_${portIdx + 1}`;
            const varName = name.toUpperCase().replace(/[^A-Z0-9]/g, '_') + suffix;
            ports[varName] = `${host}:${container}`;
            portIdx++;
        }
    });

    const volumes = [];
    overlay.querySelectorAll('#cfgVolumes .mapping-row').forEach(row => {
        const h = row.querySelector('.mv-host')?.value?.trim();
        const c = row.querySelector('.mv-container')?.value?.trim();
        if (h && c) volumes.push(`${h}:${c}`);
    });

    const envVars = {};
    overlay.querySelectorAll('#cfgEnvs .mapping-row').forEach(row => {
        const k = row.querySelector('.me-key')?.value?.trim();
        const v = row.querySelector('.me-val')?.value?.trim();
        if (k) envVars[k] = v || '';
    });

    const btn = overlay.querySelector('#cfgDeployBtn');
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner"></span> ${t('wizard.deployProgress')}`;
    const progress = overlay.querySelector('#cfgDeployProgress');
    if (progress) progress.style.display = 'block';

    try {
        // AI source: write Dockerfile if generated
        if (wizardState.source === 'ai' && wizardState.dockerfile) {
            const dfContent = overlay.querySelector('#cfgDockerfileContent')?.value;
            if (dfContent) {
                await fetch('/api/Ai/write-dockerfile', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ projectPath: wizardState.aiProjectPath, content: dfContent })
                });
            }
        }

        const body = {
            name, image, buildContext, ports, envVars, volumes,
            description: overlay.querySelector('#cfgDesc').value.trim(),
            environment: null, dependsOn: null
        };
        if (wizardState.category) body.category = wizardState.category;

        const res = await fetch('/api/Onboarding/deploy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        const data = await res.json();
        if (data.ok) {
            showToast(`${name} ${t('msg.deployOk')}`, 'success');
            if (close) close();
            fetchAll();
        } else {
            showToast(`${t('msg.deployFail')}: ` + (data.error || ''), 'error');
            if (progress) progress.style.display = 'none';
        }
    } catch (err) {
        showToast(`${t('msg.deployFail')}: ` + err.message, 'error');
        if (progress) progress.style.display = 'none';
    }
    btn.disabled = false;
    btn.textContent = 'Deploy →';
}

// ─── AI Wizard Logic ───
let aiCurrentStep = 1;
let aiSelectedProjectPath = null;
let aiWizardOverlay = null;

async function initAiWizard(overlay) {
    aiWizardOverlay = overlay;
    aiCurrentStep = 1;
    aiSelectedProjectPath = null;

    // Check AI status
    try {
        const res = await fetch('/api/Ai/status');
        const status = await res.json();
        const msgEl = overlay.querySelector('#aiStatusMsg');

        if (!status.enabled) {
            msgEl.style.display = 'block';
            msgEl.innerHTML = `<div style="color:var(--yellow);margin-bottom:.5rem">${t('ai.disabled')}</div><button class="section-btn primary" onclick="location.hash='settings';document.querySelector('.modal-overlay')?.remove()">${t('ai.goToSettings')}</button>`;
            overlay.querySelector('#aiStepIndicator').style.display = 'none';
            overlay.querySelector('[data-ai-step-panel="1"]').style.display = 'none';
            return;
        }
        if (!status.hasApiKey) {
            msgEl.style.display = 'block';
            msgEl.innerHTML = `<div style="color:var(--yellow);margin-bottom:.5rem">${t('ai.noApiKey')}</div><button class="section-btn primary" onclick="location.hash='settings';document.querySelector('.modal-overlay')?.remove()">${t('ai.goToSettings')}</button>`;
            overlay.querySelector('#aiStepIndicator').style.display = 'none';
            overlay.querySelector('[data-ai-step-panel="1"]').style.display = 'none';
            return;
        }
    } catch {
        // If status check fails, still show the directory picker
    }

    // Load root directories
    loadAiDirectories('/app/project');
}

async function loadAiDirectories(path) {
    const tree = aiWizardOverlay?.querySelector('#aiDirTree');
    if (!tree) return;
    tree.innerHTML = '<div style="padding:.5rem;color:var(--text-m)"><span class="spinner"></span></div>';

    try {
        const res = await fetch(`/api/Ai/directories?path=${encodeURIComponent(path)}`);
        if (!res.ok) throw new Error();
        const dirs = await res.json();

        // Update breadcrumb
        updateAiBreadcrumb(path);

        if (!dirs.length) {
            tree.innerHTML = '<div style="padding:1rem;color:var(--text-m)">No subdirectories found</div>';
            return;
        }

        tree.innerHTML = dirs.map(d => `
            <div class="dir-item ${d.isProject ? 'project' : ''}" data-path="${escHtml(d.path)}" data-hassub="${d.hasSubdirs}">
                <span class="dir-item-icon">${d.hasSubdirs ? '📁' : '📄'}</span>
                <span class="dir-item-name">${escHtml(d.name)}</span>
                ${d.isProject ? '<span class="dir-item-badge">Project ✓</span>' : ''}
            </div>
        `).join('');

        tree.querySelectorAll('.dir-item').forEach(item => {
            item.addEventListener('click', () => {
                const itemPath = item.dataset.path;
                // Toggle selection
                tree.querySelectorAll('.dir-item').forEach(i => i.classList.remove('selected'));
                item.classList.add('selected');
                aiSelectedProjectPath = itemPath;
                const selEl = aiWizardOverlay.querySelector('#aiSelectedPath');
                selEl.style.display = 'block';
                aiWizardOverlay.querySelector('#aiSelectedPathVal').textContent = itemPath;
                aiWizardOverlay.querySelector('#aiAnalyzeBtn').disabled = false;
            });
            item.addEventListener('dblclick', () => {
                const itemPath = item.dataset.path;
                if (item.dataset.hassub === 'true') {
                    loadAiDirectories(itemPath);
                }
            });
        });
    } catch {
        tree.innerHTML = '<div style="padding:1rem;color:var(--red)">Failed to load directories</div>';
    }
}

function updateAiBreadcrumb(path) {
    const bc = aiWizardOverlay?.querySelector('#aiBreadcrumb');
    if (!bc) return;
    const base = '/app/project';
    const rel = path.startsWith(base) ? path.slice(base.length) : path;
    const parts = rel.split('/').filter(Boolean);

    let html = `<span class="dir-bc-item" onclick="loadAiDirectories('${escHtml(base)}')">/app/project</span>`;
    let currentPath = base;
    for (const part of parts) {
        currentPath += '/' + part;
        html += ` <span class="dir-bc-sep">/</span> <span class="dir-bc-item" onclick="loadAiDirectories('${escHtml(currentPath)}')">${escHtml(part)}</span>`;
    }
    bc.innerHTML = html;
}

async function startAiAnalysis() {
    if (!aiSelectedProjectPath) return;
    aiGoToStep(2);

    // Show scanning info
    const scanList = aiWizardOverlay?.querySelector('#aiScanList');
    if (scanList) scanList.innerHTML = '';

    try {
        const res = await fetch('/api/Ai/analyze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ projectPath: aiSelectedProjectPath })
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({ message: 'Unknown error' }));
            throw new Error(err.message || err.Message || 'Analysis failed');
        }

        const result = await res.json();
        // Convert AI analysis to Phase 2 format
        const aiPorts = (result.ports || []).map(p => ({
            host: String(p.host), container: String(p.container), exposed: true
        }));
        goToPhase2({
            source: 'ai', name: result.serviceName,
            image: result.image || '', buildContext: result.buildContext || '',
            description: result.explanation || '', ports: aiPorts,
            envVars: result.envVars || {}, volumes: result.volumes || [],
            dockerfile: result.dockerfile || null,
            aiProjectPath: aiSelectedProjectPath, aiAnalysis: result
        });
    } catch (err) {
        // Show error with retry
        const panel = aiWizardOverlay?.querySelector('[data-ai-step-panel="2"]');
        if (panel) {
            panel.innerHTML = `
                <div style="text-align:center;padding:2rem">
                    <div style="color:var(--red);margin-bottom:1rem">${t('ai.error')}: ${escHtml(err.message)}</div>
                    <button class="section-btn" onclick="aiGoToStep(1)">← ${t('wizard.back')}</button>
                    <button class="section-btn primary" onclick="startAiAnalysis()" style="margin-left:.5rem">${t('ai.retry')}</button>
                </div>`;
        }
    }
}


function aiGoToStep(step) {
    aiCurrentStep = step;
    if (!aiWizardOverlay) return;
    aiWizardOverlay.querySelectorAll('[data-ai-step]').forEach(s => {
        const n = parseInt(s.dataset.aiStep);
        s.classList.toggle('active', n === step);
        s.classList.toggle('completed', n < step);
    });
    aiWizardOverlay.querySelectorAll('.ai-step-panel').forEach(p => {
        p.classList.toggle('active', parseInt(p.dataset.aiStepPanel) === step);
    });
}

async function searchDockerHub(query, overlay) {
    try {
        const res = await fetch(`/api/Onboarding/search?q=${encodeURIComponent(query)}&limit=20`);
        if (!res.ok) throw new Error();
        const results = await res.json();
        const container = overlay.querySelector('#dhResults');

        if (!results.length) {
            container.innerHTML = `<div class="empty-state" style="padding:1.5rem"><div class="empty-state-msg">${t('msg.noResults')}</div></div>`;
            return;
        }

        container.innerHTML = results.map(r => `
            <div class="dh-item" data-image="${escHtml(r.name)}">
                <div class="dh-item-body">
                    <div class="dh-item-name">
                        ${escHtml(r.name)}
                        ${r.isOfficial ? '<span class="dh-official">Official</span>' : ''}
                    </div>
                    <div class="dh-item-desc">${escHtml(r.description)}</div>
                    <div class="dh-item-meta">
                        <span>⭐ ${r.starCount.toLocaleString()}</span>
                        <span>📥 ${fmtPullCount(r.pullCount)}</span>
                    </div>
                </div>
            </div>
        `).join('');

        // Click handling via delegated listener on #dhResults
    } catch {
        overlay.querySelector('#dhResults').innerHTML = `<div class="empty-state" style="padding:1.5rem"><div class="empty-state-msg">${t('msg.dhError')}</div></div>`;
    }
}

function renderCatalogItems(items) {
    if (!items.length) return `<div class="empty-state"><div class="empty-state-msg">${t('msg.noResults')}</div></div>`;
    return items.map(item => `
        <div class="catalog-item" data-name="${escHtml(item.name)}">
            <div class="catalog-item-header">
                <span class="catalog-item-name">${escHtml(item.name)}</span>
                <span class="catalog-item-cat">${escHtml(item.category)}</span>
            </div>
            <div class="catalog-item-desc">${escHtml(item.description)}</div>
            <div class="catalog-item-image">${escHtml(item.image)}</div>
        </div>
    `).join('');
}


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
pollTimer = setInterval(fetchAll, pollInterval);
