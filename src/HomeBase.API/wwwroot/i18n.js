// ─── i18n Module ───
const LANG = {
  tr: {
    // Nav/Header
    'nav.dashboard':'Gösterge Paneli','nav.containers':'Konteynerler','nav.auditlog':'Kayıt Geçmişi','nav.settings':'Ayarlar','nav.menu':'MENÜ',
    'topbar.theme':'Tema Değiştir','topbar.live':'CANLI',
    // Badges/Status
    'status.online':'Çevrimiçi','status.offline':'Çevrimdışı','status.stopping':'Durduruluyor','status.starting':'Başlatılıyor','status.stopped':'Durduruldu',
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
    'msg.portNeedsRestart':"Port ayarı güncellendi. Dashboard yeniden başlatılıyor...",
    'msg.enableOk':'etkinleştirildi','msg.enableFail':'Etkinleştirme hatası',
    'msg.enableAllOk':'Tüm containerlar etkinleştirildi','msg.enableAllFail':'Toplu etkinleştirme hatası',
    'msg.svcUpdated':'Servis güncellendi','msg.svcAdded':'Servis eklendi',
    'msg.svcDeleted':'silindi','msg.svcDeleteFail':'Silme başarısız',
    'msg.nameRequired':'Ad ve Container Adı zorunludur','msg.nameImageRequired':'Ad ve Image zorunlu',
    'msg.noResults':'Sonuç bulunamadı','msg.searchHint':"Aramaya başlayın — Docker Hub'dan gerçek zamanlı sonuçlar",
    'msg.searching':'Aranıyor...','msg.dhError':'Docker Hub arama hatası — çevrimdışı olabilirsiniz',
    'msg.saving':'Kaydediliyor...','msg.applying':'Uygulanıyor...',
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
    'msg.deleting':'siliniyor...','msg.deleteStep.removing':'Servis siliniyor...','msg.deleteStep.done':'Tamamlandı',
    'confirm.deploy':'Deploy','confirm.deployMsg':'servisini deploy etmek istiyor musunuz?',
    // Card
    'card.on':'Açık','card.off':'Kapalı',
    // Settings
    'settings.title':'HomeBase Ayarları','settings.health':'Sistem Sağlığı','settings.healthSub':'Anlık kaynak kullanımı',
    'settings.config':'Yapılandırma','settings.configSub':'Uygulama ayarları',
    'settings.polling':'Yoklama Aralığı','settings.theme':'Tema',
    'settings.activeContainers':'Aktif Konteynerler','settings.registeredServices':'Kayıtlı Servisler',
    'settings.protectedContainers':'Korumalı Konteynerler','settings.none':'Yok',
    'settings.homebaseSettings':'HomeBase Ayarları','settings.homebaseSettingsSub':'Çevresel değişkenler',
    'settings.portAccess':'Port Erişimi','settings.portAccessSub':'Hangi portlara dışarıdan erişileceğini yönetin',
    'settings.recentChanges':'Son Değişiklikler','settings.recentChangesSub':'Son yapılan işlemler',
    'settings.disabledContainers':'Devre Dışı Containerlar','settings.enableAll':'Tümünü Etkinleştir',
    'settings.enable':'Etkinleştir','settings.searchPlaceholder':'Ayar ara...',
    'settings.language':'Dil',
    'settings.memUsed':'kullanımda',
    // Port Toggle
    'port.all':'Herkese Açık','port.local':'Yerel',
    // Wizard
    'wizard.title':'Servis Ekle','wizard.dockerhub':'Docker Hub Ara','wizard.recommended':'Önerilen','wizard.manual':'Manuel',
    'wizard.step1':'Temel','wizard.step2':'Ağ','wizard.step3':'Depolama & Ortam','wizard.step4':'Önizleme',
    'wizard.name':'Servis Adı','wizard.image':'Docker Image','wizard.desc':'Açıklama','wizard.icon':'İkon',
    'wizard.color':'Renk','wizard.ports':'Port Eşleme','wizard.volumes':'Birimler','wizard.env':'Ortam Değişkenleri',
    'wizard.restartPolicy':'Yeniden Başlatma Politikası','wizard.addPort':'+ Port Ekle','wizard.addVolume':'+ Birim Ekle','wizard.addEnv':'+ Değişken Ekle',
    'wizard.next':'İleri','wizard.back':'Geri','wizard.deploy':'Deploy','wizard.deployProgress':'Deploy ediliyor...',
    'wizard.summary':'Özet','wizard.yamlPreview':'YAML Önizleme','wizard.yamlHint':'Alanları doldurunca önizleme burada görünecek',
    'wizard.namePlaceholder':'örn: My Service','wizard.imagePlaceholder':'örn: nginx:latest','wizard.descPlaceholder':'Servis açıklaması',
    // Editor
    'editor.title':'Servis Düzenle','editor.addTitle':'Yeni Servis Ekle','editor.info':'Servis Bilgileri',
    'editor.name':'Ad','editor.desc':'Açıklama','editor.icon':'İkon URL','editor.color':'Renk',
    'editor.container':'Container Adı','editor.preferPort':'PreferPort','editor.urlPath':'URL Path',
    'editor.sort':'Sıralama','editor.save':'Kaydet','editor.add':'Ekle','editor.pickIcon':'Seç',
    'editor.config':'Yapılandırma',
    // Containers
    'containers.title':'Tüm Konteynerler','containers.noContainers':'Çalışan konteyner bulunamadı',
    'containers.loading':'Yükleniyor...','containers.dataLoading':'Veri toplanıyor...',
    'containers.log':'Günlük','containers.protected':'korumalı',
    // Audit
    'audit.title':'Kayıt Geçmişi','audit.allActions':'Tüm İşlemler','audit.noRecords':'Kayıt bulunamadı',
    'audit.loadFail':'Kayıtlar yüklenemedi','audit.time':'Zaman','audit.action':'İşlem',
    'audit.target':'Hedef','audit.detail':'Detay','audit.records':'kayıt',
    'audit.page':'Sayfa','audit.first':'İlk','audit.prev':'Önceki','audit.next':'Sonraki','audit.last':'Son',
    'audit.fromDate':'Başlangıç tarihi','audit.toDate':'Bitiş tarihi','audit.search':'Ara...',
    // Logs panel
    'logs.title':'Konteyner Günlükleri','logs.lines':'satır','logs.autoScroll':'Otomatik kaydır','logs.refresh':'Yenile','logs.close':'Kapat',
    'logs.loading':'Günlükler yükleniyor...','logs.error':'Hata: ',
    // Empty states
    'empty.firstDeploy':'İlk servisinizi deploy edin',
    'empty.firstDeployDesc':"Docker Hub'dan arayın, katalogdan seçin veya manuel olarak yapılandırın.",
    'empty.noMatch':'Aramanızla eşleşen servis bulunamadı','empty.clearSearch':'Aramayı Temizle',
    'empty.noSettings':'Ayar bulunamadı. Servisleri yapılandırdıktan sonra ayarlar burada görünecek.',
    'empty.noMatchSettings':'ile eşleşen ayar bulunamadı',
    // Search
    'search.placeholder':'Servislerde ara...','search.portPlaceholder':'Port ara...',
    // Container detail
    'detail.resources':'Kaynak Kullanımı','detail.info':'Konteyner Bilgisi',
    'detail.created':'Oluşturulma','detail.usage':'Kullanım','detail.temp':'Sıcaklık','detail.power':'Güç',
    'detail.disk':'Disk','detail.writableLayer':'Yazılabilir katman — Toplam image:',
    'detail.health':'Sağlık','detail.network':'Ağ','detail.blockio':'Disk I/O','detail.pids':'İşlemler',
    // Misc
    'misc.active':'aktif','misc.idle':'boşta','misc.containerActive':'konteyner aktif',
    'misc.now':'şimdi','misc.ago':'önce','misc.saveApply':'Kaydet & Uygula',
    'misc.configure':'Yapılandır','misc.all':'Tümü','misc.addService':'Servis Ekle',
    'misc.configureService':'Yapılandır',
    'misc.save':'Kaydet','misc.add':'Ekle',
    'msg.error':'Hata: ','msg.unknownError':'Bilinmeyen hata',
    'wizard.manualDesc':'Image, port, volume ve environment ayarlarını kendiniz girin.',
    'msg.syncing':'Senkronize ediliyor...',
    'status.deploying':'Deploy ediliyor','status.deployFailed':'Deploy başarısız',
    'port.open':'herkese açık','port.closed':'yerel','port.service':'Servis','port.container':'Container','port.access':'Erişim','port.noPorts':'Henüz port bulunamadı. Servis deploy edildiğinde portlar burada görünecek.',
    'msg.noPortConfigured':'Port yapılandırılmamış',
    // AI
    'settings.aiConfig':'AI Yapılandırması','settings.aiConfigSub':'Yapay zeka entegrasyon ayarları',
    'wizard.ai':'AI Sihirbazı',
    'ai.selectProject':'Proje Dizini Seçin','ai.selectedPath':'Seçili Dizin',
    'ai.analyze':'Analiz Et','ai.analyzing':'Proje yapısı analiz ediliyor...',
    'ai.explanation':'AI Açıklaması',
    'ai.noApiKey':'OpenAI API anahtarı ayarlanmamış. Ayarlardan yapılandırın.',
    'ai.disabled':'AI özelliği devre dışı. Ayarlardan etkinleştirin.',
    'ai.error':'AI analizi başarısız','ai.retry':'Tekrar Dene',
    'ai.dockerfile':'Oluşturulan Dockerfile','ai.generatedConfig':'Oluşturulan Yapılandırma',
    'ai.step1':'Proje Seç','ai.step2':'AI Analiz','ai.step3':'İncele','ai.step4':'Deploy',
    'ai.scanning':'Taranan dosyalar','ai.goToSettings':'Ayarlara Git',
    // Missing i18n keys
    'status.exited':'Çıkıldı',
    'topbar.reconnecting':'YENİDEN BAĞLANIYOR','topbar.offline':'ÇEVRİMDIŞI',
    'msg.noIcons':'İkon bulunamadı',
    'wizard.buildContext':'Derleme Bağlamı','wizard.buildPlaceholder':'./my-project (image yerine)',
    'msg.deployingSlug':'deploy ediliyor...','msg.deployOkSlug':'başarıyla deploy edildi','msg.deployFailSlug':'deploy başarısız',
    // Health & Settings labels
    'health.cpu':'CPU','health.memory':'Bellek','health.disk':'Disk','health.networkIo':'Ağ I/O','health.gpu':'GPU',
    'theme.dark':'Koyu','theme.light':'Açık',
    'settings.on':'Açık','settings.off':'Kapalı',
    'msg.pollingChanged':'Yoklama aralığı',
    // Table headers
    'table.status':'Durum','table.name':'Ad','table.image':'Image','table.state':'Durum','table.cpu':'CPU',
    'table.memory':'Bellek','table.ports':'Portlar','table.actions':'İşlemler','table.port':'Port','table.protocol':'Protokol',
    // Chart
    'chart.cpu':'CPU (%)','chart.memory':'Bellek (MB)','chart.last':'Son',
    'msg.maxFileSize':'Maksimum dosya boyutu 512KB',
    // Dashboard stat cards
    'stat.cpu':'CPU','stat.memory':'Bellek','stat.containers':'Containerlar',
    'stat.running':'çalışan','stat.total':'toplam',
    // Log lines
    'logs.linesOption':'satır',
    // Section headers
    'section.services':'Servisler',
    // Container detail labels
    'detail.image':'Image','detail.imageId':'Image ID','detail.restart':'Yeniden Başlatma',
    'detail.volumes':'Birimler','detail.policy':'politika',
    // AI Provider
    'settings.aiProvider':'AI Sağlayıcı','settings.aiBaseUrl':'AI Base URL','settings.aiApiKey':'API Anahtarı',
    'settings.aiModel':'AI Model','settings.aiEnabled':'AI Etkin',
    'ai.providerOpenai':'OpenAI','ai.providerGemini':'Google Gemini','ai.providerClaude':'Anthropic Claude','ai.providerCustom':'Özel',
    // Icon picker tabs
    'icon.existing':'Mevcut İkonlar','icon.url':'URL Girişi','icon.upload':'Yükle',
    'icon.urlPlaceholder':'https://example.com/icon.png','icon.use':'Kullan','icon.uploading':'Yükleniyor...',
    'icon.uploadHint':'Dosya sürükleyin veya tıklayın','icon.uploadFail':'Yükleme başarısız',
    'icon.preview':'Önizleme',
    // AI Wizard path
    'ai.pathInput':'Yol girin...','ai.pathPlaceholder':'C:\\Projeler\\my-app veya /home/user/project','ai.home':'Ana Dizin','ai.rootBrowse':'Kök Dizin','ai.projectDetected':'Proje ✓',
    // Editor tabs
    'editor.settingsTab':'Ayarlar','editor.composeTab':'Docker Compose',
    'editor.saveRecreate':'Kaydet & Yeniden Oluştur','editor.aiAssist':'AI Yardım','editor.reset':'Sıfırla',
    'editor.composeLoading':'Compose yükleniyor...','editor.composeSaveOk':'Compose kaydedildi, container yeniden oluşturuluyor...',
    'editor.composeSaveFail':'Compose kaydedilemedi','editor.composeNotFound':'Compose dosyası bulunamadı',
    'editor.aiAssistTitle':'AI Önerileri','editor.aiAssistLoading':'AI analiz ediyor...',
    'editor.aiChatPlaceholder':'Değişiklik talimatı yazın... (ör: portu 8080 yap, volume ekle)',
    'editor.aiApply':'Uygula','editor.aiChatSend':'Gönder',
    // AI Wizard host access
    'ai.thisComputer':'Bu Bilgisayar','ai.drives':'Diskler','ai.dirLoadFail':'Dizin yüklenemedi',
    // Editor YAML
    'editor.yamlUpdated':'YAML güncellendi','editor.yamlApplied':'YAML editöre yazıldı',
    // HomeBase self-management
    'settings.hbSub':'Altyapı konteyner yönetimi','settings.general':'Genel',
    // Category translations
    'cat.media':'Medya','cat.development':'Geliştirme','cat.monitoring':'İzleme','cat.productivity':'Verimlilik',
    'cat.security':'Güvenlik','cat.ai_ml':'Yapay Zeka','cat.storage':'Depolama','cat.networking':'Ağ',
    // Deploy monitor
    'wizard.deployMonitor.building':'Derleniyor ve başlatılıyor...',
    'wizard.deployMonitor.starting':'Container başlatılıyor...',
    'wizard.deployMonitor.healthCheck':'Servis ayağa kalkıyor, HTTP yanıtı bekleniyor...',
    'wizard.deployMonitor.running':'başarıyla çalışıyor!',
    'wizard.deployMonitor.runningNoHttp':'Container çalışıyor ama HTTP yanıtı alınamadı — yavaş başlatma olabilir',
    'wizard.deployMonitor.buildFail':'Derleme başarısız — container oluşturulamadı',
    'wizard.deployMonitor.diagnosing':'Container çöktü — AI teşhis koyuyor...',
    'wizard.deployMonitor.diagFail':'AI teşhis başarısız',
    'wizard.deployMonitor.fixing':'AI sorunu düzeltiyor ve yeniden deniyor',
    'wizard.deployMonitor.retrying':'Düzeltme uygulandı, yeniden başlatılıyor...',
    'wizard.deployMonitor.fixFail':'Otomatik düzeltme başarısız',
    'wizard.deployMonitor.projectIssue':'Proje Sorunu',
    // misc
    'misc.manage':'Yönet',
    // Deploy Panel
    'deploy.panelTitle':'Deploy Durumu',
    'deploy.step.build':'Image Alınıyor / Derleniyor...',
    'deploy.step.start':'Container Başlatılıyor',
    'deploy.step.health':'Sağlık Kontrolü (HTTP)',
    'deploy.step.running':'Çalışıyor ✓',
    'deploy.step.diagnose':'AI Teşhis',
    'deploy.step.fix':'AI Otomatik Düzeltme',
    'deploy.step.pending':'Bekliyor',
    'deploy.retry':'Tekrar Dene',
    'deploy.dismiss':'Kapat',
    'deploy.aiFound':'AI compose sorunu buldu',
    'deploy.aiFixApplied':'Düzeltme uygulandı',
    'deploy.projectIssue':'Proje Sorunu — manuel düzeltme gerekli',
    'deploy.viewLogs':'Logları Gör',
    'deploy.elapsed':'geçen süre',
    'deploy.noHttp':'Container çalışıyor ama HTTP yanıt vermiyor',
    'deploy.success':'başarıyla deploy edildi',
    'deploy.buildFail':'Derleme başarısız',
    'deploy.chatPlaceholder':'AI\'a talimat verin... (örn: portu değiştir, Dockerfile düzelt)',
    'deploy.send':'Gönder',
    'deploy.aiThinking':'AI düşünüyor...',
    'deploy.fixApplying':'Düzeltme uygulanıyor...',
    'deploy.fixApplied':'Düzeltme uygulandı, yeniden deploy ediliyor...',
    'deploy.dockerfileFix':'Dockerfile düzeltildi',
    'deploy.composeFix':'Compose düzeltildi',
    'deploy.maxRetries':'Maksimum deneme sayısına ulaşıldı',
    'deploy.attempt':'Deneme',
    'deploy.diagnosing':'AI analiz ediyor...',
    'deploy.fixing':'Düzeltme uygulanıyor...',
    'deploy.reasoning':'AI Akıl Yürütme',
    'deploy.userAction':'Manuel müdahale gerekli',
    'deploy.triedNFixes':'AI {n} düzeltme denedi',
    'deploy.manualRequired':'Manuel müdahale gerekli',
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
    'msg.portNeedsRestart':'Port updated. Dashboard is restarting...',
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
    'msg.deleting':'deleting...','msg.deleteStep.removing':'Removing service...','msg.deleteStep.done':'Done',
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
    'settings.portAccess':'Port Access','settings.portAccessSub':'Manage which ports are accessible externally',
    'settings.recentChanges':'Recent Changes','settings.recentChangesSub':'Recent operations',
    'settings.disabledContainers':'Disabled Containers','settings.enableAll':'Enable All',
    'settings.enable':'Enable','settings.searchPlaceholder':'Search settings...',
    'settings.language':'Language',
    'settings.memUsed':'in use',
    // Port Toggle
    'port.all':'All','port.local':'Local',
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
    'misc.save':'Save','misc.add':'Add',
    'msg.error':'Error: ','msg.unknownError':'Unknown error',
    'wizard.manualDesc':'Configure image, port, volume and environment settings yourself.',
    'msg.syncing':'Syncing...',
    'status.deploying':'Deploying','status.deployFailed':'Deploy failed',
    'port.open':'public','port.closed':'local','port.service':'Service','port.container':'Container','port.access':'Access','port.noPorts':'No ports detected yet. Ports will appear here when services are deployed.',
    'msg.noPortConfigured':'No port configured',
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
    // Missing i18n keys
    'status.exited':'Exited',
    'topbar.reconnecting':'RECONNECTING','topbar.offline':'OFFLINE',
    'msg.noIcons':'No icons found',
    'wizard.buildContext':'Build Context','wizard.buildPlaceholder':'./my-project (instead of image)',
    'msg.deployingSlug':'deploying...','msg.deployOkSlug':'deployed successfully','msg.deployFailSlug':'deploy failed',
    // Health & Settings labels
    'health.cpu':'CPU','health.memory':'Memory','health.disk':'Disk','health.networkIo':'Network I/O','health.gpu':'GPU',
    'theme.dark':'Dark','theme.light':'Light',
    'settings.on':'On','settings.off':'Off',
    'msg.pollingChanged':'Polling interval',
    // Table headers
    'table.status':'Status','table.name':'Name','table.image':'Image','table.state':'State','table.cpu':'CPU',
    'table.memory':'Memory','table.ports':'Ports','table.actions':'Actions','table.port':'Port','table.protocol':'Protocol',
    // Chart
    'chart.cpu':'CPU (%)','chart.memory':'Memory (MB)','chart.last':'Last',
    'msg.maxFileSize':'Max file size is 512KB',
    // Dashboard stat cards
    'stat.cpu':'CPU','stat.memory':'Memory','stat.containers':'Containers',
    'stat.running':'running','stat.total':'total',
    // Log lines
    'logs.linesOption':'lines',
    // Section headers
    'section.services':'Services',
    // Container detail labels
    'detail.image':'Image','detail.imageId':'Image ID','detail.restart':'Restart',
    'detail.volumes':'Volumes','detail.policy':'policy',
    // AI Provider
    'settings.aiProvider':'AI Provider','settings.aiBaseUrl':'AI Base URL','settings.aiApiKey':'API Key',
    'settings.aiModel':'AI Model','settings.aiEnabled':'AI Enabled',
    'ai.providerOpenai':'OpenAI','ai.providerGemini':'Google Gemini','ai.providerClaude':'Anthropic Claude','ai.providerCustom':'Custom',
    // Icon picker tabs
    'icon.existing':'Existing Icons','icon.url':'URL Input','icon.upload':'Upload',
    'icon.urlPlaceholder':'https://example.com/icon.png','icon.use':'Use','icon.uploading':'Uploading...',
    'icon.uploadHint':'Drag file here or click to browse','icon.uploadFail':'Upload failed',
    'icon.preview':'Preview',
    // AI Wizard path
    'ai.pathInput':'Enter path...','ai.pathPlaceholder':'C:\\Projects\\my-app or /home/user/project','ai.home':'Home','ai.rootBrowse':'Root','ai.projectDetected':'Project ✓',
    // Editor tabs
    'editor.settingsTab':'Settings','editor.composeTab':'Docker Compose',
    'editor.saveRecreate':'Save & Recreate','editor.aiAssist':'AI Assist','editor.reset':'Reset',
    'editor.composeLoading':'Loading compose...','editor.composeSaveOk':'Compose saved, recreating container...',
    'editor.composeSaveFail':'Failed to save compose','editor.composeNotFound':'Compose file not found',
    'editor.aiAssistTitle':'AI Suggestions','editor.aiAssistLoading':'AI analyzing...',
    'editor.aiChatPlaceholder':'Type an instruction... (e.g. change port to 8080, add volume)',
    'editor.aiApply':'Apply','editor.aiChatSend':'Send',
    // AI Wizard host access
    'ai.thisComputer':'This Computer','ai.drives':'Drives','ai.dirLoadFail':'Failed to load directories',
    // Editor YAML
    'editor.yamlUpdated':'YAML updated','editor.yamlApplied':'Applied to editor',
    // HomeBase self-management
    'settings.hbSub':'Infrastructure container management','settings.general':'General',
    // Category translations
    'cat.media':'Media','cat.development':'Development','cat.monitoring':'Monitoring','cat.productivity':'Productivity',
    'cat.security':'Security','cat.ai_ml':'AI/ML','cat.storage':'Storage','cat.networking':'Networking',
    // Deploy monitor
    'wizard.deployMonitor.building':'Building and starting...',
    'wizard.deployMonitor.starting':'Container starting...',
    'wizard.deployMonitor.healthCheck':'Service is starting, waiting for HTTP response...',
    'wizard.deployMonitor.running':'is running successfully!',
    'wizard.deployMonitor.runningNoHttp':'Container is running but no HTTP response — may be slow to start',
    'wizard.deployMonitor.buildFail':'Build failed — container could not be created',
    'wizard.deployMonitor.diagnosing':'Container crashed — AI is diagnosing...',
    'wizard.deployMonitor.diagFail':'AI diagnosis failed',
    'wizard.deployMonitor.fixing':'AI is fixing the issue and retrying',
    'wizard.deployMonitor.retrying':'Fix applied, restarting...',
    'wizard.deployMonitor.fixFail':'Auto-fix failed',
    'wizard.deployMonitor.projectIssue':'Project Issue',
    // misc
    'misc.manage':'Manage',
    // Deploy Panel
    'deploy.panelTitle':'Deploy Progress',
    'deploy.step.build':'Pulling Image / Building...',
    'deploy.step.start':'Starting Container',
    'deploy.step.health':'Health Check (HTTP)',
    'deploy.step.running':'Running ✓',
    'deploy.step.diagnose':'AI Diagnosis',
    'deploy.step.fix':'AI Auto-Fix',
    'deploy.step.pending':'Pending',
    'deploy.retry':'Retry',
    'deploy.dismiss':'Dismiss',
    'deploy.aiFound':'AI found compose issue',
    'deploy.aiFixApplied':'Fix applied',
    'deploy.projectIssue':'Project Issue — manual fix required',
    'deploy.viewLogs':'View Logs',
    'deploy.elapsed':'elapsed',
    'deploy.noHttp':'Container running but HTTP not responding',
    'deploy.success':'deployed successfully',
    'deploy.buildFail':'Build failed',
    'deploy.chatPlaceholder':'Tell AI what to fix... (e.g. change port, fix Dockerfile)',
    'deploy.send':'Send',
    'deploy.aiThinking':'AI is thinking...',
    'deploy.fixApplying':'Applying fix...',
    'deploy.fixApplied':'Fix applied, redeploying...',
    'deploy.dockerfileFix':'Dockerfile fixed',
    'deploy.composeFix':'Compose fixed',
    'deploy.maxRetries':'Maximum retry attempts reached',
    'deploy.attempt':'Attempt',
    'deploy.diagnosing':'AI analyzing...',
    'deploy.fixing':'Applying fix...',
    'deploy.reasoning':'AI Reasoning',
    'deploy.userAction':'Manual action required',
    'deploy.triedNFixes':'AI tried {n} fixes',
    'deploy.manualRequired':'Manual action required',
  }
};
let currentLang = localStorage.getItem('lang') || 'en';
function t(key) { return LANG[currentLang]?.[key] ?? LANG['en']?.[key] ?? key; }
function setLang(lang) {
  currentLang = lang;
  localStorage.setItem('lang', lang);
  updateStaticStrings();
  renderServices(); renderContainers();
  if ($('#settingsView').classList.contains('active')) renderEnv();
  // Update lang toggle button text — show the OTHER language (what you'll switch to)
  const langBtn = $('#langToggle');
  if (langBtn) langBtn.textContent = currentLang === 'tr' ? 'EN' : 'TR';
}
function updateStaticStrings() {
  $$('[data-i18n]').forEach(el => el.textContent = t(el.dataset.i18n));
  $$('[data-i18n-placeholder]').forEach(el => el.placeholder = t(el.dataset.i18nPlaceholder));
  $$('[data-i18n-title]').forEach(el => el.title = t(el.dataset.i18nTitle));
  // Update page title from active nav link
  const activeLink = document.querySelector('.nav-link.active span[data-i18n]');
  const pageTitle = document.getElementById('pageTitle');
  if (activeLink && pageTitle) pageTitle.textContent = activeLink.textContent;
}
