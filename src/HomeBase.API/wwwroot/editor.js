// ─── Editor Module ───

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

    // Load port access states
    let portStates = [];
    try {
        const psRes = await fetch('/api/Settings/ports/overview');
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
                                <button type="button" class="port-mini-toggle ${isExternal ? 'on' : ''}" data-port-key="${escHtml(v.key)}" data-port-external="${isExternal}" onclick="this.classList.toggle('on');this.dataset.portExternal=this.classList.contains('on');const lbl=this.nextElementSibling;lbl.textContent=this.classList.contains('on')?t('port.all'):t('port.local');lbl.className='port-access-label '+(this.classList.contains('on')?'external':'local')"></button>
                                <span class="port-access-label ${isExternal ? 'external' : 'local'}">
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                                    ${isExternal ? t('port.all') : t('port.local')}
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

    const hasCompose = isEdit && data.serviceSlug;

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay panel-right';
    overlay.innerHTML = `
        <div class="modal">
            <h3>${isEdit ? t('editor.title') : t('editor.addTitle')}</h3>
            ${hasCompose ? `<div class="editor-tabs">
                <button class="editor-tab active" data-edtab="settings">${t('editor.settingsTab')}</button>
                <button class="editor-tab" data-edtab="compose">${t('editor.composeTab')}</button>
            </div>` : ''}
            <div class="editor-tab-panel active" data-edpanel="settings">
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
            </div>
            ${hasCompose ? `<div class="editor-tab-panel" data-edpanel="compose">
                <div id="composeEditorContent" style="max-height:70vh;overflow-y:auto">
                    <div style="padding:1rem;text-align:center;color:var(--text-m)"><span class="spinner"></span> ${t('editor.composeLoading')}</div>
                </div>
            </div>` : ''}
            <div class="modal-actions" style="margin-top:1rem">
                ${isEdit && !containers.find(c => c.name === data.containerName)?.protected ? `<button class="svc-delete-btn" id="svcDeleteBtn">${t('confirm.delete')}</button>` : '<span></span>'}
                <div style="display:flex;gap:.5rem">
                    <button class="modal-cancel">${t('confirm.cancel')}</button>
                    <button class="modal-confirm" id="svcSaveBtn">${isEdit ? t('editor.save') : t('editor.add')}</button>
                </div>
            </div>
        </div>`;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('active'));

    const close = () => { overlay.classList.remove('active'); setTimeout(() => overlay.remove(), 300); };
    overlay.querySelector('.modal-cancel').addEventListener('click', close);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

    // Editor tab switching — hide settings action buttons on compose tab
    const settingsActions = overlay.querySelector('.modal-actions');
    if (hasCompose) {
        let composeLoaded = false;
        overlay.querySelectorAll('.editor-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                overlay.querySelectorAll('.editor-tab').forEach(t => t.classList.remove('active'));
                overlay.querySelectorAll('.editor-tab-panel').forEach(p => p.classList.remove('active'));
                tab.classList.add('active');
                overlay.querySelector(`[data-edpanel="${tab.dataset.edtab}"]`).classList.add('active');
                // Hide settings action buttons when on compose tab
                if (settingsActions) settingsActions.style.display = tab.dataset.edtab === 'compose' ? 'none' : '';
                if (tab.dataset.edtab === 'compose' && !composeLoaded) {
                    composeLoaded = true;
                    loadComposeEditor(overlay, id, data);
                }
            });
        });
    }

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

            // 2a. Save port access toggles
            const portToggles = overlay.querySelectorAll('.port-mini-toggle');
            for (const toggle of portToggles) {
                const portKey = toggle.dataset.portKey;
                const isExternal = toggle.dataset.portExternal === 'true';
                const portInput = overlay.querySelector(`.env-field[data-env-key="${portKey}"]`);
                const portVal = parseInt(portInput?.value);
                if (portVal) {
                    try {
                        await fetch('/api/Settings/ports/toggle', {
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
                    btn.textContent = isEdit ? t('misc.save') : t('misc.add');
                    return;
                }
            } else {
                showToast(isEdit ? t('msg.svcUpdated') : t('msg.svcAdded'), 'success');
            }

            close();
            fetchAll();
        } catch (err) {
            showToast(t('msg.error') + err.message, 'error');
            btn.disabled = false;
            btn.textContent = isEdit ? t('misc.save') : t('misc.add');
        }
    });
}

async function loadComposeEditor(overlay, serviceId, svc) {
    const content = overlay.querySelector('#composeEditorContent');
    try {
        const res = await fetch(`/api/Services/${serviceId}/compose`);
        if (!res.ok) {
            content.innerHTML = `<div style="padding:1rem;color:var(--text-m)">${t('editor.composeNotFound')}</div>`;
            return;
        }
        const data = await res.json();
        content.dataset.serviceId = serviceId;
        content.innerHTML = `
            <textarea id="composeYamlEditor" class="compose-editor-textarea" rows="18" spellcheck="false">${escHtml(data.yaml)}</textarea>
            <div style="display:flex;gap:.5rem;margin-top:.6rem;align-items:center">
                <button class="section-btn primary" id="composeSaveBtn" onclick="saveCompose(${serviceId})">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
                    ${t('editor.saveRecreate')}
                </button>
                <button class="section-btn" onclick="loadComposeEditor(this.closest('.modal-overlay'),${serviceId},null)" title="${t('editor.reset')}">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/></svg>
                </button>
            </div>
            <div class="compose-ai-chat" style="margin-top:.8rem;border-top:1px solid var(--border);padding-top:.6rem">
                <div style="font-size:.65rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-m);margin-bottom:.4rem;display:flex;align-items:center;gap:.3rem">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
                    ${t('editor.aiAssist')}
                </div>
                <div id="composeAiMessages" class="compose-ai-messages"></div>
                <div style="display:flex;gap:.4rem;align-items:center">
                    <input type="text" id="composeAiInput" class="compose-ai-input" placeholder="${t('editor.aiChatPlaceholder')}"
                        onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();sendComposeAiChat(${serviceId});}">
                    <button class="section-btn primary section-btn-sm" onclick="sendComposeAiChat(${serviceId})">${t('editor.aiChatSend')}</button>
                </div>
            </div>`;
    } catch {
        content.innerHTML = `<div style="padding:1rem;color:var(--red)">${t('editor.composeNotFound')}</div>`;
    }
}

