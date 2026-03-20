// ─── Wizard Module ───

// ─── Deploy Panel State (Card-based) ───
let activeDeploy = null;

function openDeployPanel(slug, name) {
    if (activeDeploy) {
        if (activeDeploy.timerInterval) clearInterval(activeDeploy.timerInterval);
        activeDeploy.monitorAbort = true;
    }

    activeDeploy = {
        slug, name,
        startTime: Date.now(),
        timerInterval: null,
        done: false,
        monitorAbort: false,
        attempts: [
            { id: 1, status: 'deploying', startTime: Date.now(), endTime: null, reasoning: null, fixDescription: null, userAction: null, logs: null, collapsed: false }
        ],
        previousAttempts: [],
        maxAttempts: 3
    };

    const panel = document.getElementById('deployPanel');
    const title = document.getElementById('deployPanelTitle');
    if (title) title.textContent = `${t('deploy.panelTitle')} — ${name}`;
    panel.classList.add('open');

    activeDeploy.timerInterval = setInterval(() => {
        if (!activeDeploy || activeDeploy.done) return;
        const elapsed = Math.floor((Date.now() - activeDeploy.startTime) / 1000);
        const mins = Math.floor(elapsed / 60);
        const secs = elapsed % 60;
        const timerEl = document.getElementById('deployTimer');
        if (timerEl) timerEl.textContent = `${mins}:${secs.toString().padStart(2, '0')} ${t('deploy.elapsed')}`;
    }, 1000);

    renderDeployPanel();
}

function closeDeployPanel() {
    const panel = document.getElementById('deployPanel');
    panel.classList.remove('open');
    if (activeDeploy) {
        if (activeDeploy.timerInterval) clearInterval(activeDeploy.timerInterval);
        activeDeploy.monitorAbort = true;
    }
    activeDeploy = null;
}

function stopDeployTimer() {
    if (!activeDeploy) return;
    if (activeDeploy.timerInterval) {
        clearInterval(activeDeploy.timerInterval);
        activeDeploy.timerInterval = null;
    }
    activeDeploy.done = true;
}

function currentAttempt() {
    if (!activeDeploy || !activeDeploy.attempts.length) return null;
    return activeDeploy.attempts[activeDeploy.attempts.length - 1];
}

