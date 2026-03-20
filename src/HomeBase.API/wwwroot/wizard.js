// ─── Wizard Module ───

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
                            <p style="color:var(--text-d);margin-bottom:1rem;font-size:.85rem">${t('wizard.manualDesc')}</p>
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
        const desc = item.dataset.desc || '';
        const displayName = imageName.includes('/') ? imageName.split('/').pop() : imageName;
        const svcName = displayName.charAt(0).toUpperCase() + displayName.slice(1);
        goToPhase2({ source: 'dockerhub', name: svcName, image: imageName + ':latest', description: desc });
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
                lbl.textContent = btn.classList.contains('on') ? t('port.all') : t('port.local');
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
        row.innerHTML = `<input type="number" placeholder="Host Port" class="mp-host" value="${val1 || ''}"><span class="mapping-sep">:</span><input type="number" placeholder="Container Port" class="mp-container" value="${val2 || ''}"><div class="port-access-indicator"><button type="button" class="port-mini-toggle ${exposed !== false ? 'on' : ''} mp-ext"></button><span class="port-access-label ${exposed !== false ? 'external' : 'local'}"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>${exposed !== false ? t('port.all') : t('port.local')}</span></div><button class="mapping-remove">×</button>`;
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
            showToast(`${name} ${t('msg.deploying')}`, 'success');
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
            <div class="dh-item" data-image="${escHtml(r.name)}" data-desc="${escHtml(r.description)}">
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
    return items.map(item => {
        const stars = item.starCount || 0;
        const pulls = item.pullCount || 0;
        const logoHtml = item.logoUrl
            ? `<img class="catalog-item-logo" src="${escHtml(item.logoUrl)}" alt="" onerror="this.style.display='none'">`
            : '';
        const officialBadge = item.isOfficial ? '<span class="dh-official">Official</span>' : '';
        const metaHtml = (stars > 0 || pulls > 0)
            ? `<div class="catalog-item-meta"><span>⭐ ${stars.toLocaleString()}</span><span>📥 ${fmtPullCount(pulls)}</span></div>`
            : '';
        return `
        <div class="catalog-item" data-name="${escHtml(item.name)}">
            <div class="catalog-item-header">
                ${logoHtml}
                <span class="catalog-item-name">${escHtml(item.name)}${officialBadge}</span>
                <span class="catalog-item-cat">${escHtml(item.category)}</span>
            </div>
            <div class="catalog-item-desc">${escHtml(item.description)}</div>
            <div class="catalog-item-image">${escHtml(item.image)}</div>
            ${metaHtml}
        </div>`;
    }).join('');
}