async function saveCompose(serviceId) {
    const textarea = document.querySelector('#composeYamlEditor');
    const btn = document.querySelector('#composeSaveBtn');
    if (!textarea || !btn) return;
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner"></span> ${t('msg.saving')}`;
    try {
        const res = await fetch(`/api/Services/${serviceId}/compose`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ yaml: textarea.value })
        });
        const data = await res.json();
        if (data.ok) {
            showToast(t('editor.composeSaveOk'), data.recreated ? 'success' : 'warning');
            fetchAll();
        } else {
            showToast(t('editor.composeSaveFail'), 'error');
        }
    } catch {
        showToast(t('editor.composeSaveFail'), 'error');
    }
    btn.disabled = false;
    btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> ${t('editor.saveRecreate')}`;
}

async function sendComposeAiChat(serviceId) {
    const input = document.querySelector('#composeAiInput');
    const messages = document.querySelector('#composeAiMessages');
    const textarea = document.querySelector('#composeYamlEditor');
    if (!input || !messages || !textarea) return;
    const instruction = input.value.trim();
    if (!instruction) return;

    // Show user message
    messages.innerHTML += `<div class="compose-ai-msg user"><span class="compose-ai-msg-text">${escHtml(instruction)}</span></div>`;
    input.value = '';
    input.disabled = true;

    // Show loading
    messages.innerHTML += `<div class="compose-ai-msg ai" id="aiMsgLoading"><span class="spinner" style="width:12px;height:12px"></span> ${t('editor.aiAssistLoading')}</div>`;
    messages.scrollTop = messages.scrollHeight;

    try {
        const res = await fetch(`/api/Services/${serviceId}/compose/ai-assist`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ yaml: textarea.value, instruction })
        });
        document.querySelector('#aiMsgLoading')?.remove();
        if (!res.ok) throw new Error();
        const data = await res.json();

        if (data.modifiedYaml) {
            // AI returned modified YAML — show diff and apply button
            textarea.value = data.modifiedYaml;
            textarea.classList.add('changed');
            messages.innerHTML += `<div class="compose-ai-msg ai">
                <span class="compose-ai-msg-text">${escHtml(data.explanation || t('editor.yamlUpdated'))}</span>
                <div style="margin-top:.3rem;font-size:.7rem;color:var(--green)">✓ ${t('editor.aiApply')} — ${t('editor.yamlApplied')}</div>
            </div>`;
        } else if (data.suggestions) {
            messages.innerHTML += `<div class="compose-ai-msg ai"><span class="compose-ai-msg-text" style="white-space:pre-wrap">${escHtml(data.suggestions)}</span></div>`;
        }
    } catch {
        document.querySelector('#aiMsgLoading')?.remove();
        messages.innerHTML += `<div class="compose-ai-msg ai" style="color:var(--red)">${t('ai.error')}</div>`;
    }
    input.disabled = false;
    input.focus();
    messages.scrollTop = messages.scrollHeight;
}

async function deleteService(id, name) {
    if (deletingServiceIds.has(id)) return;
    const ok = await showConfirm(
        t('confirm.deleteTitle'),
        `<strong>${escHtml(name)}</strong><br><br>${t('confirm.deleteDetail')}`,
        t('confirm.delete'),
        'danger'
    );
    if (!ok) return;

    deletingServiceIds.add(id);

    // Show progress toast
    const progressToast = document.createElement('div');
    progressToast.className = 'toast info';
    progressToast.innerHTML = `<span class="toast-icon"><span class="spinner" style="width:18px;height:18px;border-width:2px"></span></span><span class="toast-msg" id="deleteProgress">${name}: ${t('msg.deleting')}</span>`;
    $('#toastContainer').appendChild(progressToast);
    const setProgress = (msg) => { const el = progressToast.querySelector('#deleteProgress'); if (el) el.textContent = `${name}: ${msg}`; };

    try {
        setProgress(t('msg.deleteStep.removing'));
        const res = await fetch(`/api/Services/${id}`, { method: 'DELETE' });
        const data = await res.json();

        if (data.ok) {
            setProgress(t('msg.deleteStep.done'));
            services = services.filter(s => s.id !== id);
            renderServices();

            // Remove progress, show success
            setTimeout(() => { progressToast.classList.add('removing'); setTimeout(() => progressToast.remove(), 300); }, 500);
            showToast(`${name} ${t('msg.svcDeleted')}`, 'success');

            if (data.warnings?.length) {
                data.warnings.forEach(w => showToast(w, 'warning', 5000));
            }
        } else {
            progressToast.classList.add('removing');
            setTimeout(() => progressToast.remove(), 300);
            showToast(`${t('msg.svcDeleteFail')}: ${data.error || ''}`, 'error');
        }
    } catch (err) {
        progressToast.classList.add('removing');
        setTimeout(() => progressToast.remove(), 300);
        showToast(`${t('msg.svcDeleteFail')}: ${err.message}`, 'error');
    }

    await fetchAll();
    loadEnvData();
    deletingServiceIds.delete(id);
}