function renderDeployPanel() {
    if (!activeDeploy) return;
    const body = document.getElementById('deployPanelBody');
    if (!body) return;

    const attemptsHtml = activeDeploy.attempts.map((att, idx) => {
        const isLast = idx === activeDeploy.attempts.length - 1;
        const collapsed = att.collapsed && !isLast;
        const elapsed = att.startTime ? Math.floor(((att.endTime || (att.status === 'deploying' ? Date.now() : att.startTime)) - att.startTime) / 1000) : 0;
        const timeStr = elapsed > 0 ? `${elapsed}s` : '';

        const statusIcon = att.status === 'deploying' ? '<span class="spinner" style="width:10px;height:10px;display:inline-block;vertical-align:middle"></span>'
            : att.status === 'success' ? '<span style="color:var(--green)">✓</span>'
            : att.status === 'failed' ? '<span style="color:var(--red)">✗</span>'
            : att.status === 'diagnosing' ? '<span class="spinner" style="width:10px;height:10px;display:inline-block;vertical-align:middle"></span>'
            : att.status === 'fixing' ? '<span class="spinner" style="width:10px;height:10px;display:inline-block;vertical-align:middle"></span>'
            : '';

        const statusLabel = {
            deploying: t('deploy.step.build'),
            success: t('deploy.success'),
            failed: t('deploy.buildFail'),
            diagnosing: t('deploy.diagnosing'),
            fixing: t('deploy.fixing')
        }[att.status] || att.status;

        let bodyHtml = '';
        if (!collapsed) {
            if (att.reasoning) {
                bodyHtml += `<div style="margin-bottom:.3rem"><span style="font-size:.65rem;font-weight:700;text-transform:uppercase;color:var(--text-m)">${t('deploy.reasoning')}</span></div>`;
                bodyHtml += `<div class="deploy-reasoning">${escHtml(att.reasoning)}</div>`;
            }
            if (att.fixDescription) {
                bodyHtml += `<div class="deploy-fix-desc">✓ ${escHtml(att.fixDescription)}</div>`;
            }
            if (att.userAction) {
                bodyHtml += `<div class="deploy-user-action">${escHtml(att.userAction)}</div>`;
            }
            if (att.logs) {
                bodyHtml += `<div class="deploy-logs-preview">${escHtml(att.logs)}</div>`;
            }
        }

        return `<div class="deploy-attempt ${att.status} ${collapsed ? 'collapsed' : ''}" data-attempt="${att.id}">
            <div class="deploy-attempt-header" onclick="toggleAttemptCollapse(${att.id})">
                <div class="deploy-attempt-title">
                    ${statusIcon}
                    <span>${t('deploy.attempt')} ${att.id}</span>
                    <span class="deploy-attempt-status ${att.status}">${statusLabel}</span>
                </div>
                <span class="deploy-attempt-time">${timeStr}</span>
            </div>
            ${bodyHtml ? `<div class="deploy-attempt-body">${bodyHtml}</div>` : ''}
        </div>`;
    }).join('');

    // Final card if max attempts reached
    let finalHtml = '';
    if (activeDeploy.done && activeDeploy.attempts.length >= activeDeploy.maxAttempts) {
        const lastAtt = currentAttempt();
        if (lastAtt && lastAtt.status === 'failed') {
            finalHtml = `<div class="deploy-final-card">
                <div class="deploy-final-card-title">${t('deploy.manualRequired')}</div>
                <div class="deploy-final-card-body">${lastAtt.userAction ? escHtml(lastAtt.userAction) : t('deploy.triedNFixes').replace('{n}', activeDeploy.maxAttempts)}</div>
            </div>`;
        }
    }

    const dismissHtml = activeDeploy.done
        ? `<div style="text-align:center;margin-top:1rem"><button class="section-btn" onclick="closeDeployPanel()">${t('deploy.dismiss')}</button></div>`
        : '';

    body.innerHTML = `<div class="deploy-attempts">${attemptsHtml}</div>${finalHtml}${dismissHtml}`;

    // Show chat when there's an error or deploy is done
    const chatEl = document.getElementById('deployChat');
    const chatInput = document.getElementById('deployChatInput');
    if (chatEl) {
        const hasError = activeDeploy.attempts.some(a => a.status === 'failed');
        chatEl.style.display = (hasError || activeDeploy.done) ? 'block' : 'none';
        if (chatInput && !chatInput.placeholder) chatInput.placeholder = t('deploy.chatPlaceholder');
    }
}

function toggleAttemptCollapse(attemptId) {
    if (!activeDeploy) return;
    const att = activeDeploy.attempts.find(a => a.id === attemptId);
    if (att) {
        att.collapsed = !att.collapsed;
        renderDeployPanel();
    }
}

