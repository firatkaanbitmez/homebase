// ─── Containers Module ───

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
