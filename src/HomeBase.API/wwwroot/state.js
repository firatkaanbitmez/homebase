// ─── State Module ───

let containers = [], services = [];
let envSections = []; // settings data per service
let disksData = []; // disk usage for settings health dashboard
const cpuH = [], memH = [], HLEN = 60;
let viewMode = localStorage.getItem('viewMode') || 'grid';
const transitioning = new Set();
const deletingServiceIds = new Set(); // guard for delete race condition
let searchQuery = '';
let initialLoad = true;
let consecutiveErrors = 0;
let pollInterval = parseInt(localStorage.getItem('pollInterval')) || 5000;
let pollTimer = null;
let manageModeActive = false;

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

// ─── Fetch ───
async function fetchAll() {
    try {
        const [s, c, d] = await Promise.all([
            fetch('/api/Services'),
            fetch('/api/Containers'),
            fetch('/api/System/disks')
        ]);
        if (!s.ok || !c.ok) throw new Error(t('msg.apiDown'));
        services = (await s.json()).filter(svc => svc.isEnabled !== false && !deletingServiceIds.has(svc.id));
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

// ─── SignalR Real-Time Connection ───
let connection = null;
let fallbackPollTimer = null;

function initSignalR() {
    connection = new signalR.HubConnectionBuilder()
        .withUrl('/hubs/dashboard')
        .withAutomaticReconnect([0, 1000, 2000, 5000, 10000, 30000])
        .build();

    connection.on('ContainersUpdated', data => {
        containers = data;
        updateContainerHistory();
        updateStats();
        renderServices();
        renderContainers();
    });

    connection.on('ServicesUpdated', data => {
        services = data.filter(svc => svc.isEnabled !== false && !deletingServiceIds.has(svc.id));
        renderServices();
    });

    connection.on('DeployProgress', data => {
        // Update deploy panel if active — panel handles its own UI
        const panelActive = typeof activeDeploy !== 'undefined' && activeDeploy && activeDeploy.slug === data.slug;
        if (panelActive) {
            updateDeployFromSignalR(data);
        }
        // Show toasts only when deploy panel is NOT handling this deploy
        if (!panelActive) {
            if (data.status === 'deploying') {
                showToast(`${data.slug} ${t('msg.deployingSlug')}`, 'info');
            } else if (data.status === 'ready') {
                showToast(`${data.slug} ${t('msg.deployOkSlug')}`, 'success');
            } else if (data.status === 'failed') {
                showToast(`${data.slug} ${t('msg.deployFailSlug')}: ${data.message || ''}`, 'error');
            }
        }
        // Always refresh data on terminal states
        if (data.status === 'ready' || data.status === 'failed') {
            fetchAll();
        }
    });

    connection.on('SettingsChanged', () => {
        loadEnvData();
        if ($('#settingsView').classList.contains('active')) loadEnv();
    });

    connection.on('Toast', data => {
        showToast(data.message, data.type || 'info', data.duration || 4000);
    });

    connection.onreconnecting(() => setLiveStatus('reconnecting'));
    connection.onreconnected(() => {
        setLiveStatus('connected');
        fetchAll();
        stopFallbackPolling();
    });
    connection.onclose(() => {
        setLiveStatus('disconnected');
        startFallbackPolling();
    });

    connection.start()
        .then(() => {
            setLiveStatus('connected');
            stopFallbackPolling();
            // Stop the initial polling since SignalR is now handling updates
            if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
        })
        .catch(() => {
            setLiveStatus('disconnected');
            startFallbackPolling();
        });
}

function setLiveStatus(status) {
    const pill = $('#livePill');
    const label = $('#liveLabel');
    if (!pill) return;
    pill.classList.remove('connected', 'reconnecting', 'disconnected');
    pill.classList.add(status);
    if (label) {
        if (status === 'connected') label.textContent = t('topbar.live');
        else if (status === 'reconnecting') label.textContent = t('topbar.reconnecting');
        else label.textContent = t('topbar.offline');
    }
}

function startFallbackPolling() {
    if (fallbackPollTimer) return;
    fallbackPollTimer = setInterval(fetchAll, pollInterval);
}

function stopFallbackPolling() {
    if (fallbackPollTimer) {
        clearInterval(fallbackPollTimer);
        fallbackPollTimer = null;
    }
}