async function sendDeployChat() {
    if (!activeDeploy) return;
    const input = document.getElementById('deployChatInput');
    const msgArea = document.getElementById('deployChatMessages');
    const sendBtn = document.getElementById('deployChatSend');
    if (!input || !msgArea) return;

    const instruction = input.value.trim();
    if (!instruction) return;

    msgArea.innerHTML += `<div class="deploy-chat-msg user">${escHtml(instruction)}</div>`;
    input.value = '';
    sendBtn.disabled = true;

    msgArea.innerHTML += `<div class="deploy-chat-msg ai" id="chatThinking"><span class="spinner" style="width:10px;height:10px;display:inline-block;vertical-align:middle;margin-right:.3rem"></span>${t('deploy.aiThinking')}</div>`;
    msgArea.scrollTop = msgArea.scrollHeight;

    try {
        const res = await fetch('/api/Ai/agent-fix', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                serviceSlug: activeDeploy.slug,
                previousAttempts: activeDeploy.previousAttempts,
                userInstruction: instruction,
                language: currentLang
            })
        });

        document.getElementById('chatThinking')?.remove();

        if (!res.ok) {
            msgArea.innerHTML += `<div class="deploy-chat-msg ai">${t('ai.error')}</div>`;
            sendBtn.disabled = false;
            return;
        }

        const data = await res.json();

        if (data.fix) {
            msgArea.innerHTML += `<div class="deploy-chat-msg ai fix">✓ ${escHtml(data.fix.description)}</div>`;
            msgArea.scrollTop = msgArea.scrollHeight;
            activeDeploy.previousAttempts.push({ fixDescription: data.fix.description, resultLogs: '' });

            msgArea.innerHTML += `<div class="deploy-chat-msg ai">${t('deploy.fixApplied')}</div>`;
            await fetch('/api/Ai/fix-and-redeploy', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ serviceSlug: activeDeploy.slug, fixedYaml: null })
            });

            startNewDeployRound();
        } else {
            msgArea.innerHTML += `<div class="deploy-chat-msg ai">${escHtml(data.userActionRequired || data.reasoning)}</div>`;
        }

        msgArea.scrollTop = msgArea.scrollHeight;
    } catch (err) {
        document.getElementById('chatThinking')?.remove();
        msgArea.innerHTML += `<div class="deploy-chat-msg ai">${t('ai.error')}: ${escHtml(err.message)}</div>`;
    }

    sendBtn.disabled = false;
}

