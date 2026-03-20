// ─── Settings Module ───
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

// Translate DB section names
const SECTION_I18N = { 'AI Configuration':'settings.aiConfig','General':'settings.general','Dashboard':'nav.dashboard' };
function tSection(name) { return SECTION_I18N[name] ? t(SECTION_I18N[name]) : name; }

function updatePollInterval(val) {
    pollInterval = parseInt(val);
    localStorage.setItem('pollInterval', pollInterval);
    restartPolling();
    showToast(`${t('msg.pollingChanged')}: ${pollInterval / 1000}s`, 'success');
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

    // ── HomeBase Self-Management ──
    if (!q) {
        const hbContainers = containers.filter(c => c.name === 'homebase-api' || c.name === 'homebase-db');
        if (hbContainers.length > 0) {
            html += `<div class="settings-category">
                <div class="settings-cat-header">
                    <svg width="16" height="16" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M16 2L28 9v14l-12 7L4 23V9l12-7z"/><path d="M16 10l-6 4v6l6 4 6-4v-6l-6-4z"/></svg>
                    HomeBase
                    <span style="font-size:.6rem;font-weight:400;text-transform:none;letter-spacing:0;color:var(--text-m);margin-left:.5rem">${t('settings.hbSub')}</span>
                </div>
                <div class="env-section open" style="margin-bottom:.75rem">
                    <div class="env-body" style="display:block;padding:.5rem">
                        ${hbContainers.map(c => {
                            const up = c.state === 'running';
                            const cpu = c.stats?.cpu || '0';
                            const mem = c.stats?.memMB || '0';
                            return `<div style="display:flex;align-items:center;justify-content:space-between;padding:.5rem .6rem;border-radius:6px;margin-bottom:.3rem;background:var(--bg-3)">
                                <div style="display:flex;align-items:center;gap:.6rem;flex:1;min-width:0">
                                    <span class="dot ${c.state}"></span>
                                    <div>
                                        <div style="font-weight:600;font-size:.82rem">${escHtml(c.name)}</div>
                                        <div style="font-size:.65rem;color:var(--text-m)">${escHtml(c.image)} · ${c.status}</div>
                                    </div>
                                </div>
                                ${up ? `<div style="display:flex;align-items:center;gap:.6rem;font-size:.7rem;color:var(--text-d);margin:0 .8rem">
                                    <span>CPU ${cpu}%</span><span>MEM ${mem}MB</span>
                                </div>` : ''}
                                <div style="display:flex;gap:.3rem">
                                    ${up ? `<button class="svc-action-btn" onclick="restartContainer('${escHtml(c.name)}')" title="${t('confirm.restart')}">
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg>
                                    </button>` : ''}
                                    ${up ? `<button class="svc-action-btn" onclick="openLogs('${escHtml(c.name)}')" title="${t('logs.title')}">
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                                    </button>` : ''}
                                </div>
                            </div>`;
                        }).join('')}
                    </div>
                </div>
            </div>`;
        }
    }

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
                    <div class="health-card-label">${t('health.cpu')}</div>
                    <div class="health-card-val" style="color:${getBarColor(cpuPct)}">${cpuPct.toFixed(1)}%</div>
                    <div class="health-bar"><div class="health-bar-fill" style="width:${cpuPct}%;background:${getBarColor(cpuPct)}"></div></div>
                </div>
                <div class="health-card">
                    <div class="health-card-label">${t('health.memory')}</div>
                    <div class="health-card-val" style="color:${getBarColor(memPct)}">${memPct.toFixed(1)}%</div>
                    <div class="health-card-sub">${mem} MB ${t('settings.memUsed')}</div>
                    <div class="health-bar"><div class="health-bar-fill" style="width:${memPct}%;background:${getBarColor(memPct)}"></div></div>
                </div>
                ${(disksData || []).map(d => {
                    const dPct = d.percent || 0;
                    return `<div class="health-card">
                        <div class="health-card-label">${t('health.disk')} — ${escHtml(d.name)}</div>
                        <div class="health-card-val" style="color:${getBarColor(dPct)}">${dPct}%</div>
                        <div class="health-card-sub">${d.used}/${d.total} GB</div>
                        <div class="health-bar"><div class="health-bar-fill" style="width:${dPct}%;background:${getBarColor(dPct)}"></div></div>
                    </div>`;
                }).join('')}
                <div class="health-card">
                    <div class="health-card-label">${t('health.networkIo')}</div>
                    <div class="health-card-val" style="font-size:.85rem">↓${fmtBytes(totalRx)} ↑${fmtBytes(totalTx)}</div>
                </div>
                ${gpuInfo?.available && gpuInfo.devices?.length ? gpuInfo.devices.map(gpu => {
                    const util = parseInt(gpu.utilizationGpu) || 0;
                    return `<div class="health-card">
                        <div class="health-card-label">${t('health.gpu')} ${gpu.index}</div>
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
                        <span style="color:var(--text-d);font-size:.78rem">${currentTheme === 'dark' ? t('theme.dark') : t('theme.light')}</span>
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

    // ── 3C: Port Access Management ──
    try {
        const fwRes = await fetch('/api/Settings/ports/overview');
        if (fwRes.ok) {
            const ports = await fwRes.json();
            const extCount = ports.filter(p => p.isExternal).length;
            html += `
            <div class="settings-category">
                <div class="settings-cat-header">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                    ${t('settings.portAccess')}
                    <span class="env-var-count">${ports.length}</span>
                    <span style="font-size:.6rem;font-weight:400;text-transform:none;letter-spacing:0;color:var(--text-m);margin-left:.5rem">${t('settings.portAccessSub')}</span>
                </div>
                <div class="env-section open" style="margin-bottom:.75rem">
                    <div class="env-body" style="display:block;padding:.5rem">
                        <div style="margin-bottom:.75rem;display:flex;gap:.5rem;align-items:center;flex-wrap:wrap">
                            <span style="font-size:.7rem;color:var(--text-m)">${extCount} ${t('port.open')} / ${ports.length - extCount} ${t('port.closed')}</span>
                        </div>
                        ${ports.length > 0 ? `<table class="port-table" id="portTable">
                            <thead><tr><th style="width:36px"></th><th>${t('table.port')}</th><th>${t('table.protocol')}</th><th>${t('port.service')}</th><th>${t('port.container')}</th><th>${t('port.access')}</th></tr></thead>
                            <tbody>
                                ${ports.map(p => `<tr data-port="${p.port}" data-service="${escHtml(p.serviceName||'')}">
                                    <td><span class="dot" style="width:8px;height:8px;border-radius:50%;display:inline-block;background:${p.isExternal ? 'var(--green)' : 'var(--text-m)'}"></span></td>
                                    <td><span class="port-chip">${p.port}</span></td>
                                    <td>${p.protocol}</td>
                                    <td>${escHtml(p.serviceName || '-')}</td>
                                    <td><code style="font-size:.7rem;color:var(--text-d)">${escHtml(p.containerName || '-')}</code></td>
                                    <td>
                                        <button class="port-mini-toggle ${p.isExternal ? 'on' : ''}"
                                            onclick="togglePortExternal(${p.port},this,'${escHtml(p.serviceName||'')}')"
                                            title="${p.isExternal ? t('port.all') : t('port.local')}"></button>
                                        <span class="port-access-label ${p.isExternal ? 'external' : 'local'}" style="font-size:.65rem;margin-left:.3rem">
                                            ${p.isExternal ? t('port.all') : t('port.local')}
                                        </span>
                                    </td>
                                </tr>`).join('')}
                            </tbody>
                        </table>` : `<div style="text-align:center;padding:1.5rem;color:var(--text-m);font-size:.8rem">${t('port.noPorts')}</div>`}
                    </div>
                </div>
            </div>`;
        }
    } catch {}

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

async function togglePortExternal(port, btn, serviceName) {
    const isNowExternal = !btn.classList.contains('on');
    btn.classList.toggle('on', isNowExternal);
    const label = btn.nextElementSibling;
    if (label) {
        label.textContent = isNowExternal ? t('port.all') : t('port.local');
        label.className = 'port-access-label ' + (isNowExternal ? 'external' : 'local');
        label.style.cssText = 'font-size:.65rem;margin-left:.3rem';
    }
    const dot = btn.closest('tr')?.querySelector('.dot');
    if (dot) dot.style.background = isNowExternal ? 'var(--green)' : 'var(--text-m)';
    try {
        const res = await fetch('/api/Settings/ports/toggle', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ port, external: isNowExternal, serviceName: serviceName || null })
        });
        const data = await res.json();
        if (data.needsRestart) {
            showToast(t('msg.portNeedsRestart'), 'warning');
        } else {
            showToast(`Port ${port} ${isNowExternal ? t('msg.portToggleOk.open') : t('msg.portToggleOk.close')}`, 'success');
        }
    } catch {
        btn.classList.toggle('on', !isNowExternal);
        if (label) {
            label.textContent = !isNowExternal ? t('port.all') : t('port.local');
            label.className = 'port-access-label ' + (!isNowExternal ? 'external' : 'local');
        }
        if (dot) dot.style.background = !isNowExternal ? 'var(--green)' : 'var(--text-m)';
        showToast(t('msg.portToggleFail'), 'error');
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
        showToast(t('msg.enableAllFail'), 'error');
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
                ${tSection(sec.name)}
                <span class="env-var-count">${varCount}</span>
                ${envTarget}
            </span>
        </div>
        <div class="env-body">
            ${sec.vars.map(v => {
                // AI_ENABLED: toggle switch
                if (v.key === 'AI_ENABLED') {
                    const isOn = v.value?.toLowerCase() === 'true';
                    return `<div class="env-row">
                        <span class="env-key">${v.key}${v.description ? `<span class="env-description">${escHtml(v.description)}</span>` : ''}</span>
                        <div style="display:flex;align-items:center;gap:.5rem">
                            <button type="button" class="toggle ${isOn ? 'on' : ''}" style="flex-shrink:0"
                                onclick="this.classList.toggle('on');const inp=this.parentElement.querySelector('.env-val');inp.value=this.classList.contains('on')?'true':'false';inp.dispatchEvent(new Event('input'))"></button>
                            <input class="env-val" type="hidden" data-key="${v.key}" data-si="${si}" data-orig="${escHtml(v.value)}" value="${escHtml(v.value)}" oninput="markChanged(${si})">
                            <span style="font-size:.75rem;color:var(--text-d)">${isOn ? t('settings.on') : t('settings.off')}</span>
                        </div>
                    </div>`;
                }
                // AI_PROVIDER: select dropdown
                if (v.key === 'AI_PROVIDER') {
                    const providers = [{v:'openai',l:t('ai.providerOpenai')},{v:'gemini',l:t('ai.providerGemini')},{v:'claude',l:t('ai.providerClaude')},{v:'custom',l:t('ai.providerCustom')}];
                    return `<div class="env-row">
                        <span class="env-key">${v.key}${v.description ? `<span class="env-description">${escHtml(v.description)}</span>` : ''}</span>
                        <select class="env-val" data-key="${v.key}" data-si="${si}" data-orig="${escHtml(v.value)}"
                            style="background:var(--bg-4);border:1px solid var(--border);border-radius:6px;padding:.3rem .5rem;font-size:.75rem;color:var(--text);font-family:inherit;outline:none"
                            oninput="markChanged(${si});toggleBaseUrlVisibility(this.closest('.env-body'))">
                            ${providers.map(p => `<option value="${p.v}" ${v.value === p.v ? 'selected' : ''}>${p.l}</option>`).join('')}
                        </select>
                    </div>`;
                }
                // AI_BASE_URL: show only when custom
                if (v.key === 'AI_BASE_URL') {
                    const providerVar = sec.vars.find(vv => vv.key === 'AI_PROVIDER');
                    const isCustom = providerVar?.value === 'custom';
                    return `<div class="env-row ai-base-url-row" style="${isCustom ? '' : 'display:none'}">
                        <span class="env-key">${v.key}${v.description ? `<span class="env-description">${escHtml(v.description)}</span>` : ''}</span>
                        <input class="env-val" type="text" data-key="${v.key}" data-si="${si}" data-orig="${escHtml(v.value)}" value="${escHtml(v.value)}" oninput="markChanged(${si})" placeholder="https://api.example.com/v1/chat/completions">
                    </div>`;
                }
                // AI_MODEL: with provider-specific placeholder
                if (v.key === 'AI_MODEL') {
                    const providerVar = sec.vars.find(vv => vv.key === 'AI_PROVIDER');
                    const prov = providerVar?.value || 'openai';
                    const placeholder = prov === 'gemini' ? 'gemini-2.5-flash' : prov === 'claude' ? 'claude-sonnet-4-20250514' : prov === 'openai' ? 'gpt-4.1-mini' : 'model-name';
                    return `<div class="env-row">
                        <span class="env-key">${v.key}${v.description ? `<span class="env-description">${escHtml(v.description)}</span>` : ''}</span>
                        <input class="env-val" type="text" data-key="${v.key}" data-si="${si}" data-orig="${escHtml(v.value)}" value="${escHtml(v.value)}" oninput="markChanged(${si})" placeholder="${placeholder}">
                    </div>`;
                }
                return `<div class="env-row">
                <span class="env-key">${v.key}${v.isPort ? '<span class="env-port-badge">PORT</span>' : ''}${v.description ? `<span class="env-description">${escHtml(v.description)}</span>` : ''}</span>
                <input class="env-val" type="${isSecretKey(v.key) ? 'password' : 'text'}"
                    data-key="${v.key}" data-si="${si}" data-orig="${escHtml(v.value)}"
                    value="${escHtml(v.value)}"
                    oninput="markChanged(${si})"
                    onfocus="if(this.type==='password')this.type='text'"
                    onblur="if(this.dataset.key.toLowerCase().includes('password')||this.dataset.key.toLowerCase().includes('secret'))this.type='password'">
            </div>`;
            }).join('')}
            <div class="env-actions" id="actions-${si}">
                <button class="env-apply-btn" onclick="applySection(${si},'${composeSvc}',${svcId || 'null'})">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
                    ${t('misc.saveApply')}
                </button>
                <span class="env-status" id="status-${si}"></span>
            </div>
        </div>
    </div>`;
}

function toggleBaseUrlVisibility(envBody) {
    if (!envBody) return;
    const providerSelect = envBody.querySelector('[data-key="AI_PROVIDER"]');
    const baseUrlRow = envBody.querySelector('.ai-base-url-row');
    if (providerSelect && baseUrlRow) {
        baseUrlRow.style.display = providerSelect.value === 'custom' ? '' : 'none';
    }
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
    btn.innerHTML = '<span class="spinner"></span> ' + t('msg.applying');

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
            showToast(t('msg.error') + (data.error || t('msg.unknownError')), 'error');
        }
    } catch (e) {
        showToast(t('msg.actionFail') + ': ' + e.message, 'error');
    }

    btn.disabled = false;
    btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> ${t('misc.saveApply')}`;
}

// ─── Settings Search ───
$('#settingsSearchInput').addEventListener('input', e => {
    settingsSearchQuery = e.target.value.trim();
    renderEnv();
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
