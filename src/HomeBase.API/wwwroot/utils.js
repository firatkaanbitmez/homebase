// ─── Utils Module ───
const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);

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

// ─── Helpers ───
const HOST = location.hostname;
const getCtr = svc => containers.find(c => c.name === svc.containerName);
const barCls = v => { const n = parseFloat(v); return n < 50 ? 'lo' : n < 80 ? 'mi' : 'hi'; };
function getSvcUrl(svc, ctr) {
    if (!ctr || !ctr.ports.length) return null;
    const port = svc.preferPort
        ? ctr.ports.find(p => p.public === svc.preferPort) || ctr.ports[0]
        : ctr.ports[0];
    if (!port) return null;
    const isLocal = port.ip === '127.0.0.1' || port.ip === '::1';
    const isRemoteBrowser = location.hostname !== 'localhost'
        && location.hostname !== '127.0.0.1';
    if (isLocal && isRemoteBrowser) {
        return `/api/proxy/${port.public}${svc.urlPath || '/'}`;
    }
    return `http://${HOST}:${port.public}${svc.urlPath || ''}`;
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

function fmtPullCount(n) {
    if (n >= 1e9) return (n/1e9).toFixed(1) + 'B';
    if (n >= 1e6) return (n/1e6).toFixed(1) + 'M';
    if (n >= 1e3) return (n/1e3).toFixed(1) + 'K';
    return String(n);
}