function updateDeployFromSignalR(data) {
    if (!activeDeploy || activeDeploy.slug !== data.slug || activeDeploy.done) return;

    const att = currentAttempt();
    if (!att || att.status !== 'deploying') return;

    if (data.status === 'failed') {
        att.status = 'failed';
        att.endTime = Date.now();
        att.logs = data.message || t('deploy.buildFail');
        renderDeployPanel();
    }
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

// ─── Wizard State ───
let wizardOverlayRef = null;
let wizardCloseRef = null;
let wizardState = { source: null, aiProjectPath: null, aiAnalysis: null };

async function openOnboardingWizard() {
    const catalog = await loadCatalog();
    const categories = [...new Set(catalog.map(c => c.category))].sort();
    const tCatWiz = (name) => { const map = {'Media':'cat.media','Development':'cat.development','Monitoring':'cat.monitoring','Productivity':'cat.productivity','Security':'cat.security','AI/ML':'cat.ai_ml','Storage':'cat.storage','Networking':'cat.networking'}; return map[name] ? t(map[name]) : name; };
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
                            ${categories.map(c => `<button class="cat-chip" data-cat="${c}">${tCatWiz(c)}</button>`).join('')}
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
                                <div class="ai-explorer">
                                    <div class="ai-explorer-toolbar">
                                        <button class="ai-nav-btn" onclick="loadHostDrives()" title="${t('ai.thisComputer')}">
                                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
                                        </button>
                                        <button class="ai-nav-btn" onclick="loadAiDirectories('/app/project')" title="${t('ai.home')}">
                                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/></svg>
                                        </button>
                                        <button class="ai-nav-btn" id="aiUpBtn" onclick="navigateUp()" title="${t('wizard.back')}">
                                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
                                        </button>
                                        <div class="ai-path-bar" id="aiBreadcrumb"></div>
                                    </div>
                                    <div class="ai-explorer-body">
                                        <div class="dir-tree" id="aiDirTree"><div style="padding:1rem;color:var(--text-m)"><span class="spinner"></span> ${t('containers.loading')}</div></div>
                                    </div>
                                    <div class="ai-explorer-footer">
                                        <div class="ai-path-input-row">
                                            <span style="font-size:.7rem;font-weight:600;color:var(--text-m);white-space:nowrap">${t('ai.selectedPath')}:</span>
                                            <input type="text" id="aiPathInput" class="ai-path-input" placeholder="${t('ai.pathPlaceholder')}" autocomplete="off"
                                                onkeydown="if(event.key==='Enter'){let v=this.value.trim();if(v){v=convertWindowsPath(v);loadAiDirectories(v);}}">
                                        </div>
                                        <button class="section-btn primary" id="aiAnalyzeBtn" disabled onclick="startAiAnalysis()">${t('ai.analyze')} →</button>
                                    </div>
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
                            <button class="section-btn primary" onclick="goToPhase2({source:'manual'})">${t('misc.configure')} →</button>
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
                        <div class="svc-form-row"><label>${t('wizard.buildContext')}</label><input id="cfgBuild" placeholder="${t('wizard.buildPlaceholder')}"></div>
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

    // Reset AI wizard step back to step 1 so it doesn't stay on "Analyzing..."
    if (aiWizardOverlay) {
        aiGoToStep(1);
        // Restore the step 2 panel content (it gets replaced on error)
        const step2Panel = aiWizardOverlay.querySelector('[data-ai-step-panel="2"]');
        if (step2Panel) {
            step2Panel.innerHTML = `
                <div class="ai-loading" style="text-align:center;padding:2rem">
                    <div><span class="spinner" style="width:32px;height:32px"></span></div>
                    <div style="margin-top:1rem;color:var(--text-d)">${t('ai.analyzing')}</div>
                    <div id="aiScanList" class="ai-scan-list" style="margin-top:1rem;text-align:left"></div>
                </div>`;
        }
    }
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

        const icon = overlay.querySelector('#cfgIcon')?.value?.trim() || null;
        const color = overlay.querySelector('#cfgColor')?.value || '#6366f1';
        const body = {
            name, image, buildContext, ports, envVars, volumes,
            description: overlay.querySelector('#cfgDesc').value.trim(),
            icon, color,
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
            const slug = data.containerName || name.toLowerCase().replace(/[^a-z0-9-]/g, '-');
            // Close wizard modal, open deploy panel
            if (close) close();
            openDeployPanel(slug, name);
            // Start monitoring in the panel
            monitorDeployHealth(slug, name);
        } else {
            showToast(`${t('msg.deployFail')}: ` + (data.error || ''), 'error');
            btn.disabled = false;
            btn.textContent = 'Deploy →';
        }
    } catch (err) {
        showToast(`${t('msg.deployFail')}: ` + err.message, 'error');
        btn.disabled = false;
        btn.textContent = 'Deploy →';
    }
}

