// ─── Render Module ───

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
}

// ─── Expanded Chart ───
document.querySelectorAll('.stat-card[data-chart]').forEach(card => {
    card.addEventListener('click', () => {
        const type = card.dataset.chart;
        if (!type) return;
        const data = type === 'cpu' ? cpuH : memH;
        const label = type === 'cpu' ? t('chart.cpu') : t('chart.memory');
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
                <h3>${label} — ${t('chart.last')} ${data.length * 5}s</h3>
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

// ─── Smart Render Services (no flicker) ───
function buildCardHtml(svc) {
    const c = getCtr(svc), up = c?.state === 'running';
    const deploying = svc.deployStatus === 'deploying';
    const deployFailed = svc.deployStatus === 'failed';
    const url = getSvcUrl(svc, c);
    const noUrl = url === null;
    const isProxied = url && url.startsWith('/api/proxy/');
    const cpu = c?.stats?.cpu||'0', mem = c?.stats?.memMB||'0', mp = c?.stats?.memPercent||'0';
    const prot = c?.protected, idle = up ? idleStr(c?.idleMinutes) : '';
    const idleCls = idle === 'active' ? 'active' : idle ? 'idle' : '';
    const busy = transitioning.has(svc.containerName);
    const stopping = busy && up;

    // Image tag display
    const imageTag = svc.image ? `<div class="svc-image-tag" title="${escHtml(svc.image)}">${escHtml(svc.image)}</div>` : '';
    // Category badge
    const catBadge = svc.category ? `<span class="svc-category">${escHtml(tCat(svc.category))}</span>` : '';

    return `<div class="svc-accent" style="background:${svc.color}"></div>
        <a class="svc-body" href="${up && !busy && !noUrl ? url : '#'}" target="${up && !busy && !noUrl ? '_blank' : ''}" ${!up || busy || noUrl ? 'onclick="return false"' : ''} ${noUrl && up ? `title="${t('msg.noPortConfigured')}"` : ''}>
            <img class="svc-logo" src="${svc.icon}" alt="" onerror="this.style.display='none'">
            <div class="svc-info">
                <div class="svc-head">
                    <span class="svc-name">${escHtml(svc.name)}${catBadge}${isProxied ? '<span class="proxy-badge" title="Local access (via proxy)">🔒</span>' : ''}</span>
                    ${deploying
                        ? `<span class="badge transition" style="animation:pulse 1.5s ease-in-out infinite"><span class="spinner"></span>${t('status.deploying')}</span>`
                        : deployFailed
                        ? `<span class="badge down" style="background:var(--red)15;color:var(--red)">${t('status.deployFailed')}</span>`
                        : busy
                        ? `<span class="badge transition"><span class="spinner"></span>${stopping ? t('status.stopping') : t('status.starting')}</span>`
                        : c?.state === 'exited'
                        ? `<span class="badge exited"><span class="badge-dot"></span>${t('status.exited')}</span>`
                        : `<span class="badge ${up?'up':'down'}"><span class="badge-dot"></span>${up?t('status.online'):t('status.offline')}</span>`
                    }
                </div>
                <div class="svc-desc">${escHtml(svc.description)}</div>
                ${imageTag}
                ${up && !stopping ? `<div class="svc-metrics">
                    <div class="metric"><span class="metric-lbl">CPU</span><span class="metric-val">${cpu}% <span class="bar"><span class="bar-fill ${barCls(cpu)}" style="width:${Math.min(cpu,100)}%"></span></span></span></div>
                    <div class="metric"><span class="metric-lbl">MEM</span><span class="metric-val">${mem}MB <span class="bar"><span class="bar-fill ${barCls(mp)}" style="width:${Math.min(mp,100)}%"></span></span></span></div>
                    <div class="metric"><span class="metric-lbl">UP</span><span class="metric-val">${c.status.replace('Up ','')}</span></div>
                </div>` : !busy ? `<div class="svc-metrics"><div class="metric"><span class="metric-lbl">${t('table.status')}</span><span class="metric-val" style="color:var(--red)">${t('status.stopped')}</span></div></div>` : ''}
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

// HomeBase's own containers — managed from Settings, not shown on dashboard
const HOMEBASE_CONTAINERS = new Set(['homebase-api', 'homebase-db']);

// Translate DB category names via i18n
const CAT_I18N_MAP = { 'Media':'cat.media','Development':'cat.development','Monitoring':'cat.monitoring','Productivity':'cat.productivity','Security':'cat.security','AI/ML':'cat.ai_ml','Storage':'cat.storage','Networking':'cat.networking' };
function tCat(name) { return CAT_I18N_MAP[name] ? t(CAT_I18N_MAP[name]) : name; }

function renderServices() {
    const g = $('#servicesGrid');
    const filtered = services.filter(svc => {
        if (HOMEBASE_CONTAINERS.has(svc.containerName)) return false;
        return !searchQuery || svc.name.toLowerCase().includes(searchQuery) || (svc.description||'').toLowerCase().includes(searchQuery);
    });

    // Force clear non-card elements (empty states, errors) before re-render
    g.querySelectorAll('.empty-state, .error-state').forEach(el => el.remove());

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
            // Update existing card - skip if state unchanged
            const stateHash = `${c?.state}_${c?.stats?.cpu}_${c?.stats?.memMB}_${busy}_${svc.deployStatus}`;
            if (card.dataset.stateHash !== stateHash) {
                card.className = `svc-card ${up && !stopping ? '' : 'stopped'} ${busy ? 'busy' : ''}`;
                card.innerHTML = buildCardHtml(svc);
                card.dataset.stateHash = stateHash;
            }
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