async function monitorDeployHealth(slug, name) {
    const BUILD_TIMEOUT = 120;
    const HEALTH_TIMEOUT = 20;

    if (!activeDeploy || activeDeploy.slug !== slug) return;
    activeDeploy.monitorAbort = false;

    let buildPhase = true;
    let healthChecks = 0;
    let wasRunning = false;

    for (let tick = 0; tick < BUILD_TIMEOUT; tick++) {
        if (!activeDeploy || activeDeploy.slug !== slug || activeDeploy.monitorAbort || activeDeploy.done) return;

        await new Promise(r => setTimeout(r, 3000));
        if (!activeDeploy || activeDeploy.slug !== slug || activeDeploy.monitorAbort || activeDeploy.done) return;

        const att = currentAttempt();
        if (!att || att.status !== 'deploying') return;

        try {
            const cRes = await fetch('/api/Containers');
            if (!cRes.ok) continue;
            const ctrs = await cRes.json();
            const ctr = ctrs.find(c => c.name === slug || c.name === name.toLowerCase().replace(/[^a-z0-9-]/g, '-'));

            if (!ctr) continue;

            if (buildPhase) { buildPhase = false; healthChecks = 0; }
            healthChecks++;

            if (ctr.state === 'running') {
                wasRunning = true;
                const svcPort = ctr.ports?.find(p => p.public)?.public;
                if (svcPort) {
                    try {
                        const hc = await fetch(`/api/proxy/${svcPort}/`, { signal: AbortSignal.timeout(3000) });
                        // Any HTTP response means server is up (even 404 — no root route but server works)
                        if (hc.status > 0 && hc.status < 500) {
                            const stable = await postDeployStabilityCheck(slug, name);
                            if (stable) {
                                att.status = 'success';
                                att.endTime = Date.now();
                                stopDeployTimer();
                                renderDeployPanel();
                                showToast(`${name} ${t('msg.deployOk')}`, 'success');
                                // Auto-detect urlPath if root returns 404
                                if (hc.status === 404) {
                                    autoDetectUrlPath(slug, svcPort);
                                }
                            } else {
                                await runDeployDiagnosis(slug, name);
                            }
                            fetchAll();
                            return;
                        }
                    } catch { /* not ready yet */ }

                    if (healthChecks > HEALTH_TIMEOUT) {
                        await runDeployDiagnosis(slug, name);
                        fetchAll();
                        return;
                    }
                } else {
                    if (healthChecks >= 3) {
                        const stable = await postDeployStabilityCheck(slug, name);
                        if (stable) {
                            att.status = 'success';
                            att.endTime = Date.now();
                            stopDeployTimer();
                            renderDeployPanel();
                            showToast(`${name} ${t('msg.deployOk')}`, 'success');
                        } else {
                            await runDeployDiagnosis(slug, name);
                        }
                        fetchAll();
                        return;
                    }
                }
                continue;
            }

            if (healthChecks > HEALTH_TIMEOUT) {
                await runDeployDiagnosis(slug, name);
                fetchAll();
                return;
            }

            if (ctr.state === 'restarting' || (ctr.state === 'exited' && (healthChecks > 3 || wasRunning))) {
                await runDeployDiagnosis(slug, name);
                return;
            }
        } catch { continue; }
    }

    // Timeout
    const att = currentAttempt();
    if (att) {
        att.status = 'failed';
        att.endTime = Date.now();
        att.logs = `${t('deploy.buildFail')} — timeout (${BUILD_TIMEOUT * 3}s)`;
    }
    stopDeployTimer();
    renderDeployPanel();
    fetchAll();
}

async function postDeployStabilityCheck(slug, name) {
    for (let i = 0; i < 4; i++) {
        await new Promise(r => setTimeout(r, 3000));
        if (!activeDeploy || activeDeploy.slug !== slug) return true;
        try {
            const cRes = await fetch('/api/Containers');
            if (!cRes.ok) continue;
            const ctrs = await cRes.json();
            const ctr = ctrs.find(c => c.name === slug || c.name === name.toLowerCase().replace(/[^a-z0-9-]/g, '-'));
            if (!ctr || ctr.state === 'exited' || ctr.state === 'restarting') return false;
        } catch { continue; }
    }
    return true;
}

// AI-powered urlPath detection when root "/" returns 404
async function autoDetectUrlPath(slug, port) {
    try {
        const res = await fetch('/api/Ai/detect-url-path', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ serviceSlug: slug })
        });
        if (!res.ok) return;
        const data = await res.json();
        if (!data.urlPath) return;

        // Verify the detected path actually works
        try {
            const check = await fetch(`/api/proxy/${port}${data.urlPath}`, { signal: AbortSignal.timeout(3000) });
            if (!check.ok) return;
        } catch { return; }

        // Update service urlPath
        const svcRes = await fetch('/api/Services');
        if (!svcRes.ok) return;
        const services = await svcRes.json();
        const svc = services.find(s => s.containerName === slug || s.serviceSlug === slug);
        if (svc && svc.id) {
            await fetch(`/api/Services/${svc.id}/url-path`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ urlPath: data.urlPath })
            });
            showToast(`URL path: ${data.urlPath}`, 'info');
        }
    } catch {}
}

async function runDeployDiagnosis(slug, name) {
    if (!activeDeploy || activeDeploy.slug !== slug) return;

    const att = currentAttempt();
    if (!att) return;

    // Attach result logs to the previous attempt so AI knows what happened after its fix
    if (activeDeploy.previousAttempts.length > 0) {
        const lastPrev = activeDeploy.previousAttempts[activeDeploy.previousAttempts.length - 1];
        if (!lastPrev.resultLogs) {
            lastPrev.resultLogs = `Container crashed/failed again after this fix was applied (attempt ${activeDeploy.attempts.length})`;
        }
    }

    att.status = 'diagnosing';
    att.endTime = null;
    renderDeployPanel();

    if (activeDeploy.attempts.length > activeDeploy.maxAttempts) {
        att.status = 'failed';
        att.endTime = Date.now();
        activeDeploy.done = true;
        renderDeployPanel();
        return;
    }

    try {
        const res = await fetch('/api/Ai/agent-fix', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                serviceSlug: slug,
                previousAttempts: activeDeploy.previousAttempts,
                language: currentLang
            })
        });

        if (!res.ok) {
            att.status = 'failed';
            att.endTime = Date.now();
            att.reasoning = t('wizard.deployMonitor.diagFail');
            stopDeployTimer();
            renderDeployPanel();
            return;
        }

        const data = await res.json();
        att.reasoning = data.reasoning;

        if (data.fix) {
            att.fixDescription = data.fix.description;
            att.status = 'fixing';
            renderDeployPanel();

            // Record for future AI calls (resultLogs will be filled after redeploy if it fails again)
            activeDeploy.previousAttempts.push({ fixDescription: data.fix.description, resultLogs: '' });

            // Collapse this attempt, start a new one
            att.endTime = Date.now();
            att.status = 'failed';
            att.collapsed = true;

            // Redeploy
            await fetch('/api/Ai/fix-and-redeploy', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ serviceSlug: slug, fixedYaml: null })
            });

            startNewDeployRound();
        } else {
            att.userAction = data.userActionRequired;
            att.status = 'failed';
            att.endTime = Date.now();
            activeDeploy.done = true;
            stopDeployTimer();
            renderDeployPanel();
        }
    } catch (err) {
        att.status = 'failed';
        att.endTime = Date.now();
        att.reasoning = `${t('wizard.deployMonitor.diagFail')}: ${err.message}`;
        stopDeployTimer();
        renderDeployPanel();
    }
}

function startNewDeployRound() {
    if (!activeDeploy) return;
    activeDeploy.done = false;

    // Add new attempt
    const newId = activeDeploy.attempts.length + 1;
    activeDeploy.attempts.push({
        id: newId, status: 'deploying', startTime: Date.now(), endTime: null,
        reasoning: null, fixDescription: null, userAction: null, logs: null, collapsed: false
    });

    if (!activeDeploy.timerInterval) {
        activeDeploy.timerInterval = setInterval(() => {
            if (!activeDeploy || activeDeploy.done) return;
            const elapsed = Math.floor((Date.now() - activeDeploy.startTime) / 1000);
            const mins = Math.floor(elapsed / 60);
            const secs = elapsed % 60;
            const timerEl = document.getElementById('deployTimer');
            if (timerEl) timerEl.textContent = `${mins}:${secs.toString().padStart(2, '0')} ${t('deploy.elapsed')}`;
        }, 1000);
    }

    renderDeployPanel();
    monitorDeployHealth(activeDeploy.slug, activeDeploy.name);
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

    // Start with host drives view (This Computer)
    loadHostDrives();
}

let aiCurrentPath = null; // track current directory for back navigation

async function loadAiDirectories(path) {
    const tree = aiWizardOverlay?.querySelector('#aiDirTree');
    if (!tree) return;
    tree.innerHTML = '<div style="padding:.8rem;text-align:center;color:var(--text-m)"><span class="spinner"></span></div>';
    aiCurrentPath = path;

    try {
        const res = await fetch(`/api/Ai/directories?path=${encodeURIComponent(path)}`);
        if (!res.ok) throw new Error();
        const dirs = await res.json();

        updateAiBreadcrumb(path);
        updatePathInput(path);

        if (!dirs.length) {
            tree.innerHTML = `<div style="padding:1.5rem;text-align:center;color:var(--text-m);font-size:.8rem">${t('msg.noResults')}</div>`;
            return;
        }

        tree.innerHTML = dirs.map(d => `
            <div class="dir-item ${d.isProject ? 'project' : ''}" data-path="${escHtml(d.path)}" data-hassub="${d.hasSubdirs}">
                <svg class="dir-item-svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    ${d.isProject
                        ? '<path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" fill="rgba(99,102,241,.15)" stroke="var(--accent)"/>'
                        : d.hasSubdirs
                        ? '<path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>'
                        : '<path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z"/><polyline points="13 2 13 9 20 9"/>'}
                </svg>
                <span class="dir-item-name">${escHtml(d.name)}</span>
                ${d.isProject ? `<span class="dir-item-badge">${t('ai.projectDetected')}</span>` : ''}
                ${d.hasSubdirs ? '<svg class="dir-item-arrow" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--text-m)" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>' : ''}
            </div>
        `).join('');

        tree.querySelectorAll('.dir-item').forEach(item => {
            item.addEventListener('click', () => {
                const itemPath = item.dataset.path;
                tree.querySelectorAll('.dir-item').forEach(i => i.classList.remove('selected'));
                item.classList.add('selected');
                aiSelectedProjectPath = itemPath;
                updatePathInput(itemPath);
                aiWizardOverlay.querySelector('#aiAnalyzeBtn').disabled = false;
            });
            item.addEventListener('dblclick', () => {
                if (item.dataset.hassub === 'true') {
                    loadAiDirectories(item.dataset.path);
                }
            });
        });
    } catch {
        tree.innerHTML = `<div style="padding:1rem;text-align:center;color:var(--red);font-size:.8rem">${t('ai.dirLoadFail')}</div>`;
    }
}

async function loadHostDrives() {
    const tree = aiWizardOverlay?.querySelector('#aiDirTree');
    if (!tree) return;
    tree.innerHTML = '<div style="padding:.8rem;text-align:center;color:var(--text-m)"><span class="spinner"></span></div>';
    aiCurrentPath = null;

    try {
        const res = await fetch('/api/Ai/host-drives');
        if (!res.ok) throw new Error();
        const drives = await res.json();

        const bc = aiWizardOverlay?.querySelector('#aiBreadcrumb');
        if (bc) bc.innerHTML = `<span style="font-size:.75rem;color:var(--text-d);font-weight:600">${t('ai.thisComputer')}</span>`;
        updatePathInput('');

        if (!drives.length) {
            tree.innerHTML = `<div style="padding:1.5rem;text-align:center;color:var(--text-m);font-size:.8rem">${t('msg.noResults')}</div>`;
            return;
        }

        tree.innerHTML = `<div class="ai-drives-grid">${drives.map(d => `
            <div class="ai-drive-card ${d.accessible ? '' : 'disabled'}" data-path="${escHtml(d.path)}">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="1.5"><rect x="2" y="4" width="20" height="16" rx="2"/><line x1="2" y1="14" x2="22" y2="14"/><circle cx="17" cy="18" r="1"/></svg>
                <div class="ai-drive-label">${escHtml(d.name)}</div>
            </div>
        `).join('')}</div>`;

        tree.querySelectorAll('.ai-drive-card:not(.disabled)').forEach(card => {
            card.addEventListener('click', () => loadAiDirectories(card.dataset.path));
        });
    } catch {
        tree.innerHTML = `<div style="padding:1rem;text-align:center;color:var(--red);font-size:.8rem">${t('ai.dirLoadFail')}</div>`;
    }
}

function navigateUp() {
    if (!aiCurrentPath || aiCurrentPath === '/') { loadHostDrives(); return; }
    const parent = aiCurrentPath.replace(/\/[^/]+\/?$/, '') || '/';
    if (parent === '/hostfs') { loadHostDrives(); return; }
    loadAiDirectories(parent);
}

function updatePathInput(path) {
    const input = aiWizardOverlay?.querySelector('#aiPathInput');
    if (input) input.value = path || '';
}

function convertWindowsPath(winPath) {
    // Convert C:\Users\... → /hostfs/c/Users/...
    const match = winPath.match(/^([A-Za-z]):[\\\/](.*)/);
    if (match) {
        const drive = match[1].toLowerCase();
        const rest = match[2].replace(/\\/g, '/');
        return `/hostfs/${drive}/${rest}`;
    }
    return winPath;
}

function updateAiBreadcrumb(path) {
    const bc = aiWizardOverlay?.querySelector('#aiBreadcrumb');
    if (!bc) return;
    const parts = path.split('/').filter(Boolean);
    const isHostfs = parts[0] === 'hostfs';
    let html = '';

    if (isHostfs) {
        html = `<span class="dir-bc-item" onclick="loadHostDrives()">${t('ai.thisComputer')}</span>`;
        for (let i = 1; i < parts.length; i++) {
            const cp = '/hostfs/' + parts.slice(1, i + 1).join('/');
            const label = (i === 1) ? parts[i].toUpperCase() + ':' : parts[i];
            html += `<span class="dir-bc-sep">›</span><span class="dir-bc-item" onclick="loadAiDirectories('${escHtml(cp)}')">${escHtml(label)}</span>`;
        }
    } else {
        html = `<span class="dir-bc-item" onclick="loadAiDirectories('/')">/</span>`;
        let cp = '';
        for (const part of parts) {
            cp += '/' + part;
            html += `<span class="dir-bc-sep">›</span><span class="dir-bc-item" onclick="loadAiDirectories('${escHtml(cp)}')">${escHtml(part)}</span>`;
        }
    }
    bc.innerHTML = html;

    // Update path input
    const pathInput = aiWizardOverlay?.querySelector('#aiPathInput');
    if (pathInput) pathInput.value = path;
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
        // Use the selected project path directly as build context
        // AI may return relative paths like "./subdir" but the selected path is already the project root
        let buildCtx = result.buildContext || '';
        if (aiSelectedProjectPath) {
            if (!buildCtx || buildCtx === '.' || buildCtx === './') {
                // Project IS the selected directory
                buildCtx = aiSelectedProjectPath;
            } else if (!buildCtx.startsWith('/')) {
                // AI says project is in a subdirectory — but user already selected the project folder
                // Use selected path directly (user picked the project, not its parent)
                buildCtx = aiSelectedProjectPath;
            }
            // If AI returned an absolute path, keep it
        }
        goToPhase2({
            source: 'ai', name: result.serviceName,
            image: result.image || '', buildContext: buildCtx,
            description: result.explanation || '', ports: aiPorts,
            envVars: result.envVars || {},
            volumes: (result.volumes || []).map(v => {
                // Convert relative volume host paths to absolute using selected project path
                if (!aiSelectedProjectPath) return v;
                const colonIdx = v.indexOf(':');
                if (colonIdx <= 0) return v;
                const hostPart = v.substring(0, colonIdx);
                const rest = v.substring(colonIdx);
                if (hostPart === '.' || hostPart === './') {
                    return aiSelectedProjectPath + rest;
                }
                if (hostPart.startsWith('./')) {
                    return aiSelectedProjectPath + '/' + hostPart.slice(2) + rest;
                }
                return v;
            }),
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
