const state = {
    auth: null,
    activeSection: 'overview',
    overview: null,
    meta: null,
    players: [],
    playerSearch: '',
    playerFilter: 'all',
    settings: null,
    steamApiKeyConfigured: false,
    rankUpdaterStatus: null,
    tempRooms: [],
    tvDraftSetups: [],
    pbDraftChannelIds: [],
    jrDraftMemberRoleIds: [],
    jrDraftBotRoleIds: [],
    dashboardDraftRoleIds: [],
    allowedChannelBypassDraftRoleIds: [],
    ticketDraftSupportRoleIds: [],
    modDraftAdminRoleIds: [],
    modDraftEscalationRules: [],
    openTickets: [],
    bans: [],
    logs: [],
    logCategory: 'all',
    logSearch: '',
    announcementsHistory: [],
    editingAnnouncement: null,
    isDirty: false,
    dirtyFormId: null
};

const SECTION_TITLES = {
    overview: 'Overview',
    players: 'Players',
    announcements: 'Announcements',
    logs: 'Activity Log',
    tempvoice: 'TempVoice',
    patchbot: 'PatchBot',
    joinroles: 'Join Roles',
    csstatus: 'CS2 Status',
    rankfeed: 'Rank-Up / Derank',
    adminlog: 'Admin Log',
    welcome: 'Welcome',
    tickets: 'Tickets',
    moderation: 'Moderation',
    settings: 'Settings'
};

const LOG_CATEGORY_LABELS = {
    audit: 'Audit',
    dashboard: 'Audit',
    moderation: 'Moderation',
    elo: 'CS2 Elo',
    tempvoice: 'TempVoice',
    patchbot: 'PatchBot',
    joinroles: 'Join Roles',
    adminlog: 'Admin Log',
    welcome: 'Welcome',
    tickets: 'Tickets',
    voice: 'Voice',
    system: 'System'
};

const OAUTH_ERRORS = {
    bot_starting: 'Bot is starting up, please try again in a few seconds.',
    oauth_config: 'Missing CLIENT_SECRET or REDIRECT_URI in .env for Discord OAuth2.',
    oauth_cancelled: 'Discord sign-in was cancelled.',
    oauth_state: 'Login session expired. Please sign in again.',
    oauth_failed: 'Failed to verify login with Discord API.'
};

const LIVE_POLL_MS = 5000;
const BOT_STATUS_VARIABLES = [
    { token: '{players}', label: 'Players' },
    { token: '{members}', label: 'Members' },
    { token: '{rooms}', label: 'TempVoice' },
    { token: '{top_elo}', label: 'Top Elo' },
    { token: '{ping}', label: 'Ping' },
    { token: '{uptime}', label: 'Uptime' }
];
let livePollTimer = null;
let uptimeTickTimer = null;
let isLivePolling = false;
let lastPlayersHtml = '';
let lastRoomsHtml = '';
let lastLogsHtml = '';
let lastTicketsHtml = '';

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function formatDuration(ms) {
    const totalSec = Math.max(0, Math.floor((ms || 0) / 1000));
    const days = Math.floor(totalSec / 86400);
    const hours = Math.floor((totalSec % 86400) / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    const secs = totalSec % 60;
    if (days > 0) return `${days}d ${hours}h ${mins}m ${secs}s`;
    if (hours > 0) return `${hours}h ${mins}m ${secs}s`;
    return `${mins}m ${secs}s`;
}

function formatIntervalLabel(seconds) {
    if (!seconds || seconds < 60) return `${seconds || 30} s`;
    if (seconds % 60 === 0) return `${seconds / 60} min`;
    return `${Math.floor(seconds / 60)} min ${seconds % 60} s`;
}

function splitIntervalParts(seconds) {
    const sec = Number(seconds) || 300;
    if (sec >= 60 && sec % 60 === 0) {
        return { value: sec / 60, unit: 'm' };
    }
    return { value: sec, unit: 's' };
}

function formatRelativeTimestamp(unixSeconds) {
    if (!unixSeconds) return 'Never';
    return new Date(unixSeconds * 1000).toLocaleString('en-GB');
}

function renderToggleSwitch(id, checked, extraClass = '', dataAttr = '') {
    const idAttr = id ? `id="${escapeHtml(id)}"` : '';
    return `
        <label class="toggle-switch">
            <input ${idAttr} type="checkbox" class="${escapeHtml(extraClass)}" ${dataAttr} ${checked ? 'checked' : ''} />
            <span class="toggle-track"></span>
            <span class="toggle-thumb"></span>
        </label>
    `;
}

function setDirty(isDirty, formId = null) {
    state.isDirty = Boolean(isDirty);
    state.dirtyFormId = isDirty ? formId : null;
    const banner = document.getElementById('unsaved-banner');
    if (banner) {
        banner.classList.toggle('hidden', !state.isDirty);
    }
}

function bindDirtyForm(formId) {
    const form = document.getElementById(formId);
    if (!form) return;
    form.addEventListener('input', () => setDirty(true, formId));
    form.addEventListener('change', () => setDirty(true, formId));
}

function syncDraftsFromSettings() {
    const s = state.settings || {};
    state.tvDraftSetups = (s.tempVoice?.setups || []).map(item => ({
        ...item,
        createTriggerChannel: false,
        lockOnDisable: Boolean(item.lockOnDisable),
        lockRoleIds: [...(item.lockRoleIds || [])]
    }));
    state.pbDraftChannelIds = [...(s.patchBot?.channelIds || [])];
    state.jrDraftMemberRoleIds = [...(s.joinRoles?.memberRoleIds || [])];
    state.jrDraftBotRoleIds = [...(s.joinRoles?.botRoleIds || [])];
    state.dashboardDraftRoleIds = [...(s.dashboardRoleIds || [])];
    state.allowedChannelBypassDraftRoleIds = [...(s.allowedChannelBypassRoleIds || [])];
    state.ticketDraftSupportRoleIds = [...(s.tickets?.supportRoleIds || [])];
    state.modDraftAdminRoleIds = [...(s.moderation?.adminRoleIds || [])];
    state.modDraftEscalationRules = (s.moderation?.autoEscalation?.rules || []).map(r => ({ ...r }));
}

function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const styles = {
        success: 'bg-emerald-950/95 border-emerald-500/40 text-emerald-200',
        error: 'bg-red-950/95 border-red-500/40 text-red-200',
        info: 'bg-slate-900/95 border-brand/40 text-slate-100'
    };
    const icons = {
        success: 'check-circle-2',
        error: 'alert-circle',
        info: 'info'
    };

    const el = document.createElement('div');
    el.className = `toast-enter pointer-events-auto flex items-start gap-2.5 px-4 py-3 rounded-xl border shadow-xl text-sm backdrop-blur ${styles[type] || styles.info}`;
    el.innerHTML = `
        <i data-lucide="${icons[type] || 'info'}" class="w-4 h-4 mt-0.5 shrink-0"></i>
        <span class="flex-1">${escapeHtml(message)}</span>
    `;
    container.appendChild(el);
    refreshIcons();

    setTimeout(() => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(-6px)';
        el.style.transition = 'all 0.2s ease';
        setTimeout(() => el.remove(), 220);
    }, 4000);
}

function refreshIcons() {
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
        window.lucide.createIcons();
    }
}

async function setButtonLoading(button, isLoading, loadingText = 'Working...') {
    if (!button) return;
    if (isLoading) {
        button.dataset.origHtml = button.innerHTML;
        button.disabled = true;
        button.classList.add('opacity-70', 'cursor-not-allowed');
        button.innerHTML = `<span class="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"></span><span>${escapeHtml(loadingText)}</span>`;
    } else {
        button.disabled = false;
        button.classList.remove('opacity-70', 'cursor-not-allowed');
        if (button.dataset.origHtml) {
            button.innerHTML = button.dataset.origHtml;
            refreshIcons();
        }
    }
}

function confirmAction({ title = 'Confirm action', message = '', confirmLabel = 'Confirm', danger = true }) {
    return new Promise(resolve => {
        const modal = document.getElementById('confirm-modal');
        const titleEl = document.getElementById('confirm-title');
        const msgEl = document.getElementById('confirm-message');
        const acceptBtn = document.getElementById('confirm-accept');
        const cancelBtn = document.getElementById('confirm-cancel');
        const iconWrap = document.getElementById('confirm-icon-wrap');

        titleEl.textContent = title;
        msgEl.textContent = message;
        acceptBtn.textContent = confirmLabel;

        acceptBtn.className = danger
            ? 'px-4 py-2 rounded-xl text-sm font-medium bg-red-600 hover:bg-red-500 text-white transition'
            : 'px-4 py-2 rounded-xl text-sm font-medium bg-brand hover:bg-brand-hover text-white transition';

        iconWrap.className = danger
            ? 'w-10 h-10 rounded-xl bg-red-500/15 text-red-400 flex items-center justify-center shrink-0'
            : 'w-10 h-10 rounded-xl bg-brand/15 text-brand flex items-center justify-center shrink-0';

        modal.classList.remove('hidden');

        function cleanup(result) {
            modal.classList.add('hidden');
            acceptBtn.removeEventListener('click', onAccept);
            cancelBtn.removeEventListener('click', onCancel);
            modal.removeEventListener('click', onBackdrop);
            resolve(result);
        }

        function onAccept() { cleanup(true); }
        function onCancel() { cleanup(false); }
        function onBackdrop(e) { if (e.target === modal) cleanup(false); }

        acceptBtn.addEventListener('click', onAccept);
        cancelBtn.addEventListener('click', onCancel);
        modal.addEventListener('click', onBackdrop);
    });
}

function openRenameModal(currentName) {
    return new Promise(resolve => {
        const modal = document.getElementById('rename-modal');
        const form = document.getElementById('rename-modal-form');
        const input = document.getElementById('rename-modal-input');
        const cancelBtn = document.getElementById('rename-modal-cancel');

        input.value = currentName || '';
        modal.classList.remove('hidden');
        setTimeout(() => input.focus(), 20);

        function cleanup(val) {
            modal.classList.add('hidden');
            form.removeEventListener('submit', onSubmit);
            cancelBtn.removeEventListener('click', onCancel);
            modal.removeEventListener('click', onBackdrop);
            resolve(val);
        }

        function onSubmit(e) {
            e.preventDefault();
            cleanup(input.value.trim());
        }
        function onCancel() { cleanup(null); }
        function onBackdrop(e) { if (e.target === modal) cleanup(null); }

        form.addEventListener('submit', onSubmit);
        cancelBtn.addEventListener('click', onCancel);
        modal.addEventListener('click', onBackdrop);
    });
}

async function apiFetch(url, options = {}) {
    const fetchOpts = {
        headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
        ...options
    };
    const res = await fetch(url, fetchOpts);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
            stopLiveUpdates();
            await bootstrap();
        }
        throw new Error(data.error || `Server error (${res.status})`);
    }
    return data;
}

function showView(viewId) {
    ['view-loading', 'view-login', 'view-denied', 'view-app'].forEach(id => {
        document.getElementById(id).classList.toggle('hidden', id !== viewId);
    });
}

function buildRoleOptions(selectedId, { allowNone = true, noneLabel = '— None —', allowEveryone = false, onlyAssignable = false } = {}) {
    const roles = state.meta?.roles || [];
    let html = allowNone ? `<option value="">${escapeHtml(noneLabel)}</option>` : '';

    for (const r of roles) {
        if (r.isEveryone && !allowEveryone) continue;
        if (onlyAssignable && !r.isEveryone && r.managed) continue;
        const selected = r.id === selectedId ? 'selected' : '';
        let suffix = '';
        if (!r.isEveryone && r.managed) suffix = ' (managed)';
        else if (!r.isEveryone && !r.editable && onlyAssignable) suffix = ' (above bot role)';
        html += `<option value="${escapeHtml(r.id)}" ${selected}>${escapeHtml(r.name)}${suffix}</option>`;
    }
    return html;
}

function buildTextChannelOptions(selectedId, { allowNone = true, noneLabel = '— None —' } = {}) {
    const channels = state.meta?.textChannels || [];
    let html = allowNone ? `<option value="">${escapeHtml(noneLabel)}</option>` : '';
    for (const c of channels) {
        const selected = c.id === selectedId ? 'selected' : '';
        const prefix = c.type === 'announcement' ? '📢 #' : '#';
        html += `<option value="${escapeHtml(c.id)}" ${selected}>${prefix}${escapeHtml(c.name)}</option>`;
    }
    return html;
}

function buildVoiceChannelOptions(selectedId, { allowNone = true, noneLabel = '— None —' } = {}) {
    const channels = state.meta?.voiceChannels || [];
    let html = allowNone ? `<option value="">${escapeHtml(noneLabel)}</option>` : '';
    for (const c of channels) {
        const selected = c.id === selectedId ? 'selected' : '';
        html += `<option value="${escapeHtml(c.id)}" ${selected}>🔊 ${escapeHtml(c.name)}</option>`;
    }
    return html;
}

function buildCategoryOptions(selectedId) {
    const cats = state.meta?.categories || [];
    let html = '<option value="">— Automatic —</option>';
    for (const c of cats) {
        const selected = c.id === selectedId ? 'selected' : '';
        html += `<option value="${escapeHtml(c.id)}" ${selected}>📁 ${escapeHtml(c.name)}</option>`;
    }
    return html;
}

function renderAddButtonHtml(id, label) {
    return `
        <button id="${escapeHtml(id)}" type="button" class="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-dashed border-slate-700 hover:border-brand/70 bg-bg-elevated/50 hover:bg-brand/10 text-slate-300 hover:text-white text-sm font-medium transition">
            <i data-lucide="plus" class="w-4 h-4 text-brand"></i>
            <span>${escapeHtml(label)}</span>
        </button>
    `;
}

// --- RENDERERS ---

function buildOverviewActivityChartSvg(dailyActivity) {
    const days = Array.isArray(dailyActivity) ? dailyActivity : [];
    if (days.length === 0) {
        return `<p class="text-xs text-slate-400 py-8 text-center">No data yet.</p>`;
    }

    const W = 520;
    const H = 165;
    const padL = 30;
    const padR = 10;
    const padT = 12;
    const padB = 26;
    const innerW = W - padL - padR;
    const innerH = H - padT - padB;
    const maxVal = Math.max(4, ...days.flatMap(d => [d.messages || 0, d.voiceJoins || 0]));
    const slotW = innerW / days.length;
    const barW = Math.min(16, Math.max(8, Math.floor(slotW * 0.28)));
    const gap = 4;

    const gridLines = [0.25, 0.5, 0.75, 1].map(frac => {
        const y = padT + (1 - frac) * innerH;
        const val = Math.round(maxVal * frac);
        return `
            <line x1="${padL}" y1="${y.toFixed(1)}" x2="${W - padR}" y2="${y.toFixed(1)}" stroke="#1e293b" stroke-dasharray="3 3" />
            <text x="${padL - 6}" y="${(y + 3).toFixed(1)}" text-anchor="end" fill="#64748b" font-size="10">${val}</text>
        `;
    }).join('');

    const bars = days.map((d, i) => {
        const cx = padL + i * slotW + slotW / 2;
        const msgH = ((d.messages || 0) / maxVal) * innerH;
        const vcH = ((d.voiceJoins || 0) / maxVal) * innerH;
        const base = padT + innerH;
        const msgX = cx - barW - gap / 2;
        const vcX = cx + gap / 2;
        return `
            <g>
                <title>${escapeHtml(d.label)} (${escapeHtml(d.date)}): ${d.messages} messages, ${d.voiceJoins} voice</title>
                <rect x="${msgX.toFixed(1)}" y="${(base - msgH).toFixed(1)}" width="${barW}" height="${Math.max(msgH, d.messages > 0 ? 3 : 0).toFixed(1)}" rx="4" fill="#5865F2" opacity="0.9" />
                <rect x="${vcX.toFixed(1)}" y="${(base - vcH).toFixed(1)}" width="${barW}" height="${Math.max(vcH, d.voiceJoins > 0 ? 3 : 0).toFixed(1)}" rx="4" fill="#34D399" opacity="0.9" />
                <text x="${cx.toFixed(1)}" y="${H - 6}" text-anchor="middle" fill="#94a3b8" font-size="11">${escapeHtml(d.label)}</text>
            </g>
        `;
    }).join('');

    return `
        <svg viewBox="0 0 ${W} ${H}" class="w-full h-auto block select-none">
            <line x1="${padL}" y1="${padT + innerH}" x2="${W - padR}" y2="${padT + innerH}" stroke="#334155" />
            ${gridLines}
            ${bars}
        </svg>
    `;
}

function buildOverviewTopPlayersHtml(topPlayers) {
    if (!Array.isArray(topPlayers) || topPlayers.length === 0) {
        return `<p class="text-xs text-slate-400 py-8 text-center">No rated players yet.</p>`;
    }

    return topPlayers.map((p, idx) => {
        const rankStyle = idx === 0
            ? 'text-amber-300 bg-amber-500/15 border-amber-500/35'
            : idx === 1
                ? 'text-slate-200 bg-slate-500/15 border-slate-500/35'
                : idx === 2
                    ? 'text-orange-300 bg-orange-500/15 border-orange-500/35'
                    : 'text-slate-400 bg-bg-elevated border-slate-800';
        const deltaHtml = p.weeklyDelta > 0
            ? `<span class="text-[11px] font-semibold text-emerald-400">+${p.weeklyDelta.toLocaleString('en-GB')}</span>`
            : p.weeklyDelta < 0
                ? `<span class="text-[11px] font-semibold text-red-400">${p.weeklyDelta.toLocaleString('en-GB')}</span>`
                : '';

        return `
            <button type="button" data-ov-player="${escapeHtml(p.userId)}" class="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl bg-bg-elevated/60 hover:bg-bg-hover border border-slate-800/80 transition text-left">
                <div class="flex items-center gap-2.5 min-w-0">
                    <span class="w-6 h-6 rounded-lg border text-[11px] font-bold flex items-center justify-center shrink-0 ${rankStyle}">#${idx + 1}</span>
                    <img src="${escapeHtml(p.avatarUrl)}" alt="" class="w-7 h-7 rounded-full object-cover bg-bg-base shrink-0" />
                    <span class="text-sm font-medium text-white truncate">${escapeHtml(p.displayName)}</span>
                </div>
                <div class="flex items-center gap-2 shrink-0">
                    ${deltaHtml}
                    <span class="px-2.5 py-0.5 rounded-full text-xs font-bold border" style="background-color: ${escapeHtml(p.rankColor)}22; border-color: ${escapeHtml(p.rankColor)}66; color: ${escapeHtml(p.rankColor)};">${p.elo.toLocaleString('en-GB')}</span>
                </div>
            </button>
        `;
    }).join('');
}

function buildOverviewRecentLogsHtml(recentLogs) {
    if (!Array.isArray(recentLogs) || recentLogs.length === 0) {
        return `<p class="text-xs text-slate-400 py-8 text-center">No entries.</p>`;
    }

    return recentLogs.map(item => `
        <div class="flex items-center justify-between gap-3 py-2.5 border-t border-slate-800/70 first:border-t-0 text-xs">
            <div class="flex items-center gap-2 min-w-0">
                <span class="px-2 py-0.5 rounded-md bg-bg-elevated border border-slate-700/80 text-[10px] font-semibold text-slate-300 shrink-0">
                    ${escapeHtml(LOG_CATEGORY_LABELS[item.category] || item.category)}
                </span>
                <span class="text-slate-200 truncate">${escapeHtml(item.message)}</span>
            </div>
            <span class="text-slate-500 shrink-0">${escapeHtml(new Date(item.timestamp).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }))}</span>
        </div>
    `).join('');
}

function renderOverview() {
    const container = document.getElementById('section-overview');
    const ov = state.overview;
    if (!ov) return;

    const pingBadge = ov.bot.online ? `${ov.bot.ping} ms` : '—';
    const daily = ov.stats.dailyActivity || [];
    const weekMsgs = daily.reduce((s, d) => s + (d.messages || 0), 0);
    const weekVoice = daily.reduce((s, d) => s + (d.voiceJoins || 0), 0);
    const weekJoins = daily.reduce((s, d) => s + (d.joins || 0), 0);
    const weekLeaves = daily.reduce((s, d) => s + (d.leaves || 0), 0);

    const moduleRows = [
        { key: 'tempvoice', label: 'TempVoice', enabled: ov.modules.tempVoiceEnabled, icon: 'mic', color: 'text-brand' },
        { key: 'patchbot', label: 'PatchBot', enabled: ov.modules.patchBotEnabled, icon: 'newspaper', color: 'text-amber-400' },
        { key: 'joinroles', label: 'Join Roles', enabled: ov.modules.joinRolesEnabled, icon: 'user-plus', color: 'text-emerald-400' },
        { key: 'csstatus', label: 'CS2 Status', enabled: ov.modules.csStatusEnabled, icon: 'activity', color: 'text-sky-400' },
        { key: 'rankfeed', label: 'Rank-Up / Derank', enabled: ov.modules.rankFeedEnabled, icon: 'trending-up', color: 'text-brand-gold' },
        { key: 'adminlog', label: 'Admin Log', enabled: ov.modules.adminLogEnabled, icon: 'shield-check', color: 'text-sky-400' },
        { key: 'welcome', label: 'Welcome', enabled: ov.modules.welcomeEnabled, icon: 'hand', color: 'text-emerald-400' },
        { key: 'tickets', label: 'Tickets', enabled: ov.modules.ticketsEnabled, icon: 'ticket', color: 'text-brand' },
        { key: 'moderation', label: 'Moderation', enabled: ov.modules.moderationEnabled, icon: 'gavel', color: 'text-amber-400' }
    ];

    container.innerHTML = `
        <div class="card p-5 bg-gradient-to-r from-brand/10 via-bg-surface to-bg-surface flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div class="flex items-center gap-4 min-w-0">
                <div class="w-14 h-14 rounded-2xl bg-bg-elevated border border-slate-700/80 overflow-hidden flex items-center justify-center shrink-0">
                    ${ov.guild.iconUrl
                        ? `<img src="${escapeHtml(ov.guild.iconUrl)}" alt="" class="w-full h-full object-cover" />`
                        : `<i data-lucide="server" class="w-6 h-6 text-brand"></i>`}
                </div>
                <div class="min-w-0 space-y-1">
                    <div class="flex items-center gap-2.5 flex-wrap">
                        <h3 class="text-lg font-bold text-white truncate">${escapeHtml(ov.guild.name)}</h3>
                        <span id="ov-bot-status" class="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-0.5 rounded-full ${ov.bot.online ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30' : 'bg-red-500/15 text-red-300 border border-red-500/30'}">
                            <span class="w-1.5 h-1.5 rounded-full ${ov.bot.online ? 'bg-emerald-400' : 'bg-red-400'}"></span>
                            <span>${ov.bot.online ? 'Online' : 'Offline'}</span>
                        </span>
                        ${ov.guild.boostCount > 0 ? `<span class="text-xs font-medium px-2.5 py-0.5 rounded-full bg-fuchsia-500/15 text-fuchsia-300 border border-fuchsia-500/30">Tier ${ov.guild.boostTier} · ${ov.guild.boostCount} ${ov.guild.boostCount === 1 ? 'Boost' : 'Boosts'}</span>` : ''}
                    </div>
                    <div class="flex items-center flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
                        <span>Uptime: <strong id="ov-bot-uptime" class="text-slate-200">${escapeHtml(formatDuration(ov.bot.uptimeMs))}</strong></span>
                        <span>Ping: <strong id="ov-bot-ping" class="text-slate-200">${escapeHtml(pingBadge)}</strong></span>
                    </div>
                </div>
            </div>

            <div class="flex items-center flex-wrap gap-2 text-xs shrink-0">
                <div class="px-3 py-2 rounded-xl bg-bg-elevated/80 border border-slate-800 flex items-center gap-2">
                    <i data-lucide="hash" class="w-3.5 h-3.5 text-slate-400"></i>
                    <span class="text-slate-400">Channels</span>
                    <strong class="text-white">${ov.guild.textChannelsCount || 0}</strong>
                </div>
                <div class="px-3 py-2 rounded-xl bg-bg-elevated/80 border border-slate-800 flex items-center gap-2">
                    <i data-lucide="volume-2" class="w-3.5 h-3.5 text-slate-400"></i>
                    <span class="text-slate-400">Voice</span>
                    <strong class="text-white">${ov.guild.voiceChannelsCount || 0}</strong>
                </div>
                <div class="px-3 py-2 rounded-xl bg-bg-elevated/80 border border-slate-800 flex items-center gap-2">
                    <i data-lucide="tags" class="w-3.5 h-3.5 text-slate-400"></i>
                    <span class="text-slate-400">Roles</span>
                    <strong class="text-white">${ov.guild.rolesCount || 0}</strong>
                </div>
            </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <button type="button" data-jump="players" class="card p-5 text-left hover:border-slate-600/80 transition">
                <div class="flex items-center justify-between text-slate-400 text-xs font-medium uppercase tracking-wider">
                    <span>Members</span>
                    <i data-lucide="users" class="w-4 h-4 text-brand"></i>
                </div>
                <div id="ov-members-count" class="mt-2.5 text-2xl font-bold text-white">${ov.guild.humanCount ?? ov.guild.memberCount}</div>
                <div id="ov-members-sub" class="text-xs text-slate-400 mt-1">${ov.guild.botCount ? `${ov.guild.botCount} bots` : `Total ${ov.guild.memberCount}`}</div>
            </button>

            <button type="button" data-jump="tempvoice" class="card p-5 text-left hover:border-slate-600/80 transition">
                <div class="flex items-center justify-between text-slate-400 text-xs font-medium uppercase tracking-wider">
                    <span>In voice</span>
                    <i data-lucide="headphones" class="w-4 h-4 text-emerald-400"></i>
                </div>
                <div id="ov-voice-count" class="mt-2.5 text-2xl font-bold text-white">${ov.stats.inVoiceCount || 0}</div>
                <div id="ov-tv-count" class="text-xs text-slate-400 mt-1">TempVoice: ${ov.stats.activeTempRoomsCount}</div>
            </button>

            <button type="button" data-jump="players" class="card p-5 text-left hover:border-slate-600/80 transition">
                <div class="flex items-center justify-between text-slate-400 text-xs font-medium uppercase tracking-wider">
                    <span>Linked players</span>
                    <i data-lucide="trophy" class="w-4 h-4 text-brand-gold"></i>
                </div>
                <div id="ov-linked-count" class="mt-2.5 text-2xl font-bold text-white">${ov.stats.linkedPlayersCount}</div>
                <div id="ov-avg-elo" class="text-xs text-slate-400 mt-1">${typeof ov.stats.avgElo === 'number' ? `Avg ${ov.stats.avgElo.toLocaleString('en-GB')} Elo` : 'No Elo'}</div>
            </button>

            <button type="button" data-jump="tickets" class="card p-5 text-left hover:border-slate-600/80 transition">
                <div class="flex items-center justify-between text-slate-400 text-xs font-medium uppercase tracking-wider">
                    <span>Open tickets</span>
                    <i data-lucide="ticket" class="w-4 h-4 text-sky-400"></i>
                </div>
                <div id="ov-tickets-count" class="mt-2.5 text-2xl font-bold text-white">${ov.stats.openTicketsCount || 0}</div>
                <div id="ov-mod-sub" class="text-xs text-slate-400 mt-1">Warnings: ${ov.stats.totalWarningsCount || 0} · Timeout: ${ov.stats.timedOutCount || 0}</div>
            </button>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-12 gap-5">
            <div class="card p-6 lg:col-span-7 space-y-4">
                <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <h3 class="text-base font-semibold text-white flex items-center gap-2">
                        <i data-lucide="bar-chart-3" class="w-4 h-4 text-brand"></i>
                        <span>7-day activity</span>
                    </h3>
                    <div id="ov-activity-totals" class="flex items-center flex-wrap gap-3 text-xs text-slate-400">
                        <span class="inline-flex items-center gap-1.5"><span class="w-2 h-2 rounded-full bg-brand"></span>Messages: <strong class="text-slate-200">${weekMsgs}</strong></span>
                        <span class="inline-flex items-center gap-1.5"><span class="w-2 h-2 rounded-full bg-emerald-400"></span>Voice: <strong class="text-slate-200">${weekVoice}</strong></span>
                        <span><strong class="text-emerald-400">+${weekJoins}</strong> / <strong class="text-red-400">-${weekLeaves}</strong></span>
                    </div>
                </div>
                <div id="ov-activity-chart">
                    ${buildOverviewActivityChartSvg(daily)}
                </div>
            </div>

            <div class="card p-6 lg:col-span-5 space-y-4">
                <div class="flex items-center justify-between gap-2">
                    <h3 class="text-base font-semibold text-white flex items-center gap-2">
                        <i data-lucide="trophy" class="w-4 h-4 text-brand-gold"></i>
                        <span>Top CS2 players</span>
                    </h3>
                    <button type="button" data-jump="players" class="text-xs font-medium text-sky-400 hover:underline">View all</button>
                </div>
                <div id="ov-top-players" class="space-y-2">
                    ${buildOverviewTopPlayersHtml(ov.stats.topPlayers)}
                </div>
            </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-12 gap-5">
            <div class="card p-6 lg:col-span-7 space-y-4">
                <h3 class="text-base font-semibold text-white flex items-center gap-2">
                    <i data-lucide="layers" class="w-4 h-4 text-brand"></i>
                    <span>Modules</span>
                </h3>
                <div class="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    ${moduleRows.map(m => `
                        <button type="button" data-jump="${m.key}" class="flex items-center justify-between gap-2 px-3.5 py-3 rounded-xl bg-bg-elevated hover:bg-bg-hover border border-slate-800 transition text-left">
                            <span class="flex items-center gap-2 min-w-0">
                                <i data-lucide="${m.icon}" class="w-4 h-4 ${m.color} shrink-0"></i>
                                <span class="text-xs font-medium text-slate-200 truncate">${escapeHtml(m.label)}</span>
                            </span>
                            <span data-module-badge="${m.key}" class="w-2 h-2 rounded-full shrink-0 ${m.enabled ? 'bg-emerald-400' : 'bg-slate-600'}" title="${m.enabled ? 'Active' : 'Disabled'}"></span>
                        </button>
                    `).join('')}
                </div>
            </div>

            <div class="card p-6 lg:col-span-5 space-y-3">
                <div class="flex items-center justify-between gap-2">
                    <h3 class="text-base font-semibold text-white flex items-center gap-2">
                        <i data-lucide="scroll-text" class="w-4 h-4 text-sky-400"></i>
                        <span>Recent activity</span>
                    </h3>
                    <button type="button" data-jump="logs" class="text-xs font-medium text-sky-400 hover:underline">View all</button>
                </div>
                <div id="ov-recent-logs">
                    ${buildOverviewRecentLogsHtml(ov.stats.recentLogs)}
                </div>
            </div>
        </div>
    `;

    container.querySelectorAll('[data-jump]').forEach(btn => {
        btn.addEventListener('click', () => switchSection(btn.dataset.jump));
    });

    container.querySelectorAll('[data-ov-player]').forEach(btn => {
        btn.addEventListener('click', () => openPlayerDetailModal(btn.dataset.ovPlayer, 'cs2'));
    });

    refreshIcons();
}

function openBackupModal() {
    const modal = document.getElementById('backup-modal');
    const closeBtn = document.getElementById('backup-modal-close');
    if (!modal) return;

    modal.classList.remove('hidden');
    refreshIcons();

    function close() {
        modal.classList.add('hidden');
        closeBtn?.removeEventListener('click', close);
        modal.removeEventListener('click', onBackdrop);
        modal.querySelectorAll('[data-backup-option]').forEach(link => {
            link.removeEventListener('click', onOptionClick);
        });
    }
    function onBackdrop(e) {
        if (e.target === modal) close();
    }
    function onOptionClick() {
        setTimeout(close, 120);
    }

    closeBtn?.addEventListener('click', close);
    modal.addEventListener('click', onBackdrop);
    modal.querySelectorAll('[data-backup-option]').forEach(link => {
        link.addEventListener('click', onOptionClick);
    });
}

function buildEloChartSvg(history, accentColor = '#5865F2') {
    const W = 580;
    const H = 200;
    const padL = 52;
    const padR = 18;
    const padT = 18;
    const padB = 28;
    const innerW = W - padL - padR;
    const innerH = H - padT - padB;

    const elos = history.map(h => h.elo);
    let minElo = Math.min(...elos);
    let maxElo = Math.max(...elos);
    const span = maxElo - minElo;
    const padRange = Math.max(250, Math.round(span * 0.2));
    minElo = Math.max(0, Math.floor((minElo - padRange) / 100) * 100);
    maxElo = Math.ceil((maxElo + padRange) / 100) * 100;
    if (maxElo === minElo) maxElo = minElo + 500;

    const pts = history.map((pt, i) => {
        const x = history.length === 1
            ? padL + innerW / 2
            : padL + (i / (history.length - 1)) * innerW;
        const y = padT + (1 - (pt.elo - minElo) / (maxElo - minElo)) * innerH;
        return { x, y, elo: pt.elo, timestamp: pt.timestamp };
    });

    const polyPoints = pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
    const areaPoints = `${pts[0].x.toFixed(1)},${(padT + innerH).toFixed(1)} ${polyPoints} ${pts[pts.length - 1].x.toFixed(1)},${(padT + innerH).toFixed(1)}`;

    const yTicks = [0, 0.5, 1].map(t => {
        const val = Math.round(minElo + t * (maxElo - minElo));
        const y = padT + (1 - t) * innerH;
        return { val, y };
    });

    const firstDate = new Date(history[0].timestamp).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit' });
    const lastDate = new Date(history[history.length - 1].timestamp).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit' });
    const strokeColor = accentColor && accentColor !== '#808080' ? accentColor : '#5865F2';

    return `
        <svg viewBox="0 0 ${W} ${H}" class="w-full h-48 overflow-visible select-none">
            <defs>
                <linearGradient id="eloAreaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="${escapeHtml(strokeColor)}" stop-opacity="0.35" />
                    <stop offset="100%" stop-color="${escapeHtml(strokeColor)}" stop-opacity="0.02" />
                </linearGradient>
            </defs>
            ${yTicks.map(t => `
                <line x1="${padL}" y1="${t.y.toFixed(1)}" x2="${W - padR}" y2="${t.y.toFixed(1)}" stroke="#334155" stroke-dasharray="3 3" stroke-width="1" />
                <text x="${padL - 8}" y="${(t.y + 4).toFixed(1)}" text-anchor="end" fill="#94a3b8" font-size="11">${t.val.toLocaleString('en-GB')}</text>
            `).join('')}
            ${pts.length > 1 ? `<polygon points="${areaPoints}" fill="url(#eloAreaGrad)" />` : ''}
            ${pts.length > 1 ? `<polyline fill="none" stroke="${escapeHtml(strokeColor)}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" points="${polyPoints}" />` : ''}
            ${pts.map(p => `
                <circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="4" fill="#0f172a" stroke="${escapeHtml(strokeColor)}" stroke-width="2.2">
                    <title>${p.elo.toLocaleString('en-GB')} Elo (${new Date(p.timestamp).toLocaleString('en-GB')})</title>
                </circle>
            `).join('')}
            <text x="${padL}" y="${H - 6}" text-anchor="start" fill="#64748b" font-size="11">${escapeHtml(firstDate)}</text>
            <text x="${W - padR}" y="${H - 6}" text-anchor="end" fill="#64748b" font-size="11">${escapeHtml(lastDate)}</text>
        </svg>
    `;
}

function renderPlayersTableRows() {
    const q = state.playerSearch.trim().toLowerCase();
    const list = state.players.filter(p => {
        if (state.playerFilter === 'voice' && !p.voice) return false;
        if (state.playerFilter === 'linked' && !p.isLinked) return false;
        if (state.playerFilter === 'timeout' && !p.isTimedOut) return false;
        if (state.playerFilter === 'warned' && !(p.warningsCount > 0)) return false;

        if (!q) return true;
        return (
            p.displayName.toLowerCase().includes(q)
            || p.username.toLowerCase().includes(q)
            || p.userId.includes(q)
            || (p.steamId && p.steamId.includes(q))
            || (p.roles || []).some(r => r.name.toLowerCase().includes(q))
        );
    });

    if (list.length === 0) {
        return `<tr><td colspan="6" class="px-4 py-8 text-center text-sm text-slate-400">No players match this filter.</td></tr>`;
    }

    return list.map(p => {
        const roles = Array.isArray(p.roles) ? p.roles : [];
        const visibleRoles = roles.slice(0, 3);
        const extraRoles = roles.length - visibleRoles.length;
        const rolesHtml = roles.length === 0
            ? `<span class="text-xs text-slate-500">—</span>`
            : `<div class="flex flex-wrap items-center gap-1">${visibleRoles.map(r => `
                <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border border-slate-700/80 bg-bg-elevated text-slate-200 max-w-[130px] truncate">
                    <span class="w-1.5 h-1.5 rounded-full shrink-0" style="background-color: ${escapeHtml(r.colorHex)}"></span>
                    <span class="truncate">${escapeHtml(r.name)}</span>
                </span>`).join('')}${extraRoles > 0 ? `<span class="px-1.5 py-0.5 rounded-full text-[11px] text-slate-400 bg-bg-elevated border border-slate-800">+${extraRoles}</span>` : ''}</div>`;

        let activityHtml = `<span class="text-xs text-slate-500">—</span>`;
        if (p.voice) {
            const voiceFlags = [
                (p.voice.selfMute || p.voice.serverMute) ? `<i data-lucide="mic-off" class="w-3 h-3 shrink-0"></i>` : '',
                p.voice.streaming ? `<i data-lucide="monitor" class="w-3 h-3 shrink-0"></i>` : ''
            ].filter(Boolean).join('');
            activityHtml = `
                <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 max-w-[180px]">
                    <i data-lucide="volume-2" class="w-3.5 h-3.5 shrink-0"></i>
                    <span class="truncate">${escapeHtml(p.voice.channelName)}</span>
                    ${voiceFlags ? `<span class="inline-flex items-center gap-1">${voiceFlags}</span>` : ''}
                </span>
            `;
        } else if (p.lastSeenAt) {
            const seenStr = new Date(p.lastSeenAt).toLocaleString('en-GB', {
                day: '2-digit',
                month: '2-digit',
                hour: '2-digit',
                minute: '2-digit'
            });
            activityHtml = `<span class="text-xs text-slate-400 whitespace-nowrap">${escapeHtml(seenStr)}</span>`;
        }

        const eloBadge = !p.isLinked
            ? `<span class="text-xs text-slate-500">—</span>`
            : (typeof p.elo === 'number'
                ? `<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border" style="background-color: ${escapeHtml(p.rankColor)}22; border-color: ${escapeHtml(p.rankColor)}66; color: ${escapeHtml(p.rankColor)};">${p.elo.toLocaleString('en-GB')}</span>`
                : `<span class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-slate-800 text-slate-400 border border-slate-700">Unranked</span>`);

        const deltaPill = p.isLinked && p.weeklyDelta > 0
            ? `<span class="ml-1.5 text-[11px] font-semibold text-emerald-400">+${p.weeklyDelta.toLocaleString('en-GB')}</span>`
            : p.isLinked && p.weeklyDelta < 0
                ? `<span class="ml-1.5 text-[11px] font-semibold text-red-400">${p.weeklyDelta.toLocaleString('en-GB')}</span>`
                : '';

        const warnBadge = p.warningsCount > 0
            ? (p.isOwner
                ? `<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/35">${p.warningsCount}</span>`
                : `<button type="button" data-player-mod="${escapeHtml(p.userId)}" class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/35 transition">${p.warningsCount}</button>`)
            : `<span class="text-xs text-slate-500">0</span>`;

        const timeoutBadge = p.isTimedOut
            ? `<span class="ml-1.5 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-red-500/15 text-red-300 border border-red-500/30"><i data-lucide="volume-x" class="w-3 h-3"></i><span>Timeout</span></span>`
            : '';

        const ticketBadge = Array.isArray(p.openTickets) && p.openTickets.length > 0
            ? `<span class="ml-1.5 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-sky-500/15 text-sky-300 border border-sky-500/30"><i data-lucide="ticket" class="w-3 h-3"></i><span>#${String(p.openTickets[0].number).padStart(3, '0')}${p.openTickets.length > 1 ? ` +${p.openTickets.length - 1}` : ''}</span></span>`
            : '';

        return `
            <tr class="border-t border-slate-800/80 hover:bg-bg-elevated/50 transition">
                <td class="px-4 py-3">
                    <div class="flex items-center gap-3">
                        <img src="${escapeHtml(p.avatarUrl)}" alt="" class="w-9 h-9 rounded-full object-cover bg-bg-elevated shrink-0" />
                        <div class="min-w-0">
                            <div class="text-sm font-semibold text-white truncate flex items-center flex-wrap">${escapeHtml(p.displayName)}${timeoutBadge}${ticketBadge}</div>
                            <div class="text-xs text-slate-400 truncate">@${escapeHtml(p.username)}${p.inGuild ? '' : ' · left server'}</div>
                        </div>
                    </div>
                </td>
                <td class="px-4 py-3">${rolesHtml}</td>
                <td class="px-4 py-3">${activityHtml}</td>
                <td class="px-4 py-3 whitespace-nowrap">${eloBadge}${deltaPill}</td>
                <td class="px-4 py-3 whitespace-nowrap">${warnBadge}</td>
                <td class="px-4 py-3 text-right">
                    <div class="inline-flex items-center gap-2 justify-end">
                        <button type="button" data-player-detail="${escapeHtml(p.userId)}" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-bg-elevated hover:bg-bg-hover border border-slate-700 text-xs font-medium text-sky-300 transition">
                            <i data-lucide="user" class="w-3.5 h-3.5"></i>
                            <span>Detail</span>
                        </button>
                        ${p.isOwner ? '' : `
                            <button type="button" data-player-mod="${escapeHtml(p.userId)}" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-bg-elevated hover:bg-bg-hover border border-slate-700 text-xs font-medium text-amber-300 transition">
                                <i data-lucide="gavel" class="w-3.5 h-3.5"></i>
                                <span>Moderation</span>
                            </button>
                        `}
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

async function openPlayerDetailModal(userId, activeTab = 'overview') {
    const modal = document.getElementById('player-detail-modal');
    const avatarEl = document.getElementById('pdet-avatar');
    const nameEl = document.getElementById('pdet-name');
    const subEl = document.getElementById('pdet-sub');
    const tabsEl = document.getElementById('pdet-tabs');
    const bodyEl = document.getElementById('pdet-body');
    const closeBtn = document.getElementById('pdet-close');
    const modBtn = document.getElementById('pdet-mod-btn');
    if (!modal) return;

    function close() {
        modal.classList.add('hidden');
        closeBtn?.removeEventListener('click', close);
        modal.removeEventListener('click', onBackdrop);
        if (modBtn) modBtn.onclick = null;
    }
    function onBackdrop(e) {
        if (e.target === modal) close();
    }

    closeBtn?.removeEventListener('click', close);
    modal.removeEventListener('click', onBackdrop);
    closeBtn?.addEventListener('click', close);
    modal.addEventListener('click', onBackdrop);
    if (modBtn) {
        modBtn.classList.add('hidden');
        modBtn.onclick = null;
    }

    const cached = (state.players || []).find(p => p.userId === userId);
    if (cached) {
        avatarEl.src = cached.avatarUrl;
        nameEl.textContent = cached.displayName;
        subEl.textContent = `@${cached.username} · ${cached.userId}`;
    }
    tabsEl.innerHTML = '';
    bodyEl.innerHTML = `<div class="py-10 text-center text-sm text-slate-400">Loading...</div>`;
    modal.classList.remove('hidden');

    let detail;
    try {
        detail = await apiFetch(`/api/players/${encodeURIComponent(userId)}/detail`);
    } catch (err) {
        bodyEl.innerHTML = `<div class="p-4 rounded-xl bg-red-500/15 border border-red-500/30 text-sm text-red-300">${escapeHtml(err.message)}</div>`;
        return;
    }

    const p = detail.player;
    const acc = detail.account || {};
    const act = detail.activity || {};
    const roles = detail.roles || [];
    const tickets = detail.openTickets || [];
    const cs2 = detail.cs2 || {};
    const timeline = detail.timeline || [];

    avatarEl.src = p.avatarUrl;
    nameEl.textContent = p.displayName;
    subEl.textContent = `@${p.username} · ${p.userId}${p.inGuild ? '' : ' · left server'}`;

    if (modBtn) {
        if (p.isOwner) {
            modBtn.classList.add('hidden');
            modBtn.onclick = null;
        } else {
            modBtn.classList.remove('hidden');
            modBtn.onclick = () => {
                close();
                openPlayerModModal(userId);
            };
        }
    }

    const tabs = [
        { id: 'overview', label: 'Overview' },
        { id: 'roles', label: `Roles (${roles.length})` },
        { id: 'cs2', label: 'CS2' },
        { id: 'timeline', label: 'Timeline' }
    ];

    function renderTabs() {
        tabsEl.innerHTML = tabs.map(t => `
            <button type="button" data-pdet-tab="${t.id}" class="px-3.5 py-1.5 rounded-xl text-xs font-semibold border transition ${activeTab === t.id ? 'bg-brand text-white border-brand' : 'bg-bg-elevated hover:bg-bg-hover text-slate-300 border-slate-700'}">
                ${escapeHtml(t.label)}
            </button>
        `).join('');

        tabsEl.querySelectorAll('[data-pdet-tab]').forEach(btn => {
            btn.addEventListener('click', () => {
                activeTab = btn.dataset.pdetTab;
                renderTabs();
                renderTabBody();
            });
        });
    }

    function renderTabBody() {
        if (activeTab === 'overview') {
            const voiceChannels = state.meta?.voiceChannels || [];
            const fmtDate = ms => (ms ? new Date(ms).toLocaleString('en-GB') : '—');
            const voiceHistory = Array.isArray(act.voiceHistory) ? act.voiceHistory : [];

            bodyEl.innerHTML = `
                <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div class="p-3 rounded-xl bg-bg-elevated border border-slate-800">
                        <div class="text-[11px] uppercase tracking-wider text-slate-400">Created</div>
                        <div class="text-xs font-semibold text-white mt-1">${escapeHtml(fmtDate(acc.createdAt))}</div>
                    </div>
                    <div class="p-3 rounded-xl bg-bg-elevated border border-slate-800">
                        <div class="text-[11px] uppercase tracking-wider text-slate-400">Joined</div>
                        <div class="text-xs font-semibold text-white mt-1">${escapeHtml(fmtDate(acc.joinedAt))}</div>
                    </div>
                    <div class="p-3 rounded-xl bg-bg-elevated border border-slate-800">
                        <div class="text-[11px] uppercase tracking-wider text-slate-400">Messages</div>
                        <div class="text-sm font-bold text-white mt-1">${Number(act.messagesTotal || 0).toLocaleString('en-GB')}</div>
                    </div>
                    <div class="p-3 rounded-xl bg-bg-elevated border border-slate-800">
                        <div class="text-[11px] uppercase tracking-wider text-slate-400">Warnings</div>
                        <div class="text-sm font-bold ${detail.warnings?.length ? 'text-amber-300' : 'text-white'} mt-1">${detail.warnings?.length || 0}</div>
                    </div>
                </div>

                ${p.inGuild && acc.canManageNick ? `
                    <form id="pdet-nick-form" class="p-4 rounded-2xl bg-bg-elevated/60 border border-slate-800 flex flex-col sm:flex-row sm:items-end gap-3">
                        <div class="flex-1 space-y-1.5">
                            <label class="text-xs font-medium text-slate-400">Nickname</label>
                            <input id="pdet-nick-input" type="text" maxlength="32" placeholder="${escapeHtml(p.username)}" class="input-field" value="${escapeHtml(acc.nickname || '')}" />
                        </div>
                        <button type="submit" class="px-4 py-2.5 rounded-xl bg-brand hover:bg-brand-hover text-white text-xs font-semibold transition shrink-0">
                            Save
                        </button>
                    </form>
                ` : ''}

                <div class="p-4 rounded-2xl bg-bg-elevated/60 border border-slate-800 space-y-3">
                    <div class="flex items-center justify-between gap-3 flex-wrap">
                        <div class="text-sm font-semibold text-white">Voice & activity</div>
                        ${detail.voice ? `
                            <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                                <i data-lucide="volume-2" class="w-3.5 h-3.5"></i>
                                <span>${escapeHtml(detail.voice.channelName)}</span>
                            </span>
                        ` : `<span class="text-xs text-slate-400">Not in voice</span>`}
                    </div>

                    ${detail.voice && acc.canMoveVoice ? `
                        <div class="flex flex-wrap items-center gap-2 pt-1">
                            <select id="pdet-move-vc" class="input-field flex-1 min-w-[180px] text-xs">
                                ${voiceChannels.map(vc => `<option value="${escapeHtml(vc.id)}" ${vc.id === detail.voice.channelId ? 'selected' : ''}>🔊 ${escapeHtml(vc.name)}</option>`).join('')}
                            </select>
                            <button id="pdet-move-btn" type="button" class="px-3.5 py-2 rounded-xl bg-bg-surface hover:bg-bg-hover border border-slate-700 text-xs font-medium text-slate-200 transition">
                                Move
                            </button>
                            <button id="pdet-disconnect-btn" type="button" class="px-3.5 py-2 rounded-xl bg-red-500/15 hover:bg-red-500/25 border border-red-500/30 text-xs font-medium text-red-300 transition">
                                Disconnect
                            </button>
                        </div>
                    ` : ''}

                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs pt-1">
                        <div class="p-3 rounded-xl bg-bg-base/50 border border-slate-800/80">
                            <div class="text-slate-400">Last message</div>
                            <div class="text-slate-200 font-medium mt-0.5">${escapeHtml(fmtDate(act.lastMessageAt))}${act.lastMessageChannelName ? ` · #${escapeHtml(act.lastMessageChannelName)}` : ''}</div>
                        </div>
                        <div class="p-3 rounded-xl bg-bg-base/50 border border-slate-800/80">
                            <div class="text-slate-400">Last voice</div>
                            <div class="text-slate-200 font-medium mt-0.5">${escapeHtml(fmtDate(act.lastVoiceAt))}${act.lastVoiceChannelName ? ` · ${escapeHtml(act.lastVoiceChannelName)}` : ''}</div>
                        </div>
                    </div>

                    ${voiceHistory.length > 0 ? `
                        <div class="space-y-1.5 pt-1">
                            <div class="text-xs font-medium text-slate-400">Voice history</div>
                            <div class="rounded-xl border border-slate-800 divide-y divide-slate-800/75 max-h-40 overflow-y-auto bg-bg-base/40">
                                ${voiceHistory.slice(0, 10).map(v => {
                                    const iconHtml = v.type === 'join'
                                        ? `<i data-lucide="log-in" class="w-3.5 h-3.5 text-emerald-400 shrink-0"></i>`
                                        : v.type === 'leave'
                                            ? `<i data-lucide="log-out" class="w-3.5 h-3.5 text-red-400 shrink-0"></i>`
                                            : `<i data-lucide="arrow-right-left" class="w-3.5 h-3.5 text-sky-400 shrink-0"></i>`;
                                    return `
                                        <div class="flex items-center justify-between gap-3 px-3 py-2 text-xs">
                                            <span class="text-slate-200 truncate inline-flex items-center gap-2 min-w-0">${iconHtml}<span class="truncate">${escapeHtml(v.channelName)}</span></span>
                                            <span class="text-slate-400 shrink-0">${escapeHtml(new Date(v.timestamp).toLocaleString('en-GB'))}</span>
                                        </div>
                                    `;
                                }).join('')}
                            </div>
                        </div>
                    ` : ''}
                </div>

                ${tickets.length > 0 ? `
                    <div class="p-4 rounded-2xl bg-bg-elevated/60 border border-slate-800 space-y-2.5">
                        <div class="text-sm font-semibold text-white">Open tickets (${tickets.length})</div>
                        <div class="space-y-2">
                            ${tickets.map(t => `
                                <div class="flex items-center justify-between gap-3 p-3 rounded-xl bg-bg-base/50 border border-slate-800/80 text-xs">
                                    <div class="min-w-0">
                                        <div class="font-semibold text-white truncate">#${String(t.number).padStart(3, '0')} · ${escapeHtml(t.subject)}</div>
                                        <div class="text-slate-400 truncate">#${escapeHtml(t.channelName)}${t.claimedByName ? ` · Claimed by: ${escapeHtml(t.claimedByName)}` : ''}</div>
                                    </div>
                                    <button type="button" data-pdet-close-ticket="${escapeHtml(t.channelId)}" class="px-3 py-1.5 rounded-lg bg-red-500/15 hover:bg-red-500/25 border border-red-500/30 text-xs font-medium text-red-300 transition shrink-0">
                                        Close
                                    </button>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                ` : ''}
            `;

            document.getElementById('pdet-nick-form')?.addEventListener('submit', async e => {
                e.preventDefault();
                const nickname = document.getElementById('pdet-nick-input').value.trim();
                const btn = e.currentTarget.querySelector('button[type="submit"]');
                await setButtonLoading(btn, true, '...');
                try {
                    await apiFetch(`/api/players/${encodeURIComponent(userId)}/nickname`, {
                        method: 'PUT',
                        body: JSON.stringify({ nickname })
                    });
                    showToast('Nickname saved.');
                    await refreshOverviewAndPlayers();
                    await openPlayerDetailModal(userId, 'overview');
                } catch (err) {
                    showToast(err.message, 'error');
                    await setButtonLoading(btn, false);
                }
            });

            document.getElementById('pdet-move-btn')?.addEventListener('click', async e => {
                const channelId = document.getElementById('pdet-move-vc').value;
                const btn = e.currentTarget;
                await setButtonLoading(btn, true, '...');
                try {
                    await apiFetch(`/api/players/${encodeURIComponent(userId)}/voice`, {
                        method: 'POST',
                        body: JSON.stringify({ action: 'move', channelId })
                    });
                    showToast('Player moved.');
                    await refreshOverviewAndPlayers();
                    await openPlayerDetailModal(userId, 'overview');
                } catch (err) {
                    showToast(err.message, 'error');
                    await setButtonLoading(btn, false);
                }
            });

            document.getElementById('pdet-disconnect-btn')?.addEventListener('click', async e => {
                const btn = e.currentTarget;
                await setButtonLoading(btn, true, '...');
                try {
                    await apiFetch(`/api/players/${encodeURIComponent(userId)}/voice`, {
                        method: 'POST',
                        body: JSON.stringify({ action: 'disconnect' })
                    });
                    showToast('Player disconnected from voice.');
                    await refreshOverviewAndPlayers();
                    await openPlayerDetailModal(userId, 'overview');
                } catch (err) {
                    showToast(err.message, 'error');
                    await setButtonLoading(btn, false);
                }
            });

            bodyEl.querySelectorAll('[data-pdet-close-ticket]').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const cid = btn.dataset.pdetCloseTicket;
                    const ok = await confirmAction({
                        title: 'Close ticket?',
                        message: 'The ticket will be closed and its channel deleted.',
                        confirmLabel: 'Close'
                    });
                    if (!ok) return;
                    try {
                        await apiFetch(`/api/tickets/${encodeURIComponent(cid)}`, { method: 'DELETE' });
                        showToast('Ticket closed.');
                        await refreshOverviewAndPlayers();
                        await openPlayerDetailModal(userId, 'overview');
                    } catch (err) {
                        showToast(err.message, 'error');
                    }
                });
            });
        } else if (activeTab === 'roles') {
            if (!p.inGuild) {
                bodyEl.innerHTML = `<p class="text-sm text-slate-400 text-center py-6">Player is not on the server.</p>`;
            } else {
                const heldIds = new Set(roles.map(r => r.id));
                const assignableRoles = (state.meta?.roles || []).filter(
                    r => !r.isEveryone && !r.managed && r.editable && !heldIds.has(r.id)
                );

                bodyEl.innerHTML = `
                    <div class="p-4 rounded-2xl bg-bg-elevated/60 border border-slate-800 space-y-3">
                        <div class="text-sm font-semibold text-white">Current roles (${roles.length})</div>
                        ${roles.length === 0 ? `<p class="text-xs text-slate-400">No roles.</p>` : `
                            <div class="flex flex-wrap gap-2">
                                ${roles.map(r => `
                                    <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border border-slate-700 bg-bg-base text-slate-200">
                                        <span class="w-2 h-2 rounded-full" style="background-color: ${escapeHtml(r.colorHex)}"></span>
                                        <span>${escapeHtml(r.name)}</span>
                                        ${r.editable ? `
                                            <button type="button" data-pdet-remove-role="${escapeHtml(r.id)}" title="Remove" class="text-slate-400 hover:text-red-400 transition ml-0.5">
                                                <i data-lucide="x" class="w-3.5 h-3.5"></i>
                                            </button>
                                        ` : ''}
                                    </span>
                                `).join('')}
                            </div>
                        `}
                    </div>

                    <form id="pdet-add-role-form" class="p-4 rounded-2xl bg-bg-elevated/60 border border-slate-800 flex items-end gap-3">
                        <div class="flex-1 space-y-1.5">
                            <label class="text-xs font-medium text-slate-400">Add role</label>
                            <select id="pdet-role-select" class="input-field" ${assignableRoles.length === 0 ? 'disabled' : ''}>
                                <option value="">— Select role —</option>
                                ${assignableRoles.map(r => `<option value="${escapeHtml(r.id)}">${escapeHtml(r.name)}</option>`).join('')}
                            </select>
                        </div>
                        <button type="submit" ${assignableRoles.length === 0 ? 'disabled' : ''} class="px-4 py-2.5 rounded-xl bg-brand hover:bg-brand-hover text-white text-xs font-semibold transition shrink-0">
                            Add
                        </button>
                    </form>
                `;

                bodyEl.querySelectorAll('[data-pdet-remove-role]').forEach(btn => {
                    btn.addEventListener('click', async () => {
                        const roleId = btn.dataset.pdetRemoveRole;
                        try {
                            await apiFetch(`/api/players/${encodeURIComponent(userId)}/roles/${encodeURIComponent(roleId)}`, { method: 'DELETE' });
                            showToast('Role removed.');
                            await refreshOverviewAndPlayers();
                            await openPlayerDetailModal(userId, 'roles');
                        } catch (err) {
                            showToast(err.message, 'error');
                        }
                    });
                });

                document.getElementById('pdet-add-role-form')?.addEventListener('submit', async e => {
                    e.preventDefault();
                    const roleId = document.getElementById('pdet-role-select').value;
                    if (!roleId) return;
                    const btn = e.currentTarget.querySelector('button[type="submit"]');
                    await setButtonLoading(btn, true, '...');
                    try {
                        await apiFetch(`/api/players/${encodeURIComponent(userId)}/roles`, {
                            method: 'POST',
                            body: JSON.stringify({ roleId })
                        });
                        showToast('Role added.');
                        await refreshOverviewAndPlayers();
                        await openPlayerDetailModal(userId, 'roles');
                    } catch (err) {
                        showToast(err.message, 'error');
                        await setButtonLoading(btn, false);
                    }
                });
            }
        } else if (activeTab === 'cs2') {
            if (!cs2.isLinked) {
                bodyEl.innerHTML = p.inGuild ? `
                    <form id="pdet-link-form" class="p-4 rounded-2xl bg-bg-elevated/60 border border-slate-800 space-y-3">
                        <div class="text-sm font-semibold text-white">Link Steam account</div>
                        <div class="flex flex-col sm:flex-row gap-2.5">
                            <input id="pdet-link-profile" type="text" required placeholder="Steam64 ID or URL" class="input-field flex-1" />
                            <button type="submit" class="px-4 py-2.5 rounded-xl bg-brand hover:bg-brand-hover text-white text-xs font-semibold transition shrink-0">
                                Link
                            </button>
                        </div>
                    </form>
                ` : `<p class="text-sm text-slate-400 text-center py-6">Account is not linked.</p>`;

                document.getElementById('pdet-link-form')?.addEventListener('submit', async e => {
                    e.preventDefault();
                    const profile = document.getElementById('pdet-link-profile').value.trim();
                    const btn = e.currentTarget.querySelector('button[type="submit"]');
                    await setButtonLoading(btn, true, 'Linking...');
                    try {
                        const res = await apiFetch('/api/players/link', {
                            method: 'POST',
                            body: JSON.stringify({ userId, profile })
                        });
                        const eloText = typeof res.elo === 'number' ? res.elo.toLocaleString('en-GB') : 'Unranked';
                        showToast(`Account linked (${eloText}).`);
                        await refreshOverviewAndPlayers();
                        await openPlayerDetailModal(userId, 'cs2');
                    } catch (err) {
                        showToast(err.message, 'error');
                        await setButtonLoading(btn, false);
                    }
                });
            } else {
                const history = Array.isArray(cs2.eloHistory) ? cs2.eloHistory : [];
                const deltaText = cs2.weeklyDelta > 0
                    ? `+${cs2.weeklyDelta.toLocaleString('en-GB')}`
                    : cs2.weeklyDelta < 0
                        ? cs2.weeklyDelta.toLocaleString('en-GB')
                        : '0';
                const deltaColor = cs2.weeklyDelta > 0
                    ? 'text-emerald-400'
                    : cs2.weeklyDelta < 0
                        ? 'text-red-400'
                        : 'text-slate-300';
                const minVal = history.length ? Math.min(...history.map(h => h.elo)) : null;
                const maxVal = history.length ? Math.max(...history.map(h => h.elo)) : null;
                const recentRows = [...history].reverse().slice(0, 12);

                bodyEl.innerHTML = `
                    <div class="flex items-center justify-between gap-3 flex-wrap p-4 rounded-xl bg-bg-elevated border border-slate-800">
                        <a href="${escapeHtml(cs2.leetifyUrl)}" target="_blank" rel="noopener noreferrer" class="text-xs font-mono text-sky-400 hover:underline inline-flex items-center gap-1.5">
                            <span>Steam64: ${escapeHtml(cs2.steamId)}</span>
                            <i data-lucide="external-link" class="w-3.5 h-3.5"></i>
                        </a>
                        <button id="pdet-unlink-btn" type="button" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/15 hover:bg-red-500/25 border border-red-500/30 text-xs font-medium text-red-300 transition">
                            <i data-lucide="unlink" class="w-3.5 h-3.5"></i>
                            <span>Unlink</span>
                        </button>
                    </div>

                    <div class="grid grid-cols-3 gap-3">
                        <div class="p-3 rounded-xl bg-bg-elevated border border-slate-800">
                            <div class="text-[11px] uppercase tracking-wider text-slate-400">Current</div>
                            <div class="text-lg font-bold text-white mt-0.5">${typeof cs2.elo === 'number' ? cs2.elo.toLocaleString('en-GB') : 'Unranked'}</div>
                        </div>
                        <div class="p-3 rounded-xl bg-bg-elevated border border-slate-800">
                            <div class="text-[11px] uppercase tracking-wider text-slate-400">7-day change</div>
                            <div class="text-lg font-bold mt-0.5 ${deltaColor}">${escapeHtml(deltaText)}</div>
                        </div>
                        <div class="p-3 rounded-xl bg-bg-elevated border border-slate-800">
                            <div class="text-[11px] uppercase tracking-wider text-slate-400">Min / Max</div>
                            <div class="text-sm font-semibold text-slate-200 mt-1">${minVal !== null ? `${minVal.toLocaleString('en-GB')} / ${maxVal.toLocaleString('en-GB')}` : '—'}</div>
                        </div>
                    </div>

                    ${history.length > 0 ? `
                        <div class="p-4 rounded-2xl bg-bg-elevated/70 border border-slate-800">
                            ${buildEloChartSvg(history, cs2.rankColor)}
                        </div>
                        <div class="rounded-xl border border-slate-800 divide-y divide-slate-800/80 max-h-44 overflow-y-auto bg-bg-base/50">
                            ${recentRows.map((pt, idx) => {
                                const prev = recentRows[idx + 1];
                                const diff = prev ? pt.elo - prev.elo : 0;
                                const diffBadge = diff > 0
                                    ? `<span class="text-xs font-semibold text-emerald-400">+${diff.toLocaleString('en-GB')}</span>`
                                    : diff < 0
                                        ? `<span class="text-xs font-semibold text-red-400">${diff.toLocaleString('en-GB')}</span>`
                                        : `<span class="text-xs text-slate-500">—</span>`;
                                return `
                                    <div class="flex items-center justify-between px-3.5 py-2 text-xs">
                                        <span class="font-semibold text-white">${pt.elo.toLocaleString('en-GB')} Elo</span>
                                        <div class="flex items-center gap-3">
                                            ${diffBadge}
                                            <span class="text-slate-400">${escapeHtml(new Date(pt.timestamp).toLocaleString('en-GB'))}</span>
                                        </div>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    ` : `<p class="text-xs text-slate-400 text-center py-3">No Elo history yet.</p>`}
                `;

                document.getElementById('pdet-unlink-btn')?.addEventListener('click', async () => {
                    const ok = await confirmAction({
                        title: 'Unlink player?',
                        message: `This will unlink ${p.displayName}'s Steam account and remove their CS2 rank role.`,
                        confirmLabel: 'Unlink'
                    });
                    if (!ok) return;
                    try {
                        await apiFetch(`/api/players/${encodeURIComponent(userId)}`, { method: 'DELETE' });
                        showToast(`${p.displayName} unlinked.`);
                        await refreshOverviewAndPlayers();
                        await openPlayerDetailModal(userId, 'cs2');
                    } catch (err) {
                        showToast(err.message, 'error');
                    }
                });
            }
        } else if (activeTab === 'timeline') {
            if (timeline.length === 0) {
                bodyEl.innerHTML = `<p class="text-sm text-slate-400 text-center py-6">No entries.</p>`;
            } else {
                bodyEl.innerHTML = `
                    <div class="rounded-xl border border-slate-800 divide-y divide-slate-800/80 max-h-[420px] overflow-y-auto bg-bg-base/40">
                        ${timeline.map(item => `
                            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-3.5 py-2.5 text-xs">
                                <div class="flex items-start sm:items-center gap-2.5 min-w-0">
                                    <span class="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-bg-elevated border border-slate-700 text-slate-300 shrink-0">
                                        ${escapeHtml(LOG_CATEGORY_LABELS[item.category] || item.category)}
                                    </span>
                                    <span class="text-slate-200 break-words">${escapeHtml(item.message)}</span>
                                </div>
                                <div class="flex items-center gap-2 text-slate-400 shrink-0">
                                    ${item.actor ? `<span class="px-1.5 py-0.5 rounded bg-bg-elevated border border-slate-800 text-slate-300">${escapeHtml(item.actor)}</span>` : ''}
                                    <span>${escapeHtml(new Date(item.timestamp).toLocaleString('en-GB'))}</span>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                `;
            }
        }

        refreshIcons();
    }

    renderTabs();
    renderTabBody();
}

async function openPlayerModModal(userId) {
    const modal = document.getElementById('player-mod-modal');
    const avatarEl = document.getElementById('pmod-avatar');
    const nameEl = document.getElementById('pmod-name');
    const subEl = document.getElementById('pmod-sub');
    const bodyEl = document.getElementById('pmod-body');
    const closeBtn = document.getElementById('pmod-close');
    const detailBtn = document.getElementById('pmod-detail-btn');

    const getPlayer = () => (state.players || []).find(p => p.userId === userId);
    const player = getPlayer();
    if (!modal || !player) return;

    function close() {
        modal.classList.add('hidden');
        closeBtn?.removeEventListener('click', close);
        modal.removeEventListener('click', onBackdrop);
        if (detailBtn) detailBtn.onclick = null;
    }
    function onBackdrop(e) {
        if (e.target === modal) close();
    }

    closeBtn?.removeEventListener('click', close);
    modal.removeEventListener('click', onBackdrop);
    closeBtn?.addEventListener('click', close);
    modal.addEventListener('click', onBackdrop);
    if (detailBtn) {
        detailBtn.onclick = () => {
            close();
            openPlayerDetailModal(userId, 'overview');
        };
    }

    avatarEl.src = player.avatarUrl;
    nameEl.textContent = player.displayName;
    subEl.textContent = `@${player.username} · ${player.userId}`;
    bodyEl.innerHTML = `<div class="py-8 text-center text-sm text-slate-400">Loading...</div>`;
    modal.classList.remove('hidden');

    let warnings = [];
    try {
        const res = await apiFetch(`/api/moderation/warnings/${encodeURIComponent(userId)}`);
        warnings = res.warnings || [];
    } catch (err) {
        bodyEl.innerHTML = `<div class="p-4 rounded-xl bg-red-500/15 border border-red-500/30 text-sm text-red-300">${escapeHtml(err.message)}</div>`;
        return;
    }

    const currentPlayer = getPlayer() || player;
    const isOwnerTarget = Boolean(currentPlayer.isOwner);
    const inGuild = Boolean(currentPlayer.inGuild);

    bodyEl.innerHTML = `
        ${currentPlayer.isTimedOut ? `
            <div class="p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 flex items-center justify-between gap-3">
                <div class="text-xs text-red-200">
                    <strong>Active timeout</strong> until ${escapeHtml(new Date(currentPlayer.timeoutUntil).toLocaleString('en-GB'))}
                </div>
                <button id="pmod-untimeout-btn" type="button" class="px-3 py-1.5 rounded-lg bg-bg-elevated hover:bg-bg-hover border border-slate-700 text-xs font-medium text-white transition">
                    Remove timeout
                </button>
            </div>
        ` : ''}

        <div class="p-4 rounded-2xl bg-bg-elevated/60 border border-slate-800 space-y-3">
            <div class="flex items-center justify-between gap-2">
                <div class="text-sm font-semibold text-white">Warnings (${warnings.length})</div>
                ${warnings.length > 0 ? `
                    <button id="pmod-clear-warns" type="button" class="px-3 py-1 rounded-lg bg-red-500/15 hover:bg-red-500/25 border border-red-500/30 text-xs font-medium text-red-300 transition">
                        Clear all
                    </button>
                ` : ''}
            </div>

            ${warnings.length === 0 ? `
                <p class="text-xs text-slate-400">No warnings.</p>
            ` : `
                <div class="rounded-xl border border-slate-800 divide-y divide-slate-800/80 max-h-52 overflow-y-auto bg-bg-base/50">
                    ${[...warnings].reverse().map(w => `
                        <div class="flex items-start justify-between gap-3 px-3.5 py-2.5 text-xs">
                            <div class="min-w-0 flex-1 space-y-0.5">
                                <div class="text-slate-200 font-medium break-words">
                                    <span class="text-amber-300 font-semibold">#${w.id}</span> ${escapeHtml(w.reason)}
                                </div>
                                <div class="text-slate-400">
                                    ${escapeHtml(w.moderatorTag)} · ${escapeHtml(new Date(w.createdAt).toLocaleString('en-GB'))}
                                </div>
                            </div>
                            <button type="button" data-pmod-del-warn="${w.id}" title="Delete" class="p-1.5 rounded-lg bg-red-500/15 hover:bg-red-500/25 border border-red-500/30 text-red-300 transition shrink-0">
                                <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                            </button>
                        </div>
                    `).join('')}
                </div>
            `}

            ${!isOwnerTarget ? `
                <form id="pmod-warn-form" class="flex items-center gap-2 pt-1">
                    <input id="pmod-warn-reason" type="text" required maxlength="400" placeholder="Warning reason..." class="input-field flex-1" />
                    <button id="pmod-warn-submit" type="submit" class="px-4 py-2.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-200 text-xs font-semibold transition shrink-0">
                        Warn
                    </button>
                </form>
            ` : ''}
        </div>

        ${isOwnerTarget ? `
            <p class="text-xs text-slate-400 text-center">Server owner cannot be moderated.</p>
        ` : `
            <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
                ${inGuild ? `
                    <form id="pmod-timeout-form" class="p-3.5 rounded-xl bg-bg-elevated/60 border border-slate-800 space-y-2.5">
                        <div class="text-xs font-semibold text-white">Timeout</div>
                        <select id="pmod-timeout-duration" class="input-field text-xs">
                            <option value="5">5 min</option>
                            <option value="15">15 min</option>
                            <option value="60" selected>1 h</option>
                            <option value="360">6 h</option>
                            <option value="1440">1 day</option>
                            <option value="10080">7 days</option>
                        </select>
                        <input id="pmod-timeout-reason" type="text" maxlength="400" placeholder="Reason..." class="input-field text-xs" />
                        <button type="submit" class="w-full px-3 py-2 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/35 text-amber-200 text-xs font-semibold transition">
                            Apply timeout
                        </button>
                    </form>

                    <form id="pmod-kick-form" class="p-3.5 rounded-xl bg-bg-elevated/60 border border-slate-800 space-y-2.5 flex flex-col justify-between">
                        <div class="space-y-2.5">
                            <div class="text-xs font-semibold text-white">Kick</div>
                            <input id="pmod-kick-reason" type="text" maxlength="400" placeholder="Reason..." class="input-field text-xs" />
                        </div>
                        <button type="submit" class="w-full px-3 py-2 rounded-lg bg-orange-500/15 hover:bg-orange-500/25 border border-orange-500/35 text-orange-200 text-xs font-semibold transition">
                            Kick
                        </button>
                    </form>
                ` : ''}

                <form id="pmod-ban-form" class="p-3.5 rounded-xl bg-bg-elevated/60 border border-slate-800 space-y-2.5 ${inGuild ? '' : 'md:col-span-3'}">
                    <div class="text-xs font-semibold text-white">Ban</div>
                    <select id="pmod-ban-delete" class="input-field text-xs">
                        <option value="0">Don't delete messages</option>
                        <option value="3600">Delete 1 h</option>
                        <option value="86400">Delete 24 h</option>
                        <option value="604800">Delete 7 days</option>
                    </select>
                    <input id="pmod-ban-reason" type="text" maxlength="400" placeholder="Reason..." class="input-field text-xs" />
                    <button type="submit" class="w-full px-3 py-2 rounded-lg bg-red-500/15 hover:bg-red-500/25 border border-red-500/35 text-red-300 text-xs font-semibold transition">
                        Ban
                    </button>
                </form>
            </div>
        `}
    `;

    refreshIcons();

    document.getElementById('pmod-untimeout-btn')?.addEventListener('click', async e => {
        const btn = e.currentTarget;
        await setButtonLoading(btn, true, '...');
        try {
            await apiFetch('/api/moderation/timeout', {
                method: 'POST',
                body: JSON.stringify({ userId, durationMinutes: 0 })
            });
            showToast('Timeout removed.');
            await refreshOverviewAndPlayers();
            await openPlayerModModal(userId);
        } catch (err) {
            showToast(err.message, 'error');
            await setButtonLoading(btn, false);
        }
    });

    document.getElementById('pmod-clear-warns')?.addEventListener('click', async e => {
        const ok = await confirmAction({
            title: 'Clear all warnings?',
            message: `All warnings for ${currentPlayer.displayName} will be deleted.`,
            confirmLabel: 'Clear'
        });
        if (!ok) return;
        try {
            await apiFetch(`/api/moderation/warnings/${encodeURIComponent(userId)}`, { method: 'DELETE' });
            showToast('Warnings cleared.');
            await refreshOverviewAndPlayers();
            await openPlayerModModal(userId);
        } catch (err) {
            showToast(err.message, 'error');
        }
    });

    bodyEl.querySelectorAll('[data-pmod-del-warn]').forEach(btn => {
        btn.addEventListener('click', async () => {
            const wid = btn.dataset.pmodDelWarn;
            try {
                await apiFetch(`/api/moderation/warnings/${encodeURIComponent(userId)}/${encodeURIComponent(wid)}`, { method: 'DELETE' });
                showToast(`Warning #${wid} deleted.`);
                await refreshOverviewAndPlayers();
                await openPlayerModModal(userId);
            } catch (err) {
                showToast(err.message, 'error');
            }
        });
    });

    document.getElementById('pmod-warn-form')?.addEventListener('submit', async e => {
        e.preventDefault();
        const reason = document.getElementById('pmod-warn-reason').value.trim();
        const btn = document.getElementById('pmod-warn-submit');
        if (!reason) return;
        await setButtonLoading(btn, true, '...');
        try {
            const res = await apiFetch('/api/moderation/warn', {
                method: 'POST',
                body: JSON.stringify({ userId, reason })
            });
            showToast(res.escalation
                ? `Warning #${res.warning.id} issued + auto-escalation (${res.escalation.action}).`
                : `Warning #${res.warning.id} issued.`);
            await refreshOverviewAndPlayers();
            await openPlayerModModal(userId);
        } catch (err) {
            showToast(err.message, 'error');
            await setButtonLoading(btn, false);
        }
    });

    document.getElementById('pmod-timeout-form')?.addEventListener('submit', async e => {
        e.preventDefault();
        const durationMinutes = Number(document.getElementById('pmod-timeout-duration').value);
        const reason = document.getElementById('pmod-timeout-reason').value.trim();
        const btn = e.currentTarget.querySelector('button[type="submit"]');
        await setButtonLoading(btn, true, '...');
        try {
            const res = await apiFetch('/api/moderation/timeout', {
                method: 'POST',
                body: JSON.stringify({ userId, durationMinutes, reason })
            });
            showToast(`Timeout applied (${res.durationLabel}).`);
            await refreshOverviewAndPlayers();
            await openPlayerModModal(userId);
        } catch (err) {
            showToast(err.message, 'error');
            await setButtonLoading(btn, false);
        }
    });

    document.getElementById('pmod-kick-form')?.addEventListener('submit', async e => {
        e.preventDefault();
        const reason = document.getElementById('pmod-kick-reason').value.trim();
        const ok = await confirmAction({
            title: 'Kick player?',
            message: `${currentPlayer.displayName} will be kicked from the server.`,
            confirmLabel: 'Kick'
        });
        if (!ok) return;
        try {
            await apiFetch('/api/moderation/kick', {
                method: 'POST',
                body: JSON.stringify({ userId, reason })
            });
            showToast(`${currentPlayer.displayName} kicked.`);
            close();
            await refreshOverviewAndPlayers();
        } catch (err) {
            showToast(err.message, 'error');
        }
    });

    document.getElementById('pmod-ban-form')?.addEventListener('submit', async e => {
        e.preventDefault();
        const reason = document.getElementById('pmod-ban-reason').value.trim();
        const deleteMessageSeconds = Number(document.getElementById('pmod-ban-delete').value);
        const ok = await confirmAction({
            title: 'Ban player?',
            message: `${currentPlayer.displayName} will be banned from the server.`,
            confirmLabel: 'Ban'
        });
        if (!ok) return;
        try {
            await apiFetch('/api/moderation/ban', {
                method: 'POST',
                body: JSON.stringify({ userId, reason, deleteMessageSeconds })
            });
            showToast(`${currentPlayer.displayName} banned.`);
            close();
            await refreshOverviewAndPlayers();
        } catch (err) {
            showToast(err.message, 'error');
        }
    });
}

function attachPlayerTableListeners() {
    const tbody = document.getElementById('players-tbody');
    if (!tbody) return;

    tbody.querySelectorAll('[data-player-detail]').forEach(btn => {
        btn.addEventListener('click', () => {
            openPlayerDetailModal(btn.dataset.playerDetail, 'overview');
        });
    });

    tbody.querySelectorAll('[data-player-mod]').forEach(btn => {
        btn.addEventListener('click', () => {
            openPlayerModModal(btn.dataset.playerMod);
        });
    });
}

function renderPlayers() {
    const container = document.getElementById('section-players');
    const climber = state.overview?.stats?.topClimber;
    const filters = [
        { id: 'all', label: 'All' },
        { id: 'voice', label: 'In voice' },
        { id: 'linked', label: 'Linked' },
        { id: 'timeout', label: 'Timed out' },
        { id: 'warned', label: 'Warned' }
    ];

    container.innerHTML = `
        ${climber ? `
            <button id="players-climber-btn" type="button" ${climber.userId ? `data-climber-id="${escapeHtml(climber.userId)}"` : ''} class="w-full text-left card p-4 bg-gradient-to-r from-emerald-500/10 via-bg-surface to-bg-surface border-emerald-500/30 hover:border-emerald-400/50 flex items-center justify-between gap-4 transition">
                <div class="flex items-center gap-3 min-w-0">
                    <div class="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                        <i data-lucide="trending-up" class="w-5 h-5"></i>
                    </div>
                    <div class="min-w-0">
                        <div class="text-xs uppercase tracking-wider font-semibold text-emerald-400">Weekly climber</div>
                        <div class="text-sm font-bold text-white truncate">${escapeHtml(climber.displayName)} <span class="text-emerald-300 font-semibold">· +${climber.delta.toLocaleString('en-GB')} Elo in 7 days</span></div>
                    </div>
                </div>
                ${typeof climber.elo === 'number' ? `<span class="px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-xs font-bold text-emerald-200 shrink-0">${climber.elo.toLocaleString('en-GB')} Elo</span>` : ''}
            </button>
        ` : ''}

        <div class="card overflow-hidden">
            <div class="p-5 border-b border-slate-800/90 space-y-3">
                <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <h3 id="players-count-heading" class="text-base font-semibold text-white flex items-center gap-2">
                        <i data-lucide="users" class="w-4 h-4 text-brand"></i>
                        <span>Players (${state.players.length})</span>
                    </h3>
                    <div class="flex items-center gap-2">
                        <input id="players-search" type="text" placeholder="Search..." class="input-field sm:w-64" value="${escapeHtml(state.playerSearch)}" />
                        <button id="players-refresh-btn" type="button" class="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-bg-elevated hover:bg-bg-hover border border-slate-700 text-xs font-medium text-slate-200 transition shrink-0">
                            <i data-lucide="refresh-cw" class="w-3.5 h-3.5"></i>
                            <span>Refresh</span>
                        </button>
                    </div>
                </div>
                <div class="flex flex-wrap gap-2">
                    ${filters.map(f => `
                        <button type="button" data-player-filter="${f.id}" class="px-3 py-1.5 rounded-xl text-xs font-medium border transition ${state.playerFilter === f.id ? 'bg-brand text-white border-brand' : 'bg-bg-elevated hover:bg-bg-hover text-slate-300 border-slate-700'}">
                            ${escapeHtml(f.label)}
                        </button>
                    `).join('')}
                </div>
            </div>

            <div class="overflow-x-auto">
                <table class="w-full text-left border-collapse">
                    <thead>
                        <tr class="bg-bg-elevated/60 text-xs uppercase tracking-wider text-slate-400">
                            <th class="px-4 py-3 font-medium">Player</th>
                            <th class="px-4 py-3 font-medium">Roles</th>
                            <th class="px-4 py-3 font-medium">Activity</th>
                            <th class="px-4 py-3 font-medium">Elo</th>
                            <th class="px-4 py-3 font-medium">Warnings</th>
                            <th class="px-4 py-3 font-medium text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody id="players-tbody">
                        ${renderPlayersTableRows()}
                    </tbody>
                </table>
            </div>
        </div>
    `;

    document.getElementById('players-climber-btn')?.addEventListener('click', e => {
        const uid = e.currentTarget.dataset.climberId;
        if (uid) openPlayerDetailModal(uid, 'cs2');
    });

    container.querySelectorAll('[data-player-filter]').forEach(btn => {
        btn.addEventListener('click', () => {
            state.playerFilter = btn.dataset.playerFilter;
            renderPlayers();
        });
    });

    document.getElementById('players-search').addEventListener('input', e => {
        state.playerSearch = e.target.value;
        document.getElementById('players-tbody').innerHTML = renderPlayersTableRows();
        attachPlayerTableListeners();
        refreshIcons();
    });

    document.getElementById('players-refresh-btn')?.addEventListener('click', async e => {
        const btn = e.currentTarget;
        await setButtonLoading(btn, true, '...');
        try {
            await refreshOverviewAndPlayers();
            showToast('Players list refreshed.', 'info');
        } catch (err) {
            showToast(err.message, 'error');
        } finally {
            await setButtonLoading(btn, false);
        }
    });

    attachPlayerTableListeners();
    refreshIcons();
}

// --- ANNOUNCEMENTS / EMBED BUILDER ---

function updateAnnouncementPreview() {
    const previewEl = document.getElementById('ann-preview');
    if (!previewEl) return;

    const content = document.getElementById('ann-content').value.trim();
    const roleId = document.getElementById('ann-role').value;
    const title = document.getElementById('ann-title').value.trim();
    const description = document.getElementById('ann-description').value.trim();
    const color = document.getElementById('ann-color').value || '#5865F2';
    const thumb = document.getElementById('ann-thumb').value.trim();
    const image = document.getElementById('ann-image').value.trim();
    const footer = document.getElementById('ann-footer').value.trim();
    const timestamp = document.getElementById('ann-timestamp').checked;

    const roleObj = (state.meta?.roles || []).find(r => r.id === roleId);
    const pingHtml = roleId
        ? `<span class="px-1 py-0.5 rounded bg-brand/30 text-indigo-200 font-medium">${escapeHtml(roleObj?.isEveryone ? '@everyone' : `@${roleObj?.name || 'role'}`)}</span> `
        : '';

    const hasEmbed = Boolean(title || description || footer || thumb || image);
    const botAvatar = state.auth?.bot?.avatarUrl || '';
    const botName = state.auth?.bot?.username || 'BOT Gaben';

    previewEl.innerHTML = `
        <div class="flex items-start gap-3">
            <img src="${escapeHtml(botAvatar)}" alt="" class="w-10 h-10 rounded-full object-cover bg-bg-base shrink-0" />
            <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2">
                    <span class="text-sm font-semibold text-white">${escapeHtml(botName)}</span>
                    <span class="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-brand text-white">APP</span>
                    <span class="text-xs text-slate-500">Today</span>
                </div>
                ${(pingHtml || content) ? `<div class="text-sm text-slate-200 mt-1 whitespace-pre-wrap break-words">${pingHtml}${escapeHtml(content)}</div>` : ''}
                ${hasEmbed ? `
                    <div class="mt-2 rounded-lg bg-[#2b2d31] border-l-4 p-4 max-w-lg shadow" style="border-left-color: ${escapeHtml(color)};">
                        <div class="flex items-start justify-between gap-3">
                            <div class="flex-1 min-w-0">
                                ${title ? `<div class="text-sm font-bold text-white break-words">${escapeHtml(title)}</div>` : ''}
                                ${description ? `<div class="text-xs text-slate-200 mt-1.5 whitespace-pre-wrap break-words leading-relaxed">${escapeHtml(description)}</div>` : ''}
                            </div>
                            ${thumb ? `<img src="${escapeHtml(thumb)}" alt="" class="w-14 h-14 rounded-lg object-cover shrink-0 bg-bg-base" onerror="this.style.display='none'" />` : ''}
                        </div>
                        ${image ? `<img src="${escapeHtml(image)}" alt="" class="mt-3 rounded-lg max-h-56 w-full object-cover bg-bg-base" onerror="this.style.display='none'" />` : ''}
                        ${(footer || timestamp) ? `
                            <div class="mt-3 text-[11px] text-slate-400">
                                ${escapeHtml(footer)}${(footer && timestamp) ? ' · ' : ''}${timestamp ? 'Today' : ''}
                            </div>
                        ` : ''}
                    </div>
                ` : '<p class="text-xs text-slate-500 mt-2 italic">Message preview...</p>'}
            </div>
        </div>
    `;
}

function formatCompactUptime(ms) {
    const totalSeconds = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
    if (totalSeconds < 60) return '<1m';

    const totalMinutes = Math.floor(totalSeconds / 60);
    if (totalMinutes < 60) return `${totalMinutes}m`;

    const totalHours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (totalHours < 24) return `${totalHours}h ${minutes}m`;

    const days = Math.floor(totalHours / 24);
    const hours = totalHours % 24;
    return `${days}d ${hours}h`;
}

function pickSlovakPlural(count, formsStr) {
    const parts = String(formsStr || '').split('|');
    if (parts.length === 0) return '';
    if (parts.length === 1) return parts[0];

    const n = Math.abs(Math.round(Number(count) || 0));
    if (parts.length === 2) {
        return n === 1 ? parts[0] : parts[1];
    }

    if (n === 1) return parts[0];
    if (n >= 2 && n <= 4) return parts[1];
    return parts[2];
}

function resolveBotStatusPreview(template) {
    const raw = typeof template === 'string' ? template.trim() : '';
    if (!raw) return '';

    const ov = state.overview || {};
    const playersCount = Number(ov.stats?.linkedPlayersCount ?? state.players?.length ?? 0);
    const membersCount = Number(ov.guild?.memberCount ?? 0);
    const roomsCount = Number(ov.stats?.activeTempRoomsCount ?? state.tempRooms?.length ?? 0);
    const pluralCounts = {
        players: playersCount,
        members: membersCount,
        rooms: roomsCount
    };

    const players = String(playersCount);
    const members = String(membersCount);
    const rooms = String(roomsCount);
    const topEloNum = Number(ov.stats?.topElo ?? 0);
    const topElo = topEloNum > 0
        ? Math.round(topEloNum).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
        : '0';
    const ping = `${Number(ov.bot?.ping ?? 0)}ms`;
    const uptime = formatCompactUptime(ov.bot?.uptimeMs ?? 0);

    return raw
        .replace(/\{(players|members|rooms):([^{}]+)\}/gi, (_, key, formsStr) => (
            pickSlovakPlural(pluralCounts[key.toLowerCase()], formsStr)
        ))
        .replace(/\{players\}/gi, players)
        .replace(/\{members\}/gi, members)
        .replace(/\{rooms\}/gi, rooms)
        .replace(/\{top_elo\}/gi, topElo)
        .replace(/\{ping\}/gi, ping)
        .replace(/\{uptime\}/gi, uptime);
}

function renderAnnouncementsHistoryBlock() {
    const host = document.getElementById('ann-history-container');
    if (!host) return;

    const history = state.announcementsHistory || [];
    const editing = state.editingAnnouncement;

    if (history.length === 0) {
        host.innerHTML = '';
        return;
    }

    host.innerHTML = `
        <div class="p-3.5 rounded-xl bg-bg-elevated/70 border border-slate-800 space-y-1.5">
            <label class="text-xs font-medium text-slate-400">Edit sent message</label>
            <select id="ann-history-select" class="input-field">
                <option value="">— New announcement —</option>
                ${history.map((h, i) => `
                    <option value="${i}" ${editing && editing.messageId === h.messageId ? 'selected' : ''}>
                        #${escapeHtml(h.channelName || h.channelId)} — ${escapeHtml(h.title || h.content || 'Untitled')}
                    </option>
                `).join('')}
            </select>
        </div>
    `;

    const histSelect = document.getElementById('ann-history-select');
    if (histSelect) {
        histSelect.addEventListener('change', () => {
            const idx = histSelect.value;
            state.editingAnnouncement = idx === '' ? null : state.announcementsHistory[Number(idx)] || null;
            renderAnnouncements();
        });
    }
}

async function refreshAnnouncementsHistory() {
    try {
        const res = await apiFetch('/api/announcements/history');
        const nextHistory = Array.isArray(res.history) ? res.history : [];
        state.announcementsHistory = nextHistory;

        if (state.editingAnnouncement && !nextHistory.some(
            h => h.channelId === state.editingAnnouncement.channelId && h.messageId === state.editingAnnouncement.messageId
        )) {
            state.editingAnnouncement = null;
            showToast('The announcement being edited was deleted on Discord.', 'info');
            if (state.activeSection === 'announcements') {
                renderAnnouncements();
            }
            return;
        }

        if (state.activeSection === 'announcements') {
            renderAnnouncementsHistoryBlock();
        }
    } catch {
        // Ignore temporary sync error
    }
}

function renderAnnouncements() {
    const container = document.getElementById('section-announcements');
    const editing = state.editingAnnouncement;

    container.innerHTML = `
        <div class="grid grid-cols-1 xl:grid-cols-12 gap-6">
            <div class="xl:col-span-7 card p-6 space-y-5">
                <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <h3 class="text-base font-semibold text-white flex items-center gap-2">
                        <i data-lucide="megaphone" class="w-4 h-4 text-brand"></i>
                        <span>${editing ? 'Edit announcement' : 'New announcement'}</span>
                    </h3>
                    ${editing ? `
                        <button id="ann-cancel-edit" type="button" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-bg-elevated hover:bg-bg-hover border border-slate-700 text-xs text-slate-200 transition">
                            <i data-lucide="x" class="w-3.5 h-3.5"></i>
                            <span>Cancel edit</span>
                        </button>
                    ` : ''}
                </div>

                <div id="ann-history-container"></div>

                <form id="ann-form" class="space-y-4">
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div class="space-y-1.5">
                            <label class="text-xs font-medium text-slate-400">Channel</label>
                            <select id="ann-channel" class="input-field" ${editing ? 'disabled' : ''}>
                                ${buildTextChannelOptions(editing?.channelId || '')}
                            </select>
                        </div>
                        <div class="space-y-1.5">
                            <label class="text-xs font-medium text-slate-400">Ping role</label>
                            <select id="ann-role" class="input-field">
                                ${buildRoleOptions(editing?.roleId || '', { allowNone: true, noneLabel: '— No ping —', allowEveryone: true })}
                            </select>
                        </div>
                    </div>

                    <div class="space-y-1.5">
                        <label class="text-xs font-medium text-slate-400">Message text</label>
                        <input id="ann-content" type="text" maxlength="2000" class="input-field" value="${escapeHtml(editing?.content || '')}" />
                    </div>

                    <div class="grid grid-cols-1 md:grid-cols-12 gap-4">
                        <div class="md:col-span-9 space-y-1.5">
                            <label class="text-xs font-medium text-slate-400">Title</label>
                            <input id="ann-title" type="text" maxlength="256" class="input-field" value="${escapeHtml(editing?.title || '')}" />
                        </div>
                        <div class="md:col-span-3 space-y-1.5">
                            <label class="text-xs font-medium text-slate-400">Color</label>
                            <input id="ann-color" type="color" class="w-full h-[42px] rounded-xl bg-bg-base border border-slate-700 cursor-pointer p-1" value="${escapeHtml(editing?.color || '#5865F2')}" />
                        </div>
                    </div>

                    <div class="space-y-1.5">
                        <label class="text-xs font-medium text-slate-400">Description</label>
                        <textarea id="ann-description" rows="5" maxlength="4096" class="input-field resize-y">${escapeHtml(editing?.description || '')}</textarea>
                    </div>

                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div class="space-y-1.5">
                            <label class="text-xs font-medium text-slate-400">Thumbnail</label>
                            <input id="ann-thumb" type="url" class="input-field" value="${escapeHtml(editing?.thumbnailUrl || '')}" placeholder="https://..." />
                        </div>
                        <div class="space-y-1.5">
                            <label class="text-xs font-medium text-slate-400">Image</label>
                            <input id="ann-image" type="url" class="input-field" value="${escapeHtml(editing?.imageUrl || '')}" placeholder="https://..." />
                        </div>
                    </div>

                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
                        <div class="space-y-1.5">
                            <label class="text-xs font-medium text-slate-400">Footer</label>
                            <input id="ann-footer" type="text" maxlength="2048" class="input-field" value="${escapeHtml(editing?.footerText || '')}" />
                        </div>
                        <div class="flex flex-col gap-2.5 pt-4">
                            <label class="flex items-center justify-between gap-3 text-xs text-slate-300">
                                <span>Timestamp</span>
                                ${renderToggleSwitch('ann-timestamp', editing ? Boolean(editing.timestamp) : true)}
                            </label>
                            ${!editing ? `
                                <label class="flex items-center justify-between gap-3 text-xs text-slate-300">
                                    <span>Publish</span>
                                    ${renderToggleSwitch('ann-crosspost', false)}
                                </label>
                            ` : ''}
                        </div>
                    </div>

                    <div class="flex items-center justify-end gap-3 pt-2">
                        ${!editing ? `
                            <button id="ann-reset-btn" type="button" class="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-bg-elevated hover:bg-bg-hover border border-slate-700 text-sm font-medium text-slate-200 transition">
                                <i data-lucide="eraser" class="w-4 h-4"></i>
                                <span>Clear</span>
                            </button>
                        ` : ''}
                        <button id="ann-submit-btn" type="submit" class="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand hover:bg-brand-hover text-white text-sm font-semibold transition">
                            <i data-lucide="send" class="w-4 h-4"></i>
                            <span>${editing ? 'Save changes' : 'Send'}</span>
                        </button>
                    </div>
                </form>
            </div>

            <div class="xl:col-span-5 card p-6 flex flex-col">
                <h3 class="text-base font-semibold text-white mb-4 flex items-center gap-2">
                    <i data-lucide="eye" class="w-4 h-4 text-sky-400"></i>
                    <span>Preview</span>
                </h3>
                <div id="ann-preview" class="flex-1 rounded-2xl bg-[#313338] border border-slate-800 p-4"></div>
            </div>
        </div>
    `;

    ['ann-content', 'ann-role', 'ann-title', 'ann-description', 'ann-color', 'ann-thumb', 'ann-image', 'ann-footer', 'ann-timestamp']
        .forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('input', updateAnnouncementPreview);
                el.addEventListener('change', updateAnnouncementPreview);
            }
        });

    renderAnnouncementsHistoryBlock();

    const cancelEditBtn = document.getElementById('ann-cancel-edit');
    if (cancelEditBtn) {
        cancelEditBtn.addEventListener('click', () => {
            state.editingAnnouncement = null;
            renderAnnouncements();
        });
    }

    document.getElementById('ann-reset-btn')?.addEventListener('click', () => {
        document.getElementById('ann-form')?.reset();
        const colorInput = document.getElementById('ann-color');
        if (colorInput) colorInput.value = '#5865F2';
        const tsToggle = document.getElementById('ann-timestamp');
        if (tsToggle) tsToggle.checked = true;
        updateAnnouncementPreview();
    });

    document.getElementById('ann-form').addEventListener('submit', async e => {
        e.preventDefault();
        const btn = document.getElementById('ann-submit-btn');
        const payload = {
            channelId: document.getElementById('ann-channel').value,
            roleId: document.getElementById('ann-role').value || null,
            content: document.getElementById('ann-content').value,
            title: document.getElementById('ann-title').value,
            description: document.getElementById('ann-description').value,
            color: document.getElementById('ann-color').value,
            thumbnailUrl: document.getElementById('ann-thumb').value,
            imageUrl: document.getElementById('ann-image').value,
            footerText: document.getElementById('ann-footer').value,
            timestamp: document.getElementById('ann-timestamp').checked,
            crosspost: document.getElementById('ann-crosspost')?.checked || false
        };

        await setButtonLoading(btn, true, editing ? 'Updating...' : 'Sending...');
        try {
            const url = editing
                ? `/api/announcements/${encodeURIComponent(editing.channelId)}/${encodeURIComponent(editing.messageId)}`
                : '/api/announcements/send';
            const res = await apiFetch(url, {
                method: editing ? 'PUT' : 'POST',
                body: JSON.stringify(payload)
            });
            state.announcementsHistory = res.history || state.announcementsHistory;
            state.editingAnnouncement = null;
            renderAnnouncements();
            showToast(editing ? 'Announcement updated.' : 'Announcement sent to channel.');
        } catch (err) {
            showToast(err.message, 'error');
            if (editing) {
                refreshAnnouncementsHistory();
            }
        } finally {
            await setButtonLoading(btn, false);
        }
    });

    updateAnnouncementPreview();
    refreshIcons();
}

// --- ACTIVITY LOG ---

function buildLogsListHtml() {
    const q = state.logSearch.trim().toLowerCase();
    const list = (state.logs || []).filter(item => {
        if (state.logCategory !== 'all') {
            if (state.logCategory === 'audit') {
                if (item.category !== 'audit' && item.category !== 'dashboard') return false;
            } else if (item.category !== state.logCategory) {
                return false;
            }
        }
        if (q && !item.message.toLowerCase().includes(q) && !(item.actor || '').toLowerCase().includes(q)) return false;
        return true;
    });

    if (list.length === 0) {
        return `<div class="p-8 text-center text-sm text-slate-400">No entries.</div>`;
    }

    const levelStyles = {
        success: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
        warn: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
        error: 'bg-red-500/15 text-red-300 border-red-500/30',
        info: 'bg-sky-500/15 text-sky-300 border-sky-500/30'
    };

    return list.map(item => `
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-4 py-3 border-t border-slate-800/75 hover:bg-bg-elevated/40 transition">
            <div class="flex items-start sm:items-center gap-3 min-w-0">
                <span class="px-2 py-0.5 rounded-full text-[11px] font-semibold border shrink-0 ${levelStyles[item.level] || levelStyles.info}">
                    ${escapeHtml(LOG_CATEGORY_LABELS[item.category] || item.category)}
                </span>
                <span class="text-sm text-slate-200 break-words">${escapeHtml(item.message)}</span>
            </div>
            <div class="flex items-center gap-2 text-xs text-slate-400 shrink-0">
                ${item.actor ? `<span class="px-2 py-0.5 rounded-md bg-bg-elevated border border-slate-800 text-slate-300">${escapeHtml(item.actor)}</span>` : ''}
                <span>${escapeHtml(new Date(item.timestamp).toLocaleString('en-GB'))}</span>
            </div>
        </div>
    `).join('');
}

function patchLogsDom() {
    const listEl = document.getElementById('logs-list');
    if (!listEl) return;
    const nextHtml = buildLogsListHtml();
    if (nextHtml !== lastLogsHtml) {
        lastLogsHtml = nextHtml;
        listEl.innerHTML = nextHtml;
    }
}

function renderLogs() {
    const container = document.getElementById('section-logs');
    const categories = [
        { id: 'all', label: 'All' },
        { id: 'audit', label: 'Audit' },
        { id: 'moderation', label: 'Moderation' },
        { id: 'elo', label: 'CS2 Elo' },
        { id: 'tempvoice', label: 'TempVoice' },
        { id: 'patchbot', label: 'PatchBot' },
        { id: 'joinroles', label: 'Join Roles' },
        { id: 'adminlog', label: 'Admin Log' },
        { id: 'welcome', label: 'Welcome' },
        { id: 'tickets', label: 'Tickets' },
        { id: 'system', label: 'System' }
    ];

    container.innerHTML = `
        <div class="card overflow-hidden">
            <div class="p-5 border-b border-slate-800/90 space-y-4">
                <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <h3 class="text-base font-semibold text-white flex items-center gap-2">
                        <i data-lucide="scroll-text" class="w-4 h-4 text-brand"></i>
                        <span>Activity Log</span>
                    </h3>
                    <div class="flex flex-wrap items-center gap-2">
                        <input id="logs-search" type="text" placeholder="Search..." class="input-field sm:w-56" value="${escapeHtml(state.logSearch)}" />
                        <button id="logs-refresh-btn" type="button" class="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-bg-elevated hover:bg-bg-hover border border-slate-700 text-xs font-medium text-slate-200 transition shrink-0">
                            <i data-lucide="refresh-cw" class="w-3.5 h-3.5"></i>
                            <span>Refresh</span>
                        </button>
                        <button id="logs-clear-btn" type="button" class="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-red-500/15 hover:bg-red-500/25 border border-red-500/30 text-xs font-medium text-red-300 transition shrink-0">
                            <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                            <span>Clear</span>
                        </button>
                    </div>
                </div>

                <div class="flex flex-wrap gap-2">
                    ${categories.map(c => `
                        <button type="button" data-log-cat="${c.id}" class="px-3 py-1.5 rounded-xl text-xs font-medium border transition ${state.logCategory === c.id ? 'bg-brand text-white border-brand' : 'bg-bg-elevated hover:bg-bg-hover text-slate-300 border-slate-700'}">
                            ${escapeHtml(c.label)}
                        </button>
                    `).join('')}
                </div>
            </div>

            <div id="logs-list">${buildLogsListHtml()}</div>
        </div>
    `;

    lastLogsHtml = document.getElementById('logs-list').innerHTML;

    container.querySelectorAll('[data-log-cat]').forEach(btn => {
        btn.addEventListener('click', () => {
            state.logCategory = btn.dataset.logCat;
            renderLogs();
        });
    });

    document.getElementById('logs-search').addEventListener('input', e => {
        state.logSearch = e.target.value;
        patchLogsDom();
    });

    document.getElementById('logs-refresh-btn')?.addEventListener('click', async e => {
        const btn = e.currentTarget;
        await setButtonLoading(btn, true, '...');
        try {
            const res = await apiFetch('/api/logs');
            state.logs = res.logs || [];
            patchLogsDom();
            showToast('Activity log refreshed.', 'info');
        } catch (err) {
            showToast(err.message, 'error');
        } finally {
            await setButtonLoading(btn, false);
        }
    });

    document.getElementById('logs-clear-btn').addEventListener('click', async e => {
        const btn = e.currentTarget;
        const ok = await confirmAction({
            title: 'Clear activity log?',
            message: 'All entries in the dashboard log will be removed.',
            confirmLabel: 'Clear'
        });
        if (!ok) return;

        await setButtonLoading(btn, true, 'Clearing...');
        try {
            const res = await apiFetch('/api/logs', { method: 'DELETE' });
            state.logs = res.logs || [];
            patchLogsDom();
            showToast('Activity log cleared.');
        } catch (err) {
            showToast(err.message, 'error');
        } finally {
            await setButtonLoading(btn, false);
        }
    });

    refreshIcons();
}

// --- TEMPVOICE ---

function renderTempVoiceRoomsList() {
    if (state.tempRooms.length === 0) {
        return `<p class="text-sm text-slate-400 py-4 text-center">No open rooms.</p>`;
    }

    return `
        <div class="space-y-3">
            ${state.tempRooms.map(r => `
                <div class="p-4 rounded-xl bg-bg-elevated border border-slate-800 space-y-3">
                    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div class="min-w-0">
                            <div class="flex items-center gap-2 flex-wrap">
                                <span class="font-semibold text-white text-sm truncate">${escapeHtml(r.name)}</span>
                                <span class="text-xs inline-flex items-center gap-1 px-2 py-0.5 rounded-full ${r.locked ? 'bg-red-500/15 text-red-300 border border-red-500/30' : 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'}">
                                    <i data-lucide="${r.locked ? 'lock' : 'unlock'}" class="w-3 h-3"></i>
                                    <span>${r.locked ? 'Locked' : 'Unlocked'}</span>
                                </span>
                            </div>
                            <div class="text-xs text-slate-400 mt-1">
                                Owner: <strong class="text-slate-200">${escapeHtml(r.ownerName)}</strong> ·
                                Members: ${r.memberCount}/${r.userLimit === 0 ? '∞' : r.userLimit} ·
                                ${r.bitrateKbps} kbps
                            </div>
                        </div>
                        <div class="flex items-center flex-wrap gap-2 shrink-0">
                            <button type="button" data-tv-rename="${escapeHtml(r.channelId)}" data-tv-name="${escapeHtml(r.name)}" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-bg-surface hover:bg-bg-hover border border-slate-700 text-xs font-medium text-slate-200 transition">
                                <i data-lucide="pencil" class="w-3.5 h-3.5"></i>
                                <span>Rename</span>
                            </button>
                            <button type="button" data-tv-lock="${escapeHtml(r.channelId)}" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-bg-surface hover:bg-bg-hover border border-slate-700 text-xs font-medium text-slate-200 transition">
                                <i data-lucide="${r.locked ? 'unlock' : 'lock'}" class="w-3.5 h-3.5"></i>
                                <span>${r.locked ? 'Unlock' : 'Lock'}</span>
                            </button>
                            <button type="button" data-tv-close="${escapeHtml(r.channelId)}" data-tv-name="${escapeHtml(r.name)}" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/15 hover:bg-red-500/25 border border-red-500/30 text-xs font-medium text-red-300 transition">
                                <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                                <span>Close</span>
                            </button>
                        </div>
                    </div>

                    ${(r.members && r.members.length > 0) ? `
                        <div class="pt-2.5 border-t border-slate-800/80 flex flex-wrap gap-2">
                            ${r.members.map(m => `
                                <div class="inline-flex items-center gap-2 px-2.5 py-1 rounded-lg bg-bg-surface border border-slate-700/70 text-xs">
                                    <img src="${escapeHtml(m.avatarUrl)}" alt="" class="w-4 h-4 rounded-full object-cover" />
                                    <span class="text-slate-200 font-medium inline-flex items-center gap-1">${m.isOwner ? '<i data-lucide="crown" class="w-3.5 h-3.5 text-amber-400 shrink-0"></i>' : ''}<span>${escapeHtml(m.displayName)}</span></span>
                                    <button type="button" data-tv-kick-room="${escapeHtml(r.channelId)}" data-tv-kick-user="${escapeHtml(m.id)}" data-tv-kick-name="${escapeHtml(m.displayName)}" title="Disconnect from room" class="text-slate-400 hover:text-red-400 transition ml-0.5">
                                        <i data-lucide="x" class="w-3.5 h-3.5"></i>
                                    </button>
                                </div>
                            `).join('')}
                        </div>
                    ` : ''}
                </div>
            `).join('')}
        </div>
    `;
}

function attachTempVoiceRoomListeners() {
    const listEl = document.getElementById('tv-rooms-list');
    if (!listEl) return;

    listEl.querySelectorAll('[data-tv-rename]').forEach(btn => {
        btn.addEventListener('click', async () => {
            const channelId = btn.dataset.tvRename;
            const currentName = btn.dataset.tvName;
            const newName = await openRenameModal(currentName);
            if (!newName || newName === currentName) return;

            await setButtonLoading(btn, true, '...');
            try {
                await apiFetch(`/api/tempvoice/rooms/${encodeURIComponent(channelId)}/rename`, {
                    method: 'POST',
                    body: JSON.stringify({ name: newName })
                });
                showToast(`Room renamed to "${newName}".`);
                await refreshTempRooms();
            } catch (err) {
                showToast(err.message, 'error');
            } finally {
                await setButtonLoading(btn, false);
            }
        });
    });

    listEl.querySelectorAll('[data-tv-lock]').forEach(btn => {
        btn.addEventListener('click', async () => {
            const channelId = btn.dataset.tvLock;
            await setButtonLoading(btn, true, '...');
            try {
                const res = await apiFetch(`/api/tempvoice/rooms/${encodeURIComponent(channelId)}/toggle-lock`, { method: 'POST' });
                showToast(res.locked ? 'Room locked.' : 'Room unlocked.');
                await refreshTempRooms();
            } catch (err) {
                showToast(err.message, 'error');
            } finally {
                await setButtonLoading(btn, false);
            }
        });
    });

    listEl.querySelectorAll('[data-tv-close]').forEach(btn => {
        btn.addEventListener('click', async () => {
            const channelId = btn.dataset.tvClose;
            const name = btn.dataset.tvName;
            const ok = await confirmAction({
                title: 'Close temp room?',
                message: `Room "${name}" will be deleted from the Discord server immediately.`,
                confirmLabel: 'Close room'
            });
            if (!ok) return;

            await setButtonLoading(btn, true, 'Deleting...');
            try {
                await apiFetch(`/api/tempvoice/rooms/${encodeURIComponent(channelId)}`, { method: 'DELETE' });
                showToast(`Room "${name}" closed.`);
                await refreshTempRooms();
                await refreshOverviewOnly();
            } catch (err) {
                showToast(err.message, 'error');
            } finally {
                await setButtonLoading(btn, false);
            }
        });
    });

    listEl.querySelectorAll('[data-tv-kick-user]').forEach(btn => {
        btn.addEventListener('click', async () => {
            const channelId = btn.dataset.tvKickRoom;
            const userId = btn.dataset.tvKickUser;
            const name = btn.dataset.tvKickName;
            const ok = await confirmAction({
                title: 'Disconnect player from room?',
                message: `${name} will be disconnected from the voice channel.`,
                confirmLabel: 'Disconnect'
            });
            if (!ok) return;

            try {
                await apiFetch(`/api/tempvoice/rooms/${encodeURIComponent(channelId)}/kick/${encodeURIComponent(userId)}`, { method: 'POST' });
                showToast(`${name} disconnected from room.`);
                await refreshTempRooms();
            } catch (err) {
                showToast(err.message, 'error');
            }
        });
    });
}

function readTempVoiceDraftFromDom() {
    const cards = document.querySelectorAll('#tv-setups-list .tv-setup-card');
    if (cards.length === 0) return;

    state.tvDraftSetups = [...cards].map((card, idx) => ({
        id: card.dataset.setupId || `tv_${idx + 1}`,
        enabled: card.querySelector('.tv-setup-enabled').checked,
        triggerChannelId: card.querySelector('.tv-setup-trigger').value || null,
        createTriggerChannel: card.dataset.triggerMode === 'new',
        categoryId: card.querySelector('.tv-setup-category').value || null,
        triggerName: card.querySelector('.tv-setup-trigger-name').value,
        roomNameTemplate: card.querySelector('.tv-setup-template').value,
        userLimit: Number(card.querySelector('.tv-setup-limit').value),
        bitrateKbps: Number(card.querySelector('.tv-setup-bitrate').value),
        lockOnDisable: Boolean(card.querySelector('.tv-setup-lock-on-disable')?.checked),
        lockRoleIds: [...card.querySelectorAll('.tv-setup-lock-role-select')].map(s => s.value)
    }));
}

function buildTempVoiceLockRoleRowsHtml(setupIdx, roleIds) {
    if (!Array.isArray(roleIds) || roleIds.length === 0) {
        return `<p class="text-xs text-slate-400 py-1.5">No role.</p>`;
    }

    return roleIds.map((roleId, roleIdx) => `
        <div class="flex items-center gap-2">
            <select class="tv-setup-lock-role-select input-field flex-1">
                ${buildRoleOptions(roleId, { allowNone: true, noneLabel: '— Select role —', allowEveryone: true })}
            </select>
            <button type="button" data-tv-lock-role-remove="${setupIdx}:${roleIdx}" title="Remove role" class="p-2.5 rounded-xl bg-red-500/15 hover:bg-red-500/25 border border-red-500/30 text-red-300 transition shrink-0">
                <i data-lucide="trash-2" class="w-4 h-4"></i>
            </button>
        </div>
    `).join('');
}

function buildTempVoiceSetupCardsHtml() {
    const maxBitrate = state.meta?.maxBitrateKbps || 96;
    if (state.tvDraftSetups.length === 0) {
        return `<div class="p-6 rounded-xl bg-bg-elevated/60 border border-slate-800 text-center text-sm text-slate-400">No setups.</div>`;
    }

    return state.tvDraftSetups.map((setup, idx) => {
        const isNewMode = Boolean(setup.createTriggerChannel);
        return `
        <div class="tv-setup-card p-5 rounded-2xl bg-bg-elevated/70 border border-slate-800 space-y-4" data-setup-id="${escapeHtml(setup.id)}" data-trigger-mode="${isNewMode ? 'new' : 'existing'}">
            <div class="flex items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
                <div class="flex items-center gap-3">
                    <span class="w-7 h-7 rounded-lg bg-brand/15 text-brand text-xs font-bold flex items-center justify-center">#${idx + 1}</span>
                    <div class="text-sm font-semibold text-white">TempVoice #${idx + 1}</div>
                </div>
                <div class="flex items-center gap-3">
                    <div class="inline-flex items-center gap-2 text-xs text-slate-300">
                        <span>Active</span>
                        ${renderToggleSwitch('', setup.enabled, 'tv-setup-enabled')}
                    </div>
                    <button type="button" data-tv-remove="${idx}" title="Remove" class="p-2 rounded-lg bg-red-500/15 hover:bg-red-500/25 border border-red-500/30 text-red-300 transition">
                        <i data-lucide="trash-2" class="w-4 h-4"></i>
                    </button>
                </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-12 gap-4">
                <div class="md:col-span-6 space-y-1.5">
                    <div class="flex items-center justify-between gap-2 min-h-[24px]">
                        <label class="text-xs font-medium text-slate-400">Trigger channel</label>
                        <div class="inline-flex items-center rounded-lg bg-bg-base border border-slate-800 p-0.5 text-[11px] font-medium">
                            <button type="button" data-tv-trigger-mode="existing" class="px-2 py-0.5 rounded-md transition ${!isNewMode ? 'bg-brand text-white' : 'text-slate-400 hover:text-white'}">Existing</button>
                            <button type="button" data-tv-trigger-mode="new" class="px-2 py-0.5 rounded-md transition ${isNewMode ? 'bg-brand text-white' : 'text-slate-400 hover:text-white'}">New</button>
                        </div>
                    </div>
                    <select class="tv-setup-trigger input-field ${isNewMode ? 'hidden' : ''}">
                        ${buildVoiceChannelOptions(setup.triggerChannelId)}
                    </select>
                    <input type="text" maxlength="100" ${isNewMode ? 'required' : ''} placeholder="➕ Create room" class="tv-setup-trigger-name input-field ${isNewMode ? '' : 'hidden'}" value="${escapeHtml(setup.triggerName || '➕ Create room')}" />
                </div>

                <div class="md:col-span-6 space-y-1.5">
                    <div class="flex items-center min-h-[24px]">
                        <label class="text-xs font-medium text-slate-400">Category</label>
                    </div>
                    <select class="tv-setup-category input-field">
                        ${buildCategoryOptions(setup.categoryId)}
                    </select>
                </div>

                <div class="md:col-span-6 space-y-1.5">
                    <label class="text-xs font-medium text-slate-400">Name template · <code class="text-slate-300">{user}</code> <code class="text-slate-300">{username}</code></label>
                    <input type="text" maxlength="100" required class="tv-setup-template input-field" value="${escapeHtml(setup.roomNameTemplate || '🎮 {user}')}" />
                </div>

                <div class="md:col-span-3 space-y-1.5">
                    <label class="text-xs font-medium text-slate-400">User limit · 0 = ∞</label>
                    <input type="number" min="0" max="99" required class="tv-setup-limit input-field" value="${Number(setup.userLimit ?? 0)}" />
                </div>

                <div class="md:col-span-3 space-y-1.5">
                    <label class="text-xs font-medium text-slate-400">Bitrate · max ${maxBitrate} kbps</label>
                    <input type="number" min="8" max="384" required class="tv-setup-bitrate input-field" value="${Number(setup.bitrateKbps ?? 64)}" />
                </div>
            </div>

            <div class="p-4 rounded-xl bg-bg-base/60 border border-slate-800/90 space-y-3">
                <div class="flex items-center justify-between gap-4">
                    <div class="text-xs font-semibold text-white flex items-center gap-1.5">
                        <i data-lucide="lock" class="w-3.5 h-3.5 text-amber-400"></i>
                        <span>Lock channel when disabled</span>
                    </div>
                    ${renderToggleSwitch('', setup.lockOnDisable, 'tv-setup-lock-on-disable')}
                </div>

                <div class="tv-setup-lock-roles-wrap space-y-2.5 ${setup.lockOnDisable ? '' : 'hidden'}">
                    <div class="tv-setup-lock-roles-list space-y-2">
                        ${buildTempVoiceLockRoleRowsHtml(idx, setup.lockRoleIds || [])}
                    </div>
                    <button type="button" data-tv-lock-role-add="${idx}" class="w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl border border-dashed border-slate-700 hover:border-brand/70 bg-bg-elevated/50 hover:bg-brand/10 text-slate-300 hover:text-white text-xs font-medium transition">
                        <i data-lucide="plus" class="w-3.5 h-3.5 text-brand"></i>
                        <span>Add role</span>
                    </button>
                </div>
            </div>
        </div>
        `;
    }).join('');
}

function attachTempVoiceSetupListeners() {
    document.querySelectorAll('[data-tv-trigger-mode]').forEach(btn => {
        btn.addEventListener('click', () => {
            const card = btn.closest('.tv-setup-card');
            const nextMode = btn.dataset.tvTriggerMode === 'new' ? 'new' : 'existing';
            if (!card || card.dataset.triggerMode === nextMode) return;

            card.dataset.triggerMode = nextMode;
            const isNew = nextMode === 'new';

            card.querySelectorAll('[data-tv-trigger-mode]').forEach(tabBtn => {
                const active = tabBtn.dataset.tvTriggerMode === nextMode;
                tabBtn.className = `px-2 py-0.5 rounded-md transition ${active ? 'bg-brand text-white' : 'text-slate-400 hover:text-white'}`;
            });

            const selectEl = card.querySelector('.tv-setup-trigger');
            const nameInput = card.querySelector('.tv-setup-trigger-name');
            if (selectEl) selectEl.classList.toggle('hidden', isNew);
            if (nameInput) {
                nameInput.classList.toggle('hidden', !isNew);
                nameInput.required = isNew;
                if (isNew) {
                    nameInput.focus();
                    nameInput.select();
                }
            }

            setDirty(true, 'tv-settings-form');
        });
    });

    document.querySelectorAll('.tv-setup-lock-on-disable').forEach(toggle => {
        toggle.addEventListener('change', () => {
            const card = toggle.closest('.tv-setup-card');
            const wrap = card?.querySelector('.tv-setup-lock-roles-wrap');
            if (wrap) {
                wrap.classList.toggle('hidden', !toggle.checked);
            }
        });
    });

    document.querySelectorAll('[data-tv-lock-role-add]').forEach(btn => {
        btn.addEventListener('click', () => {
            const setupIdx = Number(btn.dataset.tvLockRoleAdd);
            readTempVoiceDraftFromDom();
            if (!state.tvDraftSetups[setupIdx]) return;
            state.tvDraftSetups[setupIdx].lockRoleIds = [...(state.tvDraftSetups[setupIdx].lockRoleIds || []), ''];
            document.getElementById('tv-setups-list').innerHTML = buildTempVoiceSetupCardsHtml();
            attachTempVoiceSetupListeners();
            setDirty(true, 'tv-settings-form');
            refreshIcons();
        });
    });

    document.querySelectorAll('[data-tv-lock-role-remove]').forEach(btn => {
        btn.addEventListener('click', () => {
            const [setupIdxStr, roleIdxStr] = String(btn.dataset.tvLockRoleRemove || '').split(':');
            const setupIdx = Number(setupIdxStr);
            const roleIdx = Number(roleIdxStr);
            readTempVoiceDraftFromDom();
            if (!state.tvDraftSetups[setupIdx] || !Array.isArray(state.tvDraftSetups[setupIdx].lockRoleIds)) return;
            state.tvDraftSetups[setupIdx].lockRoleIds.splice(roleIdx, 1);
            document.getElementById('tv-setups-list').innerHTML = buildTempVoiceSetupCardsHtml();
            attachTempVoiceSetupListeners();
            setDirty(true, 'tv-settings-form');
            refreshIcons();
        });
    });

    document.querySelectorAll('[data-tv-remove]').forEach(btn => {
        btn.addEventListener('click', async () => {
            const idx = Number(btn.dataset.tvRemove);
            const ok = await confirmAction({
                title: 'Remove TempVoice setup?',
                message: `Setup #${idx + 1} will be removed from the list. The Discord channel will remain intact.`,
                confirmLabel: 'Remove'
            });
            if (!ok) return;

            readTempVoiceDraftFromDom();
            state.tvDraftSetups.splice(idx, 1);
            document.getElementById('tv-setups-list').innerHTML = buildTempVoiceSetupCardsHtml();
            attachTempVoiceSetupListeners();
            setDirty(true, 'tv-settings-form');
            refreshIcons();
        });
    });
}

function renderTempVoice() {
    const container = document.getElementById('section-tempvoice');
    const tv = state.settings?.tempVoice || {};

    container.innerHTML = `
        <div class="card p-6">
            <h3 class="text-base font-semibold text-white mb-5 flex items-center gap-2">
                <i data-lucide="mic" class="w-4 h-4 text-brand"></i>
                <span>TempVoice</span>
            </h3>

            <form id="tv-settings-form" class="space-y-5">
                <div class="flex items-center justify-between gap-4 p-4 rounded-xl bg-bg-elevated border border-slate-800">
                    <div class="text-sm font-semibold text-white">Enable TempVoice</div>
                    ${renderToggleSwitch('tv-global-enabled', tv.enabled)}
                </div>

                <div id="tv-setups-list" class="space-y-4">
                    ${buildTempVoiceSetupCardsHtml()}
                </div>

                <div>
                    ${renderAddButtonHtml('tv-add-setup-btn', 'Add TempVoice')}
                </div>

                <div class="flex justify-end pt-2">
                    <button id="tv-save-btn" type="submit" class="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand hover:bg-brand-hover text-white text-sm font-semibold transition">
                        <i data-lucide="save" class="w-4 h-4"></i>
                        <span>Save</span>
                    </button>
                </div>
            </form>
        </div>

        <div class="card p-6">
            <div class="flex items-center justify-between gap-3 mb-4">
                <h3 id="tv-rooms-heading" class="text-base font-semibold text-white">Active rooms (${state.tempRooms.length})</h3>
                <button id="tv-refresh-rooms" type="button" class="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-bg-elevated hover:bg-bg-hover border border-slate-700 text-xs font-medium text-slate-200 transition">
                    <i data-lucide="refresh-cw" class="w-3.5 h-3.5"></i>
                    <span>Refresh</span>
                </button>
            </div>
            <div id="tv-rooms-list">${renderTempVoiceRoomsList()}</div>
        </div>
    `;

    document.getElementById('tv-add-setup-btn').addEventListener('click', () => {
        readTempVoiceDraftFromDom();
        state.tvDraftSetups.push({
            id: `tv_${Date.now()}`,
            enabled: true,
            triggerChannelId: null,
            createTriggerChannel: false,
            categoryId: null,
            triggerName: '➕ Create Room',
            roomNameTemplate: '🎮 {user}',
            bitrateKbps: 64,
            userLimit: 0,
            lockOnDisable: false,
            lockRoleIds: []
        });
        document.getElementById('tv-setups-list').innerHTML = buildTempVoiceSetupCardsHtml();
        attachTempVoiceSetupListeners();
        setDirty(true, 'tv-settings-form');
        refreshIcons();
    });

    document.getElementById('tv-settings-form').addEventListener('submit', async e => {
        e.preventDefault();
        readTempVoiceDraftFromDom();
        const btn = document.getElementById('tv-save-btn');
        await setButtonLoading(btn, true, 'Saving...');
        try {
            const payloadSetups = state.tvDraftSetups.map(s => ({
                ...s,
                lockRoleIds: (s.lockRoleIds || []).filter(Boolean)
            }));
            const res = await apiFetch('/api/settings/tempvoice', {
                method: 'PUT',
                body: JSON.stringify({
                    enabled: document.getElementById('tv-global-enabled').checked,
                    setups: payloadSetups
                })
            });
            state.settings.tempVoice = res.tempVoice;
            syncDraftsFromSettings();
            setDirty(false);
            await refreshMetaAndOverview();
            renderTempVoice();
            showToast('TempVoice settings saved.');
            if (Array.isArray(res.warnings)) {
                res.warnings.forEach(w => showToast(w, 'error'));
            }
        } catch (err) {
            showToast(err.message, 'error');
        } finally {
            await setButtonLoading(btn, false);
        }
    });

    document.getElementById('tv-refresh-rooms').addEventListener('click', async e => {
        const btn = e.currentTarget;
        await setButtonLoading(btn, true, '...');
        try {
            await refreshTempRooms();
            showToast('Rooms refreshed.', 'info');
        } catch (err) {
            showToast(err.message, 'error');
        } finally {
            await setButtonLoading(btn, false);
        }
    });

    bindDirtyForm('tv-settings-form');
    attachTempVoiceSetupListeners();
    attachTempVoiceRoomListeners();
    refreshIcons();
}

// --- PATCHBOT ---

function readPatchBotDraftFromDom() {
    const selects = document.querySelectorAll('#pb-channels-list .pb-channel-select');
    if (selects.length > 0) {
        state.pbDraftChannelIds = [...selects].map(s => s.value);
    }
}

function buildPatchBotChannelRowsHtml() {
    if (state.pbDraftChannelIds.length === 0) {
        return `<p class="text-xs text-slate-400 py-2">No channels.</p>`;
    }

    return state.pbDraftChannelIds.map((channelId, idx) => `
        <div class="flex items-center gap-2">
            <select class="pb-channel-select input-field flex-1">
                ${buildTextChannelOptions(channelId, { allowNone: true, noneLabel: '— Select channel —' })}
            </select>
            <button type="button" data-pb-remove-channel="${idx}" title="Remove channel" class="p-2.5 rounded-xl bg-red-500/15 hover:bg-red-500/25 border border-red-500/30 text-red-300 transition shrink-0">
                <i data-lucide="trash-2" class="w-4 h-4"></i>
            </button>
        </div>
    `).join('');
}

function attachPatchBotChannelListeners() {
    document.querySelectorAll('[data-pb-remove-channel]').forEach(btn => {
        btn.addEventListener('click', () => {
            readPatchBotDraftFromDom();
            state.pbDraftChannelIds.splice(Number(btn.dataset.pbRemoveChannel), 1);
            document.getElementById('pb-channels-list').innerHTML = buildPatchBotChannelRowsHtml();
            attachPatchBotChannelListeners();
            setDirty(true, 'pb-form');
            refreshIcons();
        });
    });
}

function renderPatchBot() {
    const container = document.getElementById('section-patchbot');
    const pb = state.settings?.patchBot || {};

    container.innerHTML = `
        <div class="card p-6">
            <h3 class="text-base font-semibold text-white mb-5 flex items-center gap-2">
                <i data-lucide="newspaper" class="w-4 h-4 text-amber-400"></i>
                <span>PatchBot</span>
            </h3>

            <form id="pb-form" class="space-y-5">
                <div class="flex items-center justify-between gap-4 p-4 rounded-xl bg-bg-elevated border border-slate-800">
                    <div class="text-sm font-semibold text-white">Enable PatchBot</div>
                    ${renderToggleSwitch('pb-enabled', pb.enabled)}
                </div>

                <div class="space-y-2.5">
                    <label class="text-xs font-medium text-slate-400 block">Channels</label>
                    <div id="pb-channels-list" class="space-y-2">
                        ${buildPatchBotChannelRowsHtml()}
                    </div>
                    <div class="pt-1">
                        ${renderAddButtonHtml('pb-add-channel-btn', 'Add channel')}
                    </div>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div class="space-y-1.5">
                        <label class="text-xs font-medium text-slate-400">Message type</label>
                        <select id="pb-mode" class="input-field">
                            <option value="all" ${pb.mode !== 'patchnotes' ? 'selected' : ''}>All CS2 announcements</option>
                            <option value="patchnotes" ${pb.mode === 'patchnotes' ? 'selected' : ''}>Patch notes only</option>
                        </select>
                    </div>

                    <div class="space-y-1.5">
                        <label class="text-xs font-medium text-slate-400">Ping role</label>
                        <select id="pb-role" class="input-field">
                            ${buildRoleOptions(pb.roleId, { allowNone: true, noneLabel: '— No ping —', allowEveryone: true })}
                        </select>
                    </div>
                </div>

                <div class="flex items-center justify-between flex-wrap gap-3 pt-2">
                    <div class="text-xs text-slate-400">
                        Last update:
                        <strong class="text-slate-200">${escapeHtml(pb.lastPostedTitle || 'None')}</strong>
                        ${pb.lastPostedAt ? `· ${escapeHtml(formatRelativeTimestamp(pb.lastPostedAt))}` : ''}
                    </div>
                    <button id="pb-save-btn" type="submit" class="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand hover:bg-brand-hover text-white text-sm font-semibold transition">
                        <i data-lucide="save" class="w-4 h-4"></i>
                        <span>Save</span>
                    </button>
                </div>
            </form>
        </div>

        <div class="card p-6">
            <h3 class="text-base font-semibold text-white mb-4 flex items-center gap-2">
                <i data-lucide="send" class="w-4 h-4 text-sky-400"></i>
                <span>Send latest update</span>
            </h3>
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <label class="inline-flex items-center gap-3 text-sm text-slate-300 cursor-pointer">
                    ${renderToggleSwitch('pb-test-ping', false)}
                    <span>Ping role</span>
                </label>
                <button id="pb-send-latest-btn" type="button" class="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-bg-elevated hover:bg-bg-hover border border-slate-700 text-sm font-medium text-white transition">
                    <i data-lucide="send" class="w-4 h-4"></i>
                    <span>Send now</span>
                </button>
            </div>
        </div>
    `;

    document.getElementById('pb-add-channel-btn').addEventListener('click', () => {
        readPatchBotDraftFromDom();
        state.pbDraftChannelIds.push('');
        document.getElementById('pb-channels-list').innerHTML = buildPatchBotChannelRowsHtml();
        attachPatchBotChannelListeners();
        setDirty(true, 'pb-form');
        refreshIcons();
    });

    document.getElementById('pb-form').addEventListener('submit', async e => {
        e.preventDefault();
        readPatchBotDraftFromDom();
        const btn = document.getElementById('pb-save-btn');
        await setButtonLoading(btn, true, 'Saving...');
        try {
            const res = await apiFetch('/api/settings/patchbot', {
                method: 'PUT',
                body: JSON.stringify({
                    enabled: document.getElementById('pb-enabled').checked,
                    channelIds: state.pbDraftChannelIds.filter(Boolean),
                    mode: document.getElementById('pb-mode').value,
                    roleId: document.getElementById('pb-role').value || null
                })
            });
            state.settings.patchBot = res.patchBot;
            syncDraftsFromSettings();
            setDirty(false);
            await refreshOverviewOnly();
            renderPatchBot();
            showToast('PatchBot settings saved.');
        } catch (err) {
            showToast(err.message, 'error');
        } finally {
            await setButtonLoading(btn, false);
        }
    });

    document.getElementById('pb-send-latest-btn').addEventListener('click', async e => {
        const btn = e.currentTarget;
        await setButtonLoading(btn, true, 'Sending...');
        try {
            const withPing = document.getElementById('pb-test-ping').checked;
            const res = await apiFetch('/api/patchbot/latest', {
                method: 'POST',
                body: JSON.stringify({ withPing })
            });
            state.settings.patchBot = res.patchBot;
            syncDraftsFromSettings();
            renderPatchBot();
            showToast(`Sent to ${res.sentCount} channels: ${res.title}`);
        } catch (err) {
            showToast(err.message, 'error');
        } finally {
            await setButtonLoading(btn, false);
        }
    });

    bindDirtyForm('pb-form');
    attachPatchBotChannelListeners();
    refreshIcons();
}

// --- JOIN ROLES ---

function readJoinRolesDraftFromDom() {
    const memberSelects = document.querySelectorAll('#jr-member-list .jr-member-select');
    const botSelects = document.querySelectorAll('#jr-bot-list .jr-bot-select');
    if (document.getElementById('jr-member-list')) {
        state.jrDraftMemberRoleIds = [...memberSelects].map(s => s.value);
    }
    if (document.getElementById('jr-bot-list')) {
        state.jrDraftBotRoleIds = [...botSelects].map(s => s.value);
    }
}

function buildJoinRoleRowsHtml(roleIds, selectClass, removeAttr) {
    if (roleIds.length === 0) {
        return `<p class="text-xs text-slate-400 py-2">No roles.</p>`;
    }

    return roleIds.map((roleId, idx) => `
        <div class="flex items-center gap-2">
            <select class="${selectClass} input-field flex-1">
                ${buildRoleOptions(roleId, { allowNone: true, noneLabel: '— Select role —', onlyAssignable: true })}
            </select>
            <button type="button" ${removeAttr}="${idx}" title="Remove role" class="p-2.5 rounded-xl bg-red-500/15 hover:bg-red-500/25 border border-red-500/30 text-red-300 transition shrink-0">
                <i data-lucide="trash-2" class="w-4 h-4"></i>
            </button>
        </div>
    `).join('');
}

function attachJoinRoleRowListeners() {
    document.querySelectorAll('[data-jr-remove-member]').forEach(btn => {
        btn.addEventListener('click', () => {
            readJoinRolesDraftFromDom();
            state.jrDraftMemberRoleIds.splice(Number(btn.dataset.jrRemoveMember), 1);
            document.getElementById('jr-member-list').innerHTML = buildJoinRoleRowsHtml(
                state.jrDraftMemberRoleIds,
                'jr-member-select',
                'data-jr-remove-member'
            );
            attachJoinRoleRowListeners();
            setDirty(true, 'jr-form');
            refreshIcons();
        });
    });

    document.querySelectorAll('[data-jr-remove-bot]').forEach(btn => {
        btn.addEventListener('click', () => {
            readJoinRolesDraftFromDom();
            state.jrDraftBotRoleIds.splice(Number(btn.dataset.jrRemoveBot), 1);
            document.getElementById('jr-bot-list').innerHTML = buildJoinRoleRowsHtml(
                state.jrDraftBotRoleIds,
                'jr-bot-select',
                'data-jr-remove-bot'
            );
            attachJoinRoleRowListeners();
            setDirty(true, 'jr-form');
            refreshIcons();
        });
    });
}

function renderJoinRoles() {
    const container = document.getElementById('section-joinroles');
    const jr = state.settings?.joinRoles || {};

    container.innerHTML = `
        <div class="card p-6">
            <h3 class="text-base font-semibold text-white mb-5 flex items-center gap-2">
                <i data-lucide="user-plus" class="w-4 h-4 text-emerald-400"></i>
                <span>Join Roles</span>
            </h3>

            <form id="jr-form" class="space-y-5">
                <div class="flex items-center justify-between gap-4 p-4 rounded-xl bg-bg-elevated border border-slate-800">
                    <div class="text-sm font-semibold text-white">Enable Join Roles</div>
                    ${renderToggleSwitch('jr-enabled', jr.enabled)}
                </div>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div class="p-4 rounded-2xl bg-bg-elevated/60 border border-slate-800 space-y-3">
                        <div class="flex items-center gap-2 text-sm font-semibold text-white">
                            <i data-lucide="user" class="w-4 h-4 text-brand"></i>
                            <span>Members</span>
                        </div>
                        <div id="jr-member-list" class="space-y-2">
                            ${buildJoinRoleRowsHtml(state.jrDraftMemberRoleIds, 'jr-member-select', 'data-jr-remove-member')}
                        </div>
                        ${renderAddButtonHtml('jr-add-member-btn', 'Add role')}
                    </div>

                    <div class="p-4 rounded-2xl bg-bg-elevated/60 border border-slate-800 space-y-3">
                        <div class="flex items-center gap-2 text-sm font-semibold text-white">
                            <i data-lucide="bot" class="w-4 h-4 text-sky-400"></i>
                            <span>Bots</span>
                        </div>
                        <div id="jr-bot-list" class="space-y-2">
                            ${buildJoinRoleRowsHtml(state.jrDraftBotRoleIds, 'jr-bot-select', 'data-jr-remove-bot')}
                        </div>
                        ${renderAddButtonHtml('jr-add-bot-btn', 'Add role')}
                    </div>
                </div>

                <div class="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-200 flex items-center gap-2.5">
                    <i data-lucide="info" class="w-4 h-4 shrink-0 text-amber-400"></i>
                    <span>Bot role must be above selected roles.</span>
                </div>

                <div class="flex justify-end">
                    <button id="jr-save-btn" type="submit" class="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand hover:bg-brand-hover text-white text-sm font-semibold transition">
                        <i data-lucide="save" class="w-4 h-4"></i>
                        <span>Save</span>
                    </button>
                </div>
            </form>
        </div>
    `;

    document.getElementById('jr-add-member-btn').addEventListener('click', () => {
        readJoinRolesDraftFromDom();
        state.jrDraftMemberRoleIds.push('');
        document.getElementById('jr-member-list').innerHTML = buildJoinRoleRowsHtml(
            state.jrDraftMemberRoleIds,
            'jr-member-select',
            'data-jr-remove-member'
        );
        attachJoinRoleRowListeners();
        setDirty(true, 'jr-form');
        refreshIcons();
    });

    document.getElementById('jr-add-bot-btn').addEventListener('click', () => {
        readJoinRolesDraftFromDom();
        state.jrDraftBotRoleIds.push('');
        document.getElementById('jr-bot-list').innerHTML = buildJoinRoleRowsHtml(
            state.jrDraftBotRoleIds,
            'jr-bot-select',
            'data-jr-remove-bot'
        );
        attachJoinRoleRowListeners();
        setDirty(true, 'jr-form');
        refreshIcons();
    });

    document.getElementById('jr-form').addEventListener('submit', async e => {
        e.preventDefault();
        readJoinRolesDraftFromDom();
        const btn = document.getElementById('jr-save-btn');
        await setButtonLoading(btn, true, 'Saving...');
        try {
            const res = await apiFetch('/api/settings/joinroles', {
                method: 'PUT',
                body: JSON.stringify({
                    enabled: document.getElementById('jr-enabled').checked,
                    memberRoleIds: state.jrDraftMemberRoleIds.filter(Boolean),
                    botRoleIds: state.jrDraftBotRoleIds.filter(Boolean)
                })
            });
            state.settings.joinRoles = res.joinRoles;
            syncDraftsFromSettings();
            setDirty(false);
            await refreshOverviewOnly();
            renderJoinRoles();
            showToast('Join Roles settings saved.');
        } catch (err) {
            showToast(err.message, 'error');
        } finally {
            await setButtonLoading(btn, false);
        }
    });

    bindDirtyForm('jr-form');
    attachJoinRoleRowListeners();
    refreshIcons();
}

// --- CS2 / STEAM STATUS ---

function renderCsStatus() {
    const container = document.getElementById('section-csstatus');
    const cs = state.settings?.csStatus || {};
    const guildId = state.overview?.guild?.id || state.auth?.guild?.id;
    const messageLink = cs.channelId && cs.messageId && guildId
        ? `https://discord.com/channels/${guildId}/${cs.channelId}/${cs.messageId}`
        : null;

    const parts = splitIntervalParts(cs.intervalSeconds);

    container.innerHTML = `
        <div class="card p-6">
            <h3 class="text-base font-semibold text-white mb-5 flex items-center gap-2">
                <i data-lucide="activity" class="w-4 h-4 text-sky-400"></i>
                <span>CS2 Status</span>
            </h3>

            <form id="cs-form" class="space-y-5">
                <div class="flex items-center justify-between gap-4 p-4 rounded-xl bg-bg-elevated border border-slate-800">
                    <div class="text-sm font-semibold text-white">Enable CS2 Status</div>
                    ${renderToggleSwitch('cs-enabled', cs.enabled)}
                </div>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div class="space-y-1.5">
                        <label class="text-xs font-medium text-slate-400">Channel</label>
                        <select id="cs-channel" class="input-field">
                            ${buildTextChannelOptions(cs.channelId)}
                        </select>
                    </div>

                    <div class="space-y-1.5">
                        <label class="text-xs font-medium text-slate-400">Refresh interval · 30s – 60m</label>
                        <div class="flex items-center gap-2">
                            <input id="cs-interval-num" type="number" min="1" max="3600" required class="input-field flex-1" value="${parts.value}" />
                            <select id="cs-interval-unit" class="input-field w-36">
                                <option value="s" ${parts.unit === 's' ? 'selected' : ''}>Seconds</option>
                                <option value="m" ${parts.unit === 'm' ? 'selected' : ''}>Minutes</option>
                            </select>
                        </div>
                    </div>
                </div>

                <div class="p-4 rounded-xl bg-bg-elevated border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-300">
                    <div class="space-y-1">
                        <div>Interval: <strong>${escapeHtml(formatIntervalLabel(cs.intervalSeconds))}</strong></div>
                        <div>Mode: <strong>${state.steamApiKeyConfigured ? 'Full · Steam API' : 'Basic'}</strong></div>
                    </div>
                    <div class="flex items-center gap-2">
                        ${messageLink ? `
                            <a href="${escapeHtml(messageLink)}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-bg-surface hover:bg-bg-hover border border-slate-700 text-slate-200 transition">
                                <i data-lucide="external-link" class="w-3.5 h-3.5"></i>
                                <span>Open message</span>
                            </a>
                        ` : ''}
                        <button id="cs-refresh-now" type="button" class="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-bg-surface hover:bg-bg-hover border border-slate-700 text-slate-200 transition">
                            <i data-lucide="refresh-cw" class="w-3.5 h-3.5"></i>
                            <span>Refresh now</span>
                        </button>
                    </div>
                </div>

                <div class="flex justify-end">
                    <button id="cs-save-btn" type="submit" class="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand hover:bg-brand-hover text-white text-sm font-semibold transition">
                        <i data-lucide="save" class="w-4 h-4"></i>
                        <span>Save</span>
                    </button>
                </div>
            </form>
        </div>
    `;

    document.getElementById('cs-form').addEventListener('submit', async e => {
        e.preventDefault();
        const num = Number(document.getElementById('cs-interval-num').value);
        const unit = document.getElementById('cs-interval-unit').value;
        if (!Number.isInteger(num) || num <= 0) {
            showToast('Enter a valid whole number for the interval.', 'error');
            return;
        }

        const btn = document.getElementById('cs-save-btn');
        await setButtonLoading(btn, true, 'Saving...');
        try {
            const res = await apiFetch('/api/settings/csstatus', {
                method: 'PUT',
                body: JSON.stringify({
                    enabled: document.getElementById('cs-enabled').checked,
                    channelId: document.getElementById('cs-channel').value || null,
                    interval: `${num}${unit}`
                })
            });
            state.settings.csStatus = res.csStatus;
            setDirty(false);
            await refreshOverviewOnly();
            renderCsStatus();
            showToast('CS2 Status settings saved.');
        } catch (err) {
            showToast(err.message, 'error');
        } finally {
            await setButtonLoading(btn, false);
        }
    });

    document.getElementById('cs-refresh-now').addEventListener('click', async e => {
        const btn = e.currentTarget;
        await setButtonLoading(btn, true, 'Refreshing...');
        try {
            const res = await apiFetch('/api/csstatus/refresh', { method: 'POST' });
            state.settings.csStatus = res.csStatus;
            renderCsStatus();
            showToast('Server status embed refreshed.');
        } catch (err) {
            showToast(err.message, 'error');
        } finally {
            await setButtonLoading(btn, false);
        }
    });

    bindDirtyForm('cs-form');
    refreshIcons();
}

// --- RANK-UP / DERANK ---

function renderRankFeed() {
    const container = document.getElementById('section-rankfeed');
    const rf = state.settings?.rankFeed || {};

    container.innerHTML = `
        <div class="card p-6">
            <h3 class="text-base font-semibold text-white mb-5 flex items-center gap-2">
                <i data-lucide="trending-up" class="w-4 h-4 text-brand-gold"></i>
                <span>Rank-Up / Derank</span>
            </h3>

            <form id="rf-form" class="space-y-5">
                <div class="flex items-center justify-between gap-4 p-4 rounded-xl bg-bg-elevated border border-slate-800">
                    <div class="text-sm font-semibold text-white">Enable Rank-Up / Derank</div>
                    ${renderToggleSwitch('rf-enabled', rf.enabled)}
                </div>

                <div class="space-y-1.5">
                    <label class="text-xs font-medium text-slate-400">Channel</label>
                    <select id="rf-channel" class="input-field">
                        ${buildTextChannelOptions(rf.channelId)}
                    </select>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div class="flex items-center justify-between gap-3 p-4 rounded-xl bg-bg-elevated/60 border border-slate-800">
                        <div class="text-sm font-medium text-white inline-flex items-center gap-2">
                            <i data-lucide="trending-up" class="w-4 h-4 text-emerald-400"></i>
                            <span>Rank-Up</span>
                        </div>
                        ${renderToggleSwitch('rf-up', rf.notifyRankUp !== false)}
                    </div>
                    <div class="flex items-center justify-between gap-3 p-4 rounded-xl bg-bg-elevated/60 border border-slate-800">
                        <div class="text-sm font-medium text-white inline-flex items-center gap-2">
                            <i data-lucide="trending-down" class="w-4 h-4 text-red-400"></i>
                            <span>Derank</span>
                        </div>
                        ${renderToggleSwitch('rf-down', rf.notifyDerank !== false)}
                    </div>
                </div>

                <div class="flex items-center justify-between flex-wrap gap-3 pt-2">
                    <button id="rf-test-btn" type="button" class="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-bg-elevated hover:bg-bg-hover border border-slate-700 text-sm font-medium text-slate-200 transition">
                        <i data-lucide="send" class="w-4 h-4"></i>
                        <span>Test</span>
                    </button>
                    <button id="rf-save-btn" type="submit" class="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand hover:bg-brand-hover text-white text-sm font-semibold transition">
                        <i data-lucide="save" class="w-4 h-4"></i>
                        <span>Save</span>
                    </button>
                </div>
            </form>
        </div>
    `;

    document.getElementById('rf-form').addEventListener('submit', async e => {
        e.preventDefault();
        const btn = document.getElementById('rf-save-btn');
        await setButtonLoading(btn, true, 'Saving...');
        try {
            const res = await apiFetch('/api/settings/rankfeed', {
                method: 'PUT',
                body: JSON.stringify({
                    enabled: document.getElementById('rf-enabled').checked,
                    channelId: document.getElementById('rf-channel').value || null,
                    notifyRankUp: document.getElementById('rf-up').checked,
                    notifyDerank: document.getElementById('rf-down').checked
                })
            });
            state.settings.rankFeed = res.rankFeed;
            setDirty(false);
            await refreshOverviewOnly();
            renderRankFeed();
            showToast('Rank-Up / Derank settings saved.');
        } catch (err) {
            showToast(err.message, 'error');
        } finally {
            await setButtonLoading(btn, false);
        }
    });

    document.getElementById('rf-test-btn').addEventListener('click', async e => {
        const btn = e.currentTarget;
        await setButtonLoading(btn, true, 'Sending...');
        try {
            await apiFetch('/api/rankfeed/test', { method: 'POST' });
            showToast('Test Rank-Up message sent.');
        } catch (err) {
            showToast(err.message, 'error');
        } finally {
            await setButtonLoading(btn, false);
        }
    });

    bindDirtyForm('rf-form');
    refreshIcons();
}

// --- DISCORD ADMIN LOG ---

function renderAdminLog() {
    const container = document.getElementById('section-adminlog');
    const al = state.settings?.adminLog || {};
    const events = al.events || {};
    const hasAudit = Boolean(state.overview?.viewAuditLogGranted);

    const eventRows = [
        { id: 'al-ev-join', key: 'memberJoin', title: 'Member join', icon: 'user-plus', color: 'text-emerald-400' },
        { id: 'al-ev-leave', key: 'memberLeave', title: 'Leave & kick', icon: 'user-minus', color: 'text-amber-400' },
        { id: 'al-ev-bans', key: 'bans', title: 'Bans & unbans', icon: 'ban', color: 'text-red-400' },
        { id: 'al-ev-timeouts', key: 'timeouts', title: 'Timeouts', icon: 'volume-x', color: 'text-orange-400' },
        { id: 'al-ev-roles', key: 'roleChanges', title: 'Role changes', icon: 'tag', color: 'text-sky-400' },
        { id: 'al-ev-voice', key: 'voiceActivity', title: 'Voice activity', icon: 'mic', color: 'text-brand' }
    ];

    container.innerHTML = `
        <div class="card p-6">
            <h3 class="text-base font-semibold text-white mb-5 flex items-center gap-2">
                <i data-lucide="shield-check" class="w-4 h-4 text-sky-400"></i>
                <span>Admin Log</span>
            </h3>

            <form id="al-form" class="space-y-5">
                <div class="flex items-center justify-between gap-4 p-4 rounded-xl bg-bg-elevated border border-slate-800">
                    <div class="text-sm font-semibold text-white">Enable Admin Log</div>
                    ${renderToggleSwitch('al-enabled', al.enabled)}
                </div>

                ${!hasAudit ? `
                    <div class="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-200 flex items-center gap-2.5">
                        <i data-lucide="alert-triangle" class="w-4 h-4 shrink-0 text-amber-400"></i>
                        <span>Missing <strong>View Audit Log</strong> permission — moderators won't be shown for bans, kicks, and timeouts.</span>
                    </div>
                ` : ''}

                <div class="space-y-1.5">
                    <label class="text-xs font-medium text-slate-400">Channel</label>
                    <select id="al-channel" class="input-field">
                        ${buildTextChannelOptions(al.channelId)}
                    </select>
                </div>

                <div class="space-y-2.5">
                    <label class="text-xs font-medium text-slate-400 block">Events</label>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                        ${eventRows.map(ev => `
                            <div class="flex items-center justify-between gap-3 p-3.5 rounded-xl bg-bg-elevated/60 border border-slate-800">
                                <div class="text-sm font-medium text-white inline-flex items-center gap-2">
                                    <i data-lucide="${ev.icon}" class="w-4 h-4 ${ev.color} shrink-0"></i>
                                    <span>${escapeHtml(ev.title)}</span>
                                </div>
                                ${renderToggleSwitch(ev.id, Boolean(events[ev.key]))}
                            </div>
                        `).join('')}
                    </div>
                </div>

                <div class="flex items-center justify-between flex-wrap gap-3 pt-2">
                    <button id="al-test-btn" type="button" class="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-bg-elevated hover:bg-bg-hover border border-slate-700 text-sm font-medium text-slate-200 transition">
                        <i data-lucide="send" class="w-4 h-4"></i>
                        <span>Test</span>
                    </button>
                    <button id="al-save-btn" type="submit" class="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand hover:bg-brand-hover text-white text-sm font-semibold transition">
                        <i data-lucide="save" class="w-4 h-4"></i>
                        <span>Save</span>
                    </button>
                </div>
            </form>
        </div>
    `;

    document.getElementById('al-form').addEventListener('submit', async e => {
        e.preventDefault();
        const btn = document.getElementById('al-save-btn');
        await setButtonLoading(btn, true, 'Saving...');
        try {
            const res = await apiFetch('/api/settings/adminlog', {
                method: 'PUT',
                body: JSON.stringify({
                    enabled: document.getElementById('al-enabled').checked,
                    channelId: document.getElementById('al-channel').value || null,
                    events: {
                        memberJoin: document.getElementById('al-ev-join').checked,
                        memberLeave: document.getElementById('al-ev-leave').checked,
                        bans: document.getElementById('al-ev-bans').checked,
                        timeouts: document.getElementById('al-ev-timeouts').checked,
                        roleChanges: document.getElementById('al-ev-roles').checked,
                        voiceActivity: document.getElementById('al-ev-voice').checked
                    }
                })
            });
            state.settings.adminLog = res.adminLog;
            setDirty(false);
            await refreshOverviewOnly();
            renderAdminLog();
            showToast('Admin Log settings saved.');
        } catch (err) {
            showToast(err.message, 'error');
        } finally {
            await setButtonLoading(btn, false);
        }
    });

    document.getElementById('al-test-btn').addEventListener('click', async e => {
        const btn = e.currentTarget;
        await setButtonLoading(btn, true, 'Sending...');
        try {
            await apiFetch('/api/adminlog/test', { method: 'POST' });
            showToast('Test Admin Log message sent.');
        } catch (err) {
            showToast(err.message, 'error');
        } finally {
            await setButtonLoading(btn, false);
        }
    });

    bindDirtyForm('al-form');
    refreshIcons();
}

// --- WELCOME / GOODBYE ---

function renderWelcome() {
    const container = document.getElementById('section-welcome');
    const w = state.settings?.welcome || {};
    const welcomeVars = [
        { token: '{user}', label: 'Mention' },
        { token: '{displayname}', label: 'Display name' },
        { token: '{username}', label: 'Username' },
        { token: '{server}', label: 'Server' },
        { token: '{members}', label: 'Members' }
    ];

    container.innerHTML = `
        <form id="wl-form" class="space-y-6">
            <div class="card p-6 space-y-4">
                <h3 class="text-base font-semibold text-white flex items-center gap-2">
                    <i data-lucide="hand" class="w-4 h-4 text-emerald-400"></i>
                    <span>Welcome</span>
                </h3>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div class="flex items-center justify-between gap-4 p-4 rounded-xl bg-bg-elevated border border-slate-800">
                        <div class="text-sm font-semibold text-white">Enable Welcome</div>
                        ${renderToggleSwitch('wl-enabled', w.enabled)}
                    </div>

                    <div class="flex items-center justify-between gap-4 p-4 rounded-xl bg-bg-elevated border border-slate-800">
                        <div class="text-sm font-semibold text-white">Ignore bots</div>
                        ${renderToggleSwitch('wl-ignore-bots', w.ignoreBots !== false)}
                    </div>
                </div>

                <div class="p-3.5 rounded-xl bg-bg-elevated/60 border border-slate-800 space-y-2">
                    <div class="text-xs font-medium text-slate-400">Variables:</div>
                    <div class="flex flex-wrap gap-2">
                        ${welcomeVars.map(v => `
                            <button type="button" class="wl-var-chip inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-bg-base hover:bg-bg-hover border border-slate-700/80 hover:border-brand/60 text-xs transition" data-var="${escapeHtml(v.token)}">
                                <code class="text-sky-300 font-semibold">${escapeHtml(v.token)}</code>
                                <span class="text-slate-400">${escapeHtml(v.label)}</span>
                            </button>
                        `).join('')}
                    </div>
                    <p class="text-xs text-slate-400">Pluralization: <code class="text-sky-300">{members:one|few|many}</code></p>
                </div>
            </div>

            <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div class="card p-6 flex flex-col space-y-4">
                    <div class="flex items-center justify-between gap-3 pb-3 border-b border-slate-800">
                        <h4 class="text-sm font-semibold text-white flex items-center gap-2">
                            <i data-lucide="hash" class="w-4 h-4 text-brand"></i>
                            <span>In channel</span>
                        </h4>
                        ${renderToggleSwitch('wl-chan-enabled', w.channelEnabled)}
                    </div>

                    <div class="space-y-1.5">
                        <label class="text-xs font-medium text-slate-400">Channel</label>
                        <select id="wl-chan-id" class="input-field">
                            ${buildTextChannelOptions(w.channelId, { allowNone: true, noneLabel: '— Select channel —' })}
                        </select>
                    </div>

                    <div class="grid grid-cols-12 gap-3">
                        <div class="col-span-9 space-y-1.5">
                            <label class="text-xs font-medium text-slate-400">Title</label>
                            <input id="wl-chan-title" type="text" maxlength="256" class="wl-target-input input-field" value="${escapeHtml(w.channelTitle || '')}" />
                        </div>
                        <div class="col-span-3 space-y-1.5">
                            <label class="text-xs font-medium text-slate-400">Color</label>
                            <input id="wl-chan-color" type="color" class="w-full h-[42px] rounded-xl bg-bg-base border border-slate-700 cursor-pointer p-1" value="${escapeHtml(w.channelColor || '#5865F2')}" />
                        </div>
                    </div>

                    <div class="space-y-1.5">
                        <label class="text-xs font-medium text-slate-400">Text</label>
                        <textarea id="wl-chan-desc" rows="4" maxlength="4000" class="wl-target-input input-field resize-y">${escapeHtml(w.channelDescription || '')}</textarea>
                    </div>

                    <div class="flex items-center justify-between gap-3 pt-1">
                        <span class="text-xs text-slate-300">Member avatar</span>
                        ${renderToggleSwitch('wl-chan-avatar', w.channelShowAvatar !== false)}
                    </div>

                    <div class="flex justify-end pt-2 mt-auto">
                        <button type="button" data-wl-test="channel" class="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-bg-elevated hover:bg-bg-hover border border-slate-700 text-xs font-medium text-slate-200 transition">
                            <i data-lucide="send" class="w-3.5 h-3.5"></i>
                            <span>Test</span>
                        </button>
                    </div>
                </div>

                <div class="card p-6 flex flex-col space-y-4">
                    <div class="flex items-center justify-between gap-3 pb-3 border-b border-slate-800">
                        <h4 class="text-sm font-semibold text-white flex items-center gap-2">
                            <i data-lucide="mail" class="w-4 h-4 text-emerald-400"></i>
                            <span>Direct message</span>
                        </h4>
                        ${renderToggleSwitch('wl-dm-enabled', w.dmEnabled)}
                    </div>

                    <div class="grid grid-cols-12 gap-3">
                        <div class="col-span-9 space-y-1.5">
                            <label class="text-xs font-medium text-slate-400">Title</label>
                            <input id="wl-dm-title" type="text" maxlength="256" class="wl-target-input input-field" value="${escapeHtml(w.dmTitle || '')}" />
                        </div>
                        <div class="col-span-3 space-y-1.5">
                            <label class="text-xs font-medium text-slate-400">Color</label>
                            <input id="wl-dm-color" type="color" class="w-full h-[42px] rounded-xl bg-bg-base border border-slate-700 cursor-pointer p-1" value="${escapeHtml(w.dmColor || '#57F287')}" />
                        </div>
                    </div>

                    <div class="space-y-1.5">
                        <label class="text-xs font-medium text-slate-400">Text</label>
                        <textarea id="wl-dm-desc" rows="5" maxlength="4000" class="wl-target-input input-field resize-y">${escapeHtml(w.dmDescription || '')}</textarea>
                    </div>

                    <div class="flex justify-end pt-2 mt-auto">
                        <button type="button" data-wl-test="dm" class="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-bg-elevated hover:bg-bg-hover border border-slate-700 text-xs font-medium text-slate-200 transition">
                            <i data-lucide="send" class="w-3.5 h-3.5"></i>
                            <span>Test</span>
                        </button>
                    </div>
                </div>
            </div>

            <div class="card p-6 space-y-4">
                <div class="flex items-center justify-between gap-3 pb-3 border-b border-slate-800">
                    <h4 class="text-sm font-semibold text-white flex items-center gap-2">
                        <i data-lucide="log-out" class="w-4 h-4 text-red-400"></i>
                        <span>Goodbye message</span>
                    </h4>
                    ${renderToggleSwitch('wl-gb-enabled', w.goodbyeEnabled)}
                </div>

                <div class="grid grid-cols-1 md:grid-cols-12 gap-4">
                    <div class="md:col-span-4 space-y-1.5">
                        <label class="text-xs font-medium text-slate-400">Channel</label>
                        <select id="wl-gb-id" class="input-field">
                            ${buildTextChannelOptions(w.goodbyeChannelId, { allowNone: true, noneLabel: '— Select channel —' })}
                        </select>
                    </div>
                    <div class="md:col-span-6 space-y-1.5">
                        <label class="text-xs font-medium text-slate-400">Title</label>
                        <input id="wl-gb-title" type="text" maxlength="256" class="wl-target-input input-field" value="${escapeHtml(w.goodbyeTitle || '')}" />
                    </div>
                    <div class="md:col-span-2 space-y-1.5">
                        <label class="text-xs font-medium text-slate-400">Color</label>
                        <input id="wl-gb-color" type="color" class="w-full h-[42px] rounded-xl bg-bg-base border border-slate-700 cursor-pointer p-1" value="${escapeHtml(w.goodbyeColor || '#ED4245')}" />
                    </div>
                </div>

                <div class="space-y-1.5">
                    <label class="text-xs font-medium text-slate-400">Text</label>
                    <textarea id="wl-gb-desc" rows="2" maxlength="4000" class="wl-target-input input-field resize-y">${escapeHtml(w.goodbyeDescription || '')}</textarea>
                </div>

                <div class="flex justify-end pt-1">
                    <button type="button" data-wl-test="goodbye" class="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-bg-elevated hover:bg-bg-hover border border-slate-700 text-xs font-medium text-slate-200 transition">
                        <i data-lucide="send" class="w-3.5 h-3.5"></i>
                        <span>Test</span>
                    </button>
                </div>
            </div>

            <div class="flex justify-end">
                <button id="wl-save-btn" type="submit" class="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand hover:bg-brand-hover text-white text-sm font-semibold transition">
                    <i data-lucide="save" class="w-4 h-4"></i>
                    <span>Save</span>
                </button>
            </div>
        </form>
    `;

    let lastFocusedEl = document.getElementById('wl-chan-desc');
    container.querySelectorAll('.wl-target-input').forEach(el => {
        el.addEventListener('focus', () => { lastFocusedEl = el; });
    });

    container.querySelectorAll('.wl-var-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            const target = lastFocusedEl || document.getElementById('wl-chan-desc');
            if (!target) return;
            const token = chip.dataset.var || '';
            const start = typeof target.selectionStart === 'number' ? target.selectionStart : target.value.length;
            const end = typeof target.selectionEnd === 'number' ? target.selectionEnd : target.value.length;
            target.value = `${target.value.slice(0, start)}${token}${target.value.slice(end)}`;
            target.focus();
            const pos = start + token.length;
            target.setSelectionRange(pos, pos);
            setDirty(true, 'wl-form');
        });
    });

    container.querySelectorAll('[data-wl-test]').forEach(btn => {
        btn.addEventListener('click', async () => {
            const target = btn.dataset.wlTest;
            await setButtonLoading(btn, true, 'Sending...');
            try {
                await apiFetch('/api/welcome/test', {
                    method: 'POST',
                    body: JSON.stringify({ target })
                });
                showToast(target === 'dm' ? 'Test DM sent.' : 'Test message sent to channel.');
            } catch (err) {
                showToast(err.message, 'error');
            } finally {
                await setButtonLoading(btn, false);
            }
        });
    });

    document.getElementById('wl-form').addEventListener('submit', async e => {
        e.preventDefault();
        const btn = document.getElementById('wl-save-btn');
        await setButtonLoading(btn, true, 'Saving...');
        try {
            const res = await apiFetch('/api/settings/welcome', {
                method: 'PUT',
                body: JSON.stringify({
                    enabled: document.getElementById('wl-enabled').checked,
                    ignoreBots: document.getElementById('wl-ignore-bots').checked,
                    channelEnabled: document.getElementById('wl-chan-enabled').checked,
                    channelId: document.getElementById('wl-chan-id').value || null,
                    channelTitle: document.getElementById('wl-chan-title').value,
                    channelColor: document.getElementById('wl-chan-color').value,
                    channelDescription: document.getElementById('wl-chan-desc').value,
                    channelShowAvatar: document.getElementById('wl-chan-avatar').checked,
                    dmEnabled: document.getElementById('wl-dm-enabled').checked,
                    dmTitle: document.getElementById('wl-dm-title').value,
                    dmColor: document.getElementById('wl-dm-color').value,
                    dmDescription: document.getElementById('wl-dm-desc').value,
                    goodbyeEnabled: document.getElementById('wl-gb-enabled').checked,
                    goodbyeChannelId: document.getElementById('wl-gb-id').value || null,
                    goodbyeTitle: document.getElementById('wl-gb-title').value,
                    goodbyeColor: document.getElementById('wl-gb-color').value,
                    goodbyeDescription: document.getElementById('wl-gb-desc').value
                })
            });
            state.settings.welcome = res.welcome;
            setDirty(false);
            await refreshOverviewOnly();
            showToast('Welcome settings saved.');
        } catch (err) {
            showToast(err.message, 'error');
        } finally {
            await setButtonLoading(btn, false);
        }
    });

    bindDirtyForm('wl-form');
    refreshIcons();
}

// --- TICKETS ---

function readTicketRolesDraftFromDom() {
    const selects = document.querySelectorAll('#tk-roles-list .tk-role-select');
    if (document.getElementById('tk-roles-list')) {
        state.ticketDraftSupportRoleIds = [...selects].map(s => s.value);
    }
}

function buildTicketSupportRoleRowsHtml(roleIds) {
    if (!Array.isArray(roleIds) || roleIds.length === 0) {
        return `<p class="text-xs text-slate-400 py-1.5">No role.</p>`;
    }

    return roleIds.map((roleId, idx) => `
        <div class="flex items-center gap-2">
            <select class="tk-role-select input-field flex-1">
                ${buildRoleOptions(roleId, { allowNone: true, noneLabel: '— Select role —' })}
            </select>
            <button type="button" data-tk-remove-role="${idx}" title="Remove role" class="p-2.5 rounded-xl bg-red-500/15 hover:bg-red-500/25 border border-red-500/30 text-red-300 transition shrink-0">
                <i data-lucide="trash-2" class="w-4 h-4"></i>
            </button>
        </div>
    `).join('');
}

function attachTicketRoleListeners() {
    document.querySelectorAll('[data-tk-remove-role]').forEach(btn => {
        btn.addEventListener('click', () => {
            readTicketRolesDraftFromDom();
            state.ticketDraftSupportRoleIds.splice(Number(btn.dataset.tkRemoveRole), 1);
            document.getElementById('tk-roles-list').innerHTML = buildTicketSupportRoleRowsHtml(state.ticketDraftSupportRoleIds);
            attachTicketRoleListeners();
            setDirty(true, 'tk-form');
            refreshIcons();
        });
    });
}

function renderOpenTicketsList() {
    const list = state.openTickets || [];
    if (list.length === 0) {
        return `<p class="text-sm text-slate-400 py-4 text-center">No open tickets.</p>`;
    }

    return list.map(t => `
        <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 rounded-xl bg-bg-elevated/80 border border-slate-800">
            <div class="flex items-start gap-3 min-w-0">
                <img src="${escapeHtml(t.userAvatar)}" alt="" class="w-9 h-9 rounded-full object-cover bg-bg-base shrink-0" />
                <div class="min-w-0">
                    <div class="flex flex-wrap items-center gap-2">
                        <span class="px-2 py-0.5 rounded-md bg-brand/15 text-brand text-xs font-bold">#${String(t.number).padStart(3, '0')}</span>
                        <span class="font-semibold text-white text-sm truncate">${escapeHtml(t.subject)}</span>
                        ${t.claimedByName ? `<span class="px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-[11px] font-medium text-emerald-300">${escapeHtml(t.claimedByName)}</span>` : `<span class="px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-[11px] font-medium text-amber-300">Unclaimed</span>`}
                    </div>
                    <div class="text-xs text-slate-400 mt-1">
                        ${escapeHtml(t.userName)} · <span class="font-mono text-slate-300">#${escapeHtml(t.channelName)}</span> · ${escapeHtml(new Date(t.createdAt).toLocaleString('en-GB'))}
                    </div>
                </div>
            </div>
            <div class="shrink-0">
                <button type="button" data-tk-close="${escapeHtml(t.channelId)}" data-tk-num="${String(t.number).padStart(3, '0')}" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/15 hover:bg-red-500/25 border border-red-500/30 text-xs font-medium text-red-300 transition">
                    <i data-lucide="lock" class="w-3.5 h-3.5"></i>
                    <span>Close</span>
                </button>
            </div>
        </div>
    `).join('');
}

function attachOpenTicketListeners() {
    document.querySelectorAll('[data-tk-close]').forEach(btn => {
        btn.addEventListener('click', async () => {
            const channelId = btn.dataset.tkClose;
            const num = btn.dataset.tkNum;
            const ok = await confirmAction({
                title: `Close ticket #${num}?`,
                message: 'A transcript will be saved to the log channel and the ticket channel will be deleted.',
                confirmLabel: 'Close ticket'
            });
            if (!ok) return;

            await setButtonLoading(btn, true, 'Closing...');
            try {
                await apiFetch(`/api/tickets/${encodeURIComponent(channelId)}`, { method: 'DELETE' });
                await refreshOpenTickets();
                showToast(`Ticket #${num} closed.`);
            } catch (err) {
                showToast(err.message, 'error');
                await setButtonLoading(btn, false);
            }
        });
    });
}

function patchOpenTicketsDom() {
    const heading = document.getElementById('tk-open-heading');
    if (heading) {
        heading.textContent = `Open tickets (${state.openTickets.length})`;
    }
    const listEl = document.getElementById('tk-open-list');
    if (!listEl || listEl.querySelector('button:disabled')) return;

    const nextHtml = renderOpenTicketsList();
    if (nextHtml !== lastTicketsHtml) {
        lastTicketsHtml = nextHtml;
        listEl.innerHTML = nextHtml;
        attachOpenTicketListeners();
        refreshIcons();
    }
}

async function refreshOpenTickets() {
    const data = await apiFetch('/api/tickets/open');
    state.openTickets = data.openTickets || [];
    if (document.getElementById('tk-open-list')) {
        patchOpenTicketsDom();
    }
}

function renderTickets() {
    const container = document.getElementById('section-tickets');
    const tk = state.settings?.tickets || {};

    container.innerHTML = `
        <div class="card p-6">
            <h3 class="text-base font-semibold text-white mb-5 flex items-center gap-2">
                <i data-lucide="ticket" class="w-4 h-4 text-brand"></i>
                <span>Tickets</span>
            </h3>

            <form id="tk-form" class="space-y-5">
                <div class="flex items-center justify-between gap-4 p-4 rounded-xl bg-bg-elevated border border-slate-800">
                    <div class="text-sm font-semibold text-white">Enable Tickets</div>
                    ${renderToggleSwitch('tk-enabled', tk.enabled)}
                </div>

                <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div class="space-y-1.5">
                        <label class="text-xs font-medium text-slate-400">Category</label>
                        <select id="tk-category" class="input-field">
                            ${buildCategoryOptions(tk.categoryId)}
                        </select>
                    </div>
                    <div class="space-y-1.5">
                        <label class="text-xs font-medium text-slate-400">Log channel</label>
                        <select id="tk-log-channel" class="input-field">
                            ${buildTextChannelOptions(tk.logChannelId, { allowNone: true, noneLabel: '— None —' })}
                        </select>
                    </div>
                    <div class="space-y-1.5">
                        <label class="text-xs font-medium text-slate-400">Panel channel</label>
                        <select id="tk-panel-channel" class="input-field">
                            ${buildTextChannelOptions(tk.panelChannelId, { allowNone: true, noneLabel: '— Select channel —' })}
                        </select>
                    </div>
                </div>

                <div class="p-4 rounded-2xl bg-bg-elevated/60 border border-slate-800 space-y-3">
                    <div class="flex items-center gap-2 text-sm font-semibold text-white">
                        <i data-lucide="shield" class="w-4 h-4 text-sky-400"></i>
                        <span>Support roles</span>
                    </div>
                    <div id="tk-roles-list" class="space-y-2">
                        ${buildTicketSupportRoleRowsHtml(state.ticketDraftSupportRoleIds)}
                    </div>
                    ${renderAddButtonHtml('tk-add-role-btn', 'Add role')}
                </div>

                <div class="p-4 rounded-2xl bg-bg-elevated/60 border border-slate-800 space-y-4">
                    <div class="text-sm font-semibold text-white flex items-center gap-2">
                        <i data-lucide="layout-template" class="w-4 h-4 text-brand-gold"></i>
                        <span>Ticket panel</span>
                    </div>

                    <div class="grid grid-cols-1 md:grid-cols-12 gap-4">
                        <div class="md:col-span-6 space-y-1.5">
                            <label class="text-xs font-medium text-slate-400">Title</label>
                            <input id="tk-panel-title" type="text" maxlength="256" required class="input-field" value="${escapeHtml(tk.panelTitle || '')}" />
                        </div>
                        <div class="md:col-span-4 space-y-1.5">
                            <label class="text-xs font-medium text-slate-400">Button</label>
                            <input id="tk-panel-btn" type="text" maxlength="80" required class="input-field" value="${escapeHtml(tk.panelButtonLabel || '')}" />
                        </div>
                        <div class="md:col-span-2 space-y-1.5">
                            <label class="text-xs font-medium text-slate-400">Color</label>
                            <input id="tk-panel-color" type="color" class="w-full h-[42px] rounded-xl bg-bg-base border border-slate-700 cursor-pointer p-1" value="${escapeHtml(tk.panelColor || '#5865F2')}" />
                        </div>
                    </div>

                    <div class="space-y-1.5">
                        <label class="text-xs font-medium text-slate-400">Description</label>
                        <textarea id="tk-panel-desc" rows="3" maxlength="4000" required class="input-field resize-y">${escapeHtml(tk.panelDescription || '')}</textarea>
                    </div>
                </div>

                <div class="flex flex-wrap items-center justify-end gap-3 pt-1">
                    <button id="tk-send-panel-btn" type="button" class="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-bg-elevated hover:bg-bg-hover border border-slate-700 text-sm font-medium text-slate-200 transition">
                        <i data-lucide="send" class="w-4 h-4 text-sky-400"></i>
                        <span>${tk.panelMessageId ? 'Update panel' : 'Send panel'}</span>
                    </button>
                    <button id="tk-save-btn" type="submit" class="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand hover:bg-brand-hover text-white text-sm font-semibold transition">
                        <i data-lucide="save" class="w-4 h-4"></i>
                        <span>Save</span>
                    </button>
                </div>
            </form>
        </div>

        <div class="card p-6">
            <div class="flex items-center justify-between gap-3 mb-4">
                <h3 id="tk-open-heading" class="text-base font-semibold text-white">Open tickets (${state.openTickets.length})</h3>
                <button id="tk-refresh-open" type="button" class="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-bg-elevated hover:bg-bg-hover border border-slate-700 text-xs font-medium text-slate-200 transition">
                    <i data-lucide="refresh-cw" class="w-3.5 h-3.5"></i>
                    <span>Refresh</span>
                </button>
            </div>
            <div id="tk-open-list" class="space-y-3">${renderOpenTicketsList()}</div>
        </div>
    `;

    document.getElementById('tk-add-role-btn').addEventListener('click', () => {
        readTicketRolesDraftFromDom();
        state.ticketDraftSupportRoleIds.push('');
        document.getElementById('tk-roles-list').innerHTML = buildTicketSupportRoleRowsHtml(state.ticketDraftSupportRoleIds);
        attachTicketRoleListeners();
        setDirty(true, 'tk-form');
        refreshIcons();
    });

    async function saveTicketConfig() {
        readTicketRolesDraftFromDom();
        const res = await apiFetch('/api/settings/tickets', {
            method: 'PUT',
            body: JSON.stringify({
                enabled: document.getElementById('tk-enabled').checked,
                categoryId: document.getElementById('tk-category').value || null,
                logChannelId: document.getElementById('tk-log-channel').value || null,
                panelChannelId: document.getElementById('tk-panel-channel').value || null,
                supportRoleIds: state.ticketDraftSupportRoleIds.filter(Boolean),
                panelTitle: document.getElementById('tk-panel-title').value,
                panelButtonLabel: document.getElementById('tk-panel-btn').value,
                panelColor: document.getElementById('tk-panel-color').value,
                panelDescription: document.getElementById('tk-panel-desc').value
            })
        });
        state.settings.tickets = res.tickets;
        syncDraftsFromSettings();
        setDirty(false);
    }

    document.getElementById('tk-form').addEventListener('submit', async e => {
        e.preventDefault();
        const btn = document.getElementById('tk-save-btn');
        await setButtonLoading(btn, true, 'Saving...');
        try {
            await saveTicketConfig();
            await refreshOverviewOnly();
            renderTickets();
            showToast('Ticket settings saved.');
        } catch (err) {
            showToast(err.message, 'error');
        } finally {
            await setButtonLoading(btn, false);
        }
    });

    document.getElementById('tk-send-panel-btn').addEventListener('click', async e => {
        const btn = e.currentTarget;
        await setButtonLoading(btn, true, 'Sending...');
        try {
            await saveTicketConfig();
            const res = await apiFetch('/api/tickets/panel', { method: 'POST' });
            state.settings.tickets = res.tickets;
            renderTickets();
            showToast('Ticket panel sent / updated in channel.');
        } catch (err) {
            showToast(err.message, 'error');
        } finally {
            await setButtonLoading(btn, false);
        }
    });

    document.getElementById('tk-refresh-open').addEventListener('click', async e => {
        const btn = e.currentTarget;
        await setButtonLoading(btn, true, '...');
        try {
            await refreshOpenTickets();
            showToast('Open tickets refreshed.', 'info');
        } catch (err) {
            showToast(err.message, 'error');
        } finally {
            await setButtonLoading(btn, false);
        }
    });

    attachTicketRoleListeners();
    attachOpenTicketListeners();
    bindDirtyForm('tk-form');
    refreshIcons();
}

// --- GENERAL SETTINGS + BOT STATUS + RANK ROLES ---

function readDashboardRolesDraftFromDom() {
    const selects = document.querySelectorAll('#set-dashboard-roles-list .set-dashboard-role-select');
    if (document.getElementById('set-dashboard-roles-list')) {
        state.dashboardDraftRoleIds = [...selects].map(s => s.value);
    }
}

function buildDashboardRoleRowsHtml(roleIds) {
    if (roleIds.length === 0) {
        return `<p class="text-xs text-slate-400 py-2">No role.</p>`;
    }

    return roleIds.map((roleId, idx) => `
        <div class="flex items-center gap-2">
            <select class="set-dashboard-role-select input-field flex-1">
                ${buildRoleOptions(roleId, { allowNone: true, noneLabel: '— Select role —' })}
            </select>
            <button type="button" data-set-remove-dashboard-role="${idx}" title="Remove role" class="p-2.5 rounded-xl bg-red-500/15 hover:bg-red-500/25 border border-red-500/30 text-red-300 transition shrink-0">
                <i data-lucide="trash-2" class="w-4 h-4"></i>
            </button>
        </div>
    `).join('');
}

function attachDashboardRoleRowListeners() {
    document.querySelectorAll('[data-set-remove-dashboard-role]').forEach(btn => {
        btn.addEventListener('click', () => {
            readDashboardRolesDraftFromDom();
            state.dashboardDraftRoleIds.splice(Number(btn.dataset.setRemoveDashboardRole), 1);
            document.getElementById('set-dashboard-roles-list').innerHTML = buildDashboardRoleRowsHtml(
                state.dashboardDraftRoleIds
            );
            attachDashboardRoleRowListeners();
            setDirty(true, 'general-settings-form');
            refreshIcons();
        });
    });
}

function readAllowedChannelBypassRolesDraftFromDom() {
    const selects = document.querySelectorAll('#set-bypass-roles-list .set-bypass-role-select');
    if (document.getElementById('set-bypass-roles-list')) {
        state.allowedChannelBypassDraftRoleIds = [...selects].map(s => s.value);
    }
}

function buildAllowedChannelBypassRoleRowsHtml(roleIds) {
    if (roleIds.length === 0) {
        return `<p class="text-xs text-slate-400 py-2">No role.</p>`;
    }

    return roleIds.map((roleId, idx) => `
        <div class="flex items-center gap-2">
            <select class="set-bypass-role-select input-field flex-1">
                ${buildRoleOptions(roleId, { allowNone: true, noneLabel: '— Select role —' })}
            </select>
            <button type="button" data-set-remove-bypass-role="${idx}" title="Remove role" class="p-2.5 rounded-xl bg-red-500/15 hover:bg-red-500/25 border border-red-500/30 text-red-300 transition shrink-0">
                <i data-lucide="trash-2" class="w-4 h-4"></i>
            </button>
        </div>
    `).join('');
}

function attachAllowedChannelBypassRoleRowListeners() {
    document.querySelectorAll('[data-set-remove-bypass-role]').forEach(btn => {
        btn.addEventListener('click', () => {
            readAllowedChannelBypassRolesDraftFromDom();
            state.allowedChannelBypassDraftRoleIds.splice(Number(btn.dataset.setRemoveBypassRole), 1);
            document.getElementById('set-bypass-roles-list').innerHTML = buildAllowedChannelBypassRoleRowsHtml(
                state.allowedChannelBypassDraftRoleIds
            );
            attachAllowedChannelBypassRoleRowListeners();
            setDirty(true, 'general-settings-form');
            refreshIcons();
        });
    });
}

function renderSettings() {
    const container = document.getElementById('section-settings');
    const s = state.settings || {};
    const statusText = typeof s.botStatus?.text === 'string' ? s.botStatus.text : '';
    const statusPreview = resolveBotStatusPreview(statusText);
    const rankRoles = Array.isArray(s.rankRoles) ? s.rankRoles : [];
    const ru = s.rankUpdater || {};
    const ruStatus = state.rankUpdaterStatus || null;
    const ruRateLimited = Boolean(ruStatus?.rateLimitedUntil && ruStatus.rateLimitedUntil > Date.now());

    container.innerHTML = `
        <form id="general-settings-form" class="space-y-6">
            <div class="card p-6 space-y-5">
                <h3 class="text-base font-semibold text-white flex items-center gap-2">
                    <i data-lucide="shield" class="w-4 h-4 text-brand"></i>
                    <span>Access & commands</span>
                </h3>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-5 items-start">
                    <div class="p-4 rounded-2xl bg-bg-elevated/60 border border-slate-800 space-y-3">
                        <div class="flex items-center gap-2 text-sm font-semibold text-white">
                            <i data-lucide="user-check" class="w-4 h-4 text-brand"></i>
                            <span>Dashboard access</span>
                        </div>
                        <div id="set-dashboard-roles-list" class="space-y-2">
                            ${buildDashboardRoleRowsHtml(state.dashboardDraftRoleIds)}
                        </div>
                        ${renderAddButtonHtml('set-add-dashboard-role-btn', 'Add role')}
                        <p class="text-xs text-slate-500">Bot owner always has access.</p>
                    </div>

                    <div class="p-4 rounded-2xl bg-bg-elevated/60 border border-slate-800 space-y-3">
                        <div class="flex items-center gap-2 text-sm font-semibold text-white">
                            <i data-lucide="terminal" class="w-4 h-4 text-sky-400"></i>
                            <span>Commands channel</span>
                        </div>
                        <select id="set-allowed-channel" class="input-field">
                            ${buildTextChannelOptions(s.allowedChannelId, { allowNone: true, noneLabel: '— All channels —' })}
                        </select>
                        <div id="set-bypass-roles-wrap" class="pt-2 border-t border-slate-800/80 space-y-2.5 ${s.allowedChannelId ? '' : 'hidden'}">
                            <div class="text-xs font-medium text-slate-400">Bypass roles</div>
                            <div id="set-bypass-roles-list" class="space-y-2">
                                ${buildAllowedChannelBypassRoleRowsHtml(state.allowedChannelBypassDraftRoleIds)}
                            </div>
                            ${renderAddButtonHtml('set-add-bypass-role-btn', 'Add role')}
                        </div>
                    </div>
                </div>
            </div>

            <div class="card p-6 space-y-4">
                <h3 class="text-base font-semibold text-white flex items-center gap-2">
                    <i data-lucide="sparkles" class="w-4 h-4 text-sky-400"></i>
                    <span>Bot status</span>
                </h3>

                <div class="space-y-2">
                    <label for="set-status-text" class="text-xs font-medium text-slate-400">Text</label>
                    <input id="set-status-text" type="text" maxlength="128" class="input-field" value="${escapeHtml(statusText)}" />
                </div>

                <div class="space-y-2">
                    <p class="text-xs font-medium text-slate-400">Variables:</p>
                    <div class="flex flex-wrap gap-2">
                        ${BOT_STATUS_VARIABLES.map(v => `
                            <button type="button" class="status-var-chip inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-bg-elevated hover:bg-bg-hover border border-slate-700/80 hover:border-brand/60 text-xs transition" data-var="${escapeHtml(v.token)}">
                                <code class="text-sky-300 font-semibold">${escapeHtml(v.token)}</code>
                                <span class="text-slate-400">${escapeHtml(v.label)}</span>
                            </button>
                        `).join('')}
                    </div>
                    <p class="text-xs text-slate-400">
                        Plurals: <code class="text-sky-300">{players:player|players}</code> or <code class="text-sky-300">{rooms:room|rooms}</code>
                    </p>
                </div>

                <div class="rounded-xl bg-bg-elevated/70 border border-slate-800 px-3.5 py-2.5 flex items-center justify-between gap-3">
                    <span class="text-xs font-medium text-slate-400">Preview:</span>
                    <span id="set-status-preview" class="text-xs font-medium ${statusPreview ? 'text-slate-200' : 'text-slate-500 italic'} truncate">
                        ${statusPreview ? escapeHtml(statusPreview) : 'No status'}
                    </span>
                </div>
            </div>

            <div class="card p-6 space-y-5">
                <div class="flex flex-wrap items-center justify-between gap-3">
                    <h3 class="text-base font-semibold text-white flex items-center gap-2">
                        <i data-lucide="refresh-cw" class="w-4 h-4 text-emerald-400"></i>
                        <span>Rank updates</span>
                    </h3>
                    <div class="flex flex-wrap items-center gap-2 text-xs">
                        <span class="px-2.5 py-1 rounded-full ${state.steamApiKeyConfigured ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30' : 'bg-amber-500/15 text-amber-300 border border-amber-500/30'}">
                            Steam API: ${state.steamApiKeyConfigured ? 'Connected' : 'Missing key'}
                        </span>
                        ${ruStatus ? `<span id="set-ru-playing-badge" class="px-2.5 py-1 rounded-full bg-bg-elevated border border-slate-700/80 text-slate-300">In CS2: ${ruStatus.playingCount}</span>` : ''}
                        <span id="set-ru-rl-badge" class="${ruRateLimited ? '' : 'hidden '}px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30">Rate limited</span>
                    </div>
                </div>

                <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div class="space-y-1.5">
                        <label for="set-ru-active" class="text-xs font-medium text-slate-400">In game</label>
                        <div class="relative">
                            <input id="set-ru-active" type="number" min="3" max="30" step="1" class="input-field pr-12" value="${ru.activeIntervalMinutes ?? 5}" />
                            <span class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">min</span>
                        </div>
                    </div>
                    <div class="space-y-1.5">
                        <label for="set-ru-postmatch" class="text-xs font-medium text-slate-400">Post-match</label>
                        <div class="relative">
                            <input id="set-ru-postmatch" type="number" min="2" max="15" step="1" class="input-field pr-12" value="${ru.postMatchDelayMinutes ?? 4}" />
                            <span class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">min</span>
                        </div>
                    </div>
                    <div class="space-y-1.5">
                        <label for="set-ru-bg" class="text-xs font-medium text-slate-400">Background</label>
                        <div class="relative">
                            <input id="set-ru-bg" type="number" min="15" max="720" step="1" class="input-field pr-12" value="${ru.backgroundIntervalMinutes ?? 60}" />
                            <span class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">min</span>
                        </div>
                    </div>
                    <div class="space-y-1.5">
                        <label for="set-ru-inactive" class="text-xs font-medium text-slate-400">Inactive</label>
                        <div class="relative">
                            <input id="set-ru-inactive" type="number" min="6" max="48" step="1" class="input-field pr-10" value="${ru.inactiveIntervalHours ?? 12}" />
                            <span class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">h</span>
                        </div>
                    </div>
                </div>

                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div class="flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-bg-elevated/60 border border-slate-800">
                        <span class="text-sm font-medium text-white">Steam API</span>
                        ${renderToggleSwitch('set-ru-steam', ru.useSteamApi !== false)}
                    </div>
                    <div class="flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-bg-elevated/60 border border-slate-800">
                        <span class="text-sm font-medium text-white">Discord activity</span>
                        ${renderToggleSwitch('set-ru-discord', ru.useDiscordPresence !== false)}
                    </div>
                </div>
            </div>

            <div class="card p-6 space-y-5">
                <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <h3 class="text-base font-semibold text-white flex items-center gap-2">
                        <i data-lucide="award" class="w-4 h-4 text-brand-gold"></i>
                        <span>CS2 rank roles</span>
                    </h3>
                    <button id="add-rank-row-btn" type="button" class="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-bg-elevated hover:bg-bg-hover border border-slate-700 text-xs font-medium text-slate-200 transition">
                        <i data-lucide="plus" class="w-3.5 h-3.5"></i>
                        <span>Add tier</span>
                    </button>
                </div>

                <div class="p-4 rounded-xl bg-bg-elevated border border-slate-800 grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
                    <div class="md:col-span-4 text-sm font-semibold text-slate-200">Unranked</div>
                    <div class="md:col-span-8">
                        <select id="set-unranked-role" class="input-field">
                            ${buildRoleOptions(s.unrankedRoleId, { allowNone: false })}
                        </select>
                    </div>
                </div>

                <div class="overflow-x-auto">
                    <table class="w-full text-left border-collapse">
                        <thead>
                            <tr class="text-xs uppercase tracking-wider text-slate-400 border-b border-slate-800">
                                <th class="py-2.5 pr-3 font-medium">Color</th>
                                <th class="py-2.5 px-3 font-medium">Min Elo</th>
                                <th class="py-2.5 px-3 font-medium">Discord role</th>
                                <th class="py-2.5 pl-3 font-medium text-right">Action</th>
                            </tr>
                        </thead>
                        <tbody id="rank-roles-tbody">
                            ${rankRoles.map(r => buildRankRowHtml(r)).join('')}
                        </tbody>
                    </table>
                </div>
            </div>

            <div class="flex justify-end">
                <button id="settings-save-btn" type="submit" class="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand hover:bg-brand-hover text-white text-sm font-semibold transition">
                    <i data-lucide="save" class="w-4 h-4"></i>
                    <span>Save</span>
                </button>
            </div>
        </form>

        <div class="card p-6 space-y-4">
            <h3 class="text-base font-semibold text-white flex items-center gap-2">
                <i data-lucide="archive" class="w-4 h-4 text-emerald-400"></i>
                <span>Backup & restore</span>
            </h3>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button id="set-backup-btn" type="button" class="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/35 text-emerald-200 text-sm font-medium transition">
                    <i data-lucide="archive" class="w-4 h-4"></i>
                    <span>Backup</span>
                </button>

                <div>
                    <input id="set-restore-file" type="file" accept=".json,application/json" class="hidden" />
                    <button id="set-restore-btn" type="button" class="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-dashed border-slate-700 hover:border-amber-400/70 bg-bg-elevated/60 hover:bg-amber-500/10 text-slate-200 text-sm font-medium transition">
                        <i data-lucide="upload" class="w-4 h-4 text-amber-400"></i>
                        <span>Restore backup</span>
                    </button>
                </div>
            </div>
        </div>
    `;

    const textInput = document.getElementById('set-status-text');
    const statusPreviewEl = document.getElementById('set-status-preview');

    function syncStatusPreview() {
        if (!statusPreviewEl || !textInput) return;
        const resolved = resolveBotStatusPreview(textInput.value);
        if (resolved) {
            statusPreviewEl.textContent = resolved;
            statusPreviewEl.className = 'text-xs font-medium text-slate-200 truncate';
        } else {
            statusPreviewEl.textContent = 'No status';
            statusPreviewEl.className = 'text-xs font-medium text-slate-500 italic truncate';
        }
    }

    if (textInput) {
        textInput.addEventListener('input', syncStatusPreview);
    }

    document.querySelectorAll('.status-var-chip').forEach(btn => {
        btn.addEventListener('click', () => {
            if (!textInput) return;
            const token = btn.dataset.var || '';
            const start = typeof textInput.selectionStart === 'number' ? textInput.selectionStart : textInput.value.length;
            const end = typeof textInput.selectionEnd === 'number' ? textInput.selectionEnd : textInput.value.length;
            const before = textInput.value.slice(0, start);
            const after = textInput.value.slice(end);
            const updated = `${before}${token}${after}`.slice(0, 128);
            textInput.value = updated;
            const nextCursor = Math.min(start + token.length, updated.length);
            textInput.focus();
            textInput.setSelectionRange(nextCursor, nextCursor);
            syncStatusPreview();
            setDirty(true, 'general-settings-form');
        });
    });

    document.getElementById('set-add-dashboard-role-btn').addEventListener('click', () => {
        readDashboardRolesDraftFromDom();
        state.dashboardDraftRoleIds.push('');
        document.getElementById('set-dashboard-roles-list').innerHTML = buildDashboardRoleRowsHtml(
            state.dashboardDraftRoleIds
        );
        attachDashboardRoleRowListeners();
        setDirty(true, 'general-settings-form');
        refreshIcons();
    });

    document.getElementById('set-allowed-channel')?.addEventListener('change', e => {
        const wrap = document.getElementById('set-bypass-roles-wrap');
        if (wrap) {
            wrap.classList.toggle('hidden', !e.target.value);
        }
    });

    document.getElementById('set-add-bypass-role-btn')?.addEventListener('click', () => {
        readAllowedChannelBypassRolesDraftFromDom();
        state.allowedChannelBypassDraftRoleIds.push('');
        document.getElementById('set-bypass-roles-list').innerHTML = buildAllowedChannelBypassRoleRowsHtml(
            state.allowedChannelBypassDraftRoleIds
        );
        attachAllowedChannelBypassRoleRowListeners();
        setDirty(true, 'general-settings-form');
        refreshIcons();
    });

    attachDashboardRoleRowListeners();
    attachAllowedChannelBypassRoleRowListeners();
    attachRankRowDeleteListeners();

    document.getElementById('add-rank-row-btn').addEventListener('click', () => {
        const tbody = document.getElementById('rank-roles-tbody');
        const tr = document.createElement('tr');
        tr.className = 'rank-row border-b border-slate-800/70';
        tr.innerHTML = buildRankRowCells({ min: 1000, roleId: '', color: 0x5E98D9 });
        tbody.appendChild(tr);
        attachRankRowDeleteListeners();
        setDirty(true, 'general-settings-form');
        refreshIcons();
    });

    document.getElementById('general-settings-form').addEventListener('submit', async e => {
        e.preventDefault();
        const btn = document.getElementById('settings-save-btn');
        readDashboardRolesDraftFromDom();
        readAllowedChannelBypassRolesDraftFromDom();

        const rankRows = [...document.querySelectorAll('#rank-roles-tbody .rank-row')].map(row => ({
            color: row.querySelector('.rank-color-input').value,
            min: Number(row.querySelector('.rank-min-input').value),
            roleId: row.querySelector('.rank-role-select').value
        }));

        await setButtonLoading(btn, true, 'Saving...');
        try {
            const res = await apiFetch('/api/settings/general', {
                method: 'PUT',
                body: JSON.stringify({
                    dashboardRoleIds: state.dashboardDraftRoleIds.filter(Boolean),
                    allowedChannelId: document.getElementById('set-allowed-channel').value || null,
                    allowedChannelBypassRoleIds: state.allowedChannelBypassDraftRoleIds.filter(Boolean),
                    unrankedRoleId: document.getElementById('set-unranked-role').value,
                    rankRoles: rankRows,
                    rankUpdater: {
                        activeIntervalMinutes: Number(document.getElementById('set-ru-active')?.value),
                        postMatchDelayMinutes: Number(document.getElementById('set-ru-postmatch')?.value),
                        backgroundIntervalMinutes: Number(document.getElementById('set-ru-bg')?.value),
                        inactiveIntervalHours: Number(document.getElementById('set-ru-inactive')?.value),
                        useSteamApi: Boolean(document.getElementById('set-ru-steam')?.checked),
                        useDiscordPresence: Boolean(document.getElementById('set-ru-discord')?.checked)
                    },
                    botStatus: {
                        text: textInput.value.trim()
                    }
                })
            });
            state.settings = res.settings;
            if (res.rankUpdaterStatus) {
                state.rankUpdaterStatus = res.rankUpdaterStatus;
            }
            syncDraftsFromSettings();
            setDirty(false);
            renderSettings();
            showToast('Settings saved.');
        } catch (err) {
            showToast(err.message, 'error');
        } finally {
            await setButtonLoading(btn, false);
        }
    });

    document.getElementById('set-backup-btn').addEventListener('click', openBackupModal);

    const restoreInput = document.getElementById('set-restore-file');
    const restoreBtn = document.getElementById('set-restore-btn');
    restoreBtn.addEventListener('click', () => restoreInput.click());

    restoreInput.addEventListener('change', async () => {
        const file = restoreInput.files?.[0];
        restoreInput.value = '';
        if (!file) return;

        let parsed;
        try {
            parsed = JSON.parse(await file.text());
        } catch {
            showToast('Selected file is not valid JSON.', 'error');
            return;
        }

        const ok = await confirmAction({
            title: 'Restore backup?',
            message: `File "${file.name}" will overwrite the current bot data.`,
            confirmLabel: 'Restore backup',
            danger: true
        });
        if (!ok) return;

        await setButtonLoading(restoreBtn, true, 'Restoring...');
        try {
            const res = await apiFetch('/api/backup/restore', {
                method: 'POST',
                body: JSON.stringify({ data: parsed })
            });
            await reloadAllDashboardData();
            renderSettings();
            const restoredMap = { users: 'Players', settings: 'Settings', warnings: 'Warnings' };
            const restoredLabels = (res.restored || []).map(k => restoredMap[k] || k).join(', ');
            showToast(`Backup restored: ${restoredLabels}.`);
        } catch (err) {
            showToast(err.message, 'error');
        } finally {
            await setButtonLoading(restoreBtn, false);
        }
    });

    bindDirtyForm('general-settings-form');
    refreshIcons();
}

function buildRankRowCells(r) {
    const hex = `#${((Number(r.color) || 0x808080) & 0xFFFFFF).toString(16).padStart(6, '0')}`;
    return `
        <td class="py-2.5 pr-3">
            <input type="color" class="rank-color-input w-10 h-9 rounded-lg bg-bg-base border border-slate-700 cursor-pointer p-0.5" value="${escapeHtml(hex)}" />
        </td>
        <td class="py-2.5 px-3 w-36">
            <input type="number" min="0" step="500" required class="rank-min-input input-field" value="${Number(r.min ?? 0)}" />
        </td>
        <td class="py-2.5 px-3 min-w-[220px]">
            <select class="rank-role-select input-field" required>
                ${buildRoleOptions(r.roleId, { allowNone: true, noneLabel: '— Select role —' })}
            </select>
        </td>
        <td class="py-2.5 pl-3 text-right">
            <button type="button" class="rank-remove-btn p-2 rounded-lg bg-red-500/15 hover:bg-red-500/25 border border-red-500/30 text-red-300 transition" title="Remove tier">
                <i data-lucide="trash-2" class="w-4 h-4"></i>
            </button>
        </td>
    `;
}

function buildRankRowHtml(r) {
    return `<tr class="rank-row border-b border-slate-800/70">${buildRankRowCells(r)}</tr>`;
}

function attachRankRowDeleteListeners() {
    document.querySelectorAll('#rank-roles-tbody .rank-remove-btn').forEach(btn => {
        btn.onclick = () => {
            const rows = document.querySelectorAll('#rank-roles-tbody .rank-row');
            if (rows.length <= 1) {
                showToast('At least one Elo tier must remain.', 'error');
                return;
            }
            btn.closest('.rank-row').remove();
            setDirty(true, 'general-settings-form');
        };
    });
}

// --- MODERATION ---

function readModAdminRolesDraftFromDom() {
    const selects = document.querySelectorAll('#mod-admin-roles-list .mod-admin-role-select');
    if (document.getElementById('mod-admin-roles-list')) {
        state.modDraftAdminRoleIds = [...selects].map(s => s.value);
    }
}

function buildModAdminRoleRowsHtml(roleIds) {
    if (roleIds.length === 0) {
        return `<p class="text-xs text-slate-400 py-2">No role.</p>`;
    }

    return roleIds.map((roleId, idx) => `
        <div class="flex items-center gap-2">
            <select class="mod-admin-role-select input-field flex-1">
                ${buildRoleOptions(roleId, { allowNone: true, noneLabel: '— Select role —' })}
            </select>
            <button type="button" data-mod-remove-role="${idx}" title="Remove role" class="p-2.5 rounded-xl bg-red-500/15 hover:bg-red-500/25 border border-red-500/30 text-red-300 transition shrink-0">
                <i data-lucide="trash-2" class="w-4 h-4"></i>
            </button>
        </div>
    `).join('');
}

function attachModAdminRoleRowListeners() {
    document.querySelectorAll('[data-mod-remove-role]').forEach(btn => {
        btn.addEventListener('click', () => {
            readModAdminRolesDraftFromDom();
            state.modDraftAdminRoleIds.splice(Number(btn.dataset.modRemoveRole), 1);
            document.getElementById('mod-admin-roles-list').innerHTML = buildModAdminRoleRowsHtml(
                state.modDraftAdminRoleIds
            );
            attachModAdminRoleRowListeners();
            setDirty(true, 'mod-form');
            refreshIcons();
        });
    });
}

function readModEscalationRulesDraftFromDom() {
    const rows = document.querySelectorAll('#mod-ae-rules-list .mod-ae-row');
    if (document.getElementById('mod-ae-rules-list')) {
        state.modDraftEscalationRules = [...rows].map(row => ({
            threshold: Number(row.querySelector('.mod-ae-threshold').value),
            action: row.querySelector('.mod-ae-action').value,
            durationMinutes: Number(row.querySelector('.mod-ae-duration').value) || 60
        }));
    }
}

function buildModEscalationRulesHtml(rules) {
    if (!Array.isArray(rules) || rules.length === 0) {
        return `<p class="text-xs text-slate-400 py-1.5">No rules.</p>`;
    }

    const headerHtml = `
        <div class="grid grid-cols-12 gap-2 text-[11px] font-medium text-slate-400 px-0.5">
            <div class="col-span-3">Warnings</div>
            <div class="col-span-5">Action</div>
            <div class="col-span-3">Duration</div>
            <div class="col-span-1"></div>
        </div>
    `;

    return headerHtml + rules.map((r, idx) => {
        const isTimeout = r.action !== 'kick' && r.action !== 'ban';
        return `
            <div class="mod-ae-row grid grid-cols-12 gap-2 items-center">
                <div class="col-span-3">
                    <input type="number" min="1" max="50" placeholder="Warnings" class="mod-ae-threshold input-field text-xs" value="${Number(r.threshold ?? 3)}" />
                </div>
                <div class="${isTimeout ? 'col-span-5' : 'col-span-8'}">
                    <select class="mod-ae-action input-field text-xs">
                        <option value="timeout" ${isTimeout ? 'selected' : ''}>Timeout</option>
                        <option value="kick" ${r.action === 'kick' ? 'selected' : ''}>Kick</option>
                        <option value="ban" ${r.action === 'ban' ? 'selected' : ''}>Ban</option>
                    </select>
                </div>
                <div class="col-span-3 mod-ae-duration-wrap relative ${isTimeout ? '' : 'hidden'}">
                    <input type="number" min="1" max="40320" placeholder="Min" class="mod-ae-duration input-field text-xs pr-10" value="${Number(r.durationMinutes ?? 60)}" />
                    <span class="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] text-slate-400">min</span>
                </div>
                <div class="col-span-1 flex justify-end">
                    <button type="button" data-mod-ae-remove="${idx}" title="Remove" class="p-2 rounded-lg bg-red-500/15 hover:bg-red-500/25 border border-red-500/30 text-red-300 transition">
                        <i data-lucide="trash-2" class="w-4 h-4"></i>
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

function attachModEscalationRuleListeners() {
    document.querySelectorAll('#mod-ae-rules-list .mod-ae-action').forEach(sel => {
        sel.addEventListener('change', () => {
            readModEscalationRulesDraftFromDom();
            document.getElementById('mod-ae-rules-list').innerHTML = buildModEscalationRulesHtml(
                state.modDraftEscalationRules
            );
            attachModEscalationRuleListeners();
            setDirty(true, 'mod-form');
            refreshIcons();
        });
    });

    document.querySelectorAll('[data-mod-ae-remove]').forEach(btn => {
        btn.addEventListener('click', () => {
            readModEscalationRulesDraftFromDom();
            state.modDraftEscalationRules.splice(Number(btn.dataset.modAeRemove), 1);
            document.getElementById('mod-ae-rules-list').innerHTML = buildModEscalationRulesHtml(
                state.modDraftEscalationRules
            );
            attachModEscalationRuleListeners();
            setDirty(true, 'mod-form');
            refreshIcons();
        });
    });
}

function buildBansListHtml() {
    if (!Array.isArray(state.bans) || state.bans.length === 0) {
        return `<p class="text-sm text-slate-400 py-4 text-center">No banned users.</p>`;
    }

    return `
        <div class="divide-y divide-slate-800/80 rounded-xl border border-slate-800 bg-bg-base/40">
            ${state.bans.map(b => `
                <div class="flex items-center justify-between gap-3 px-4 py-3">
                    <div class="flex items-center gap-3 min-w-0">
                        <img src="${escapeHtml(b.avatarUrl)}" alt="" class="w-8 h-8 rounded-full object-cover bg-bg-elevated shrink-0" />
                        <div class="min-w-0">
                            <div class="text-sm font-medium text-white truncate">${escapeHtml(b.tag || b.username)}</div>
                            <div class="text-xs text-slate-400 truncate">${escapeHtml(b.userId)}${b.reason ? ` · ${escapeHtml(b.reason)}` : ''}</div>
                        </div>
                    </div>
                    <button type="button" data-mod-unban="${escapeHtml(b.userId)}" data-mod-unban-name="${escapeHtml(b.tag || b.username)}" class="px-3 py-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/35 text-xs font-medium text-emerald-300 transition shrink-0">
                        Unban
                    </button>
                </div>
            `).join('')}
        </div>
    `;
}

function attachBanListListeners() {
    document.querySelectorAll('[data-mod-unban]').forEach(btn => {
        btn.addEventListener('click', async () => {
            const userId = btn.dataset.modUnban;
            const name = btn.dataset.modUnbanName;
            const ok = await confirmAction({
                title: 'Unban user?',
                message: `${name} will be able to rejoin the server.`,
                confirmLabel: 'Unban',
                danger: false
            });
            if (!ok) return;

            await setButtonLoading(btn, true, '...');
            try {
                await apiFetch(`/api/moderation/bans/${encodeURIComponent(userId)}`, { method: 'DELETE' });
                showToast(`${name} unbanned.`);
                await refreshBansList();
            } catch (err) {
                showToast(err.message, 'error');
                await setButtonLoading(btn, false);
            }
        });
    });
}

async function refreshBansList() {
    const wrap = document.getElementById('mod-bans-list');
    if (!wrap) return;
    try {
        const res = await apiFetch('/api/moderation/bans');
        state.bans = res.bans || [];
        const heading = document.getElementById('mod-bans-heading');
        if (heading) {
            heading.textContent = `Banned users (${state.bans.length})`;
        }
        if (document.getElementById('mod-bans-list')) {
            document.getElementById('mod-bans-list').innerHTML = buildBansListHtml();
            attachBanListListeners();
            refreshIcons();
        }
    } catch (err) {
        if (document.getElementById('mod-bans-list')) {
            document.getElementById('mod-bans-list').innerHTML = `<p class="text-xs text-red-300 py-3">${escapeHtml(err.message)}</p>`;
        }
    }
}

function renderModeration() {
    const container = document.getElementById('section-moderation');
    const mod = state.settings?.moderation || {};
    const cmds = mod.commands || {};
    const ae = mod.autoEscalation || {};

    const commandRows = [
        { id: 'mod-cmd-warn', key: 'warn', title: 'Warnings', icon: 'alert-triangle', color: 'text-amber-400' },
        { id: 'mod-cmd-timeout', key: 'timeout', title: 'Timeout', icon: 'volume-x', color: 'text-orange-400' },
        { id: 'mod-cmd-kick', key: 'kick', title: 'Kick', icon: 'user-x', color: 'text-red-400' },
        { id: 'mod-cmd-ban', key: 'ban', title: 'Ban & unban', icon: 'ban', color: 'text-red-400' },
        { id: 'mod-cmd-clear', key: 'clear', title: 'Clear messages', icon: 'eraser', color: 'text-sky-400' },
        { id: 'mod-cmd-lock', key: 'lock', title: 'Channel lock', icon: 'lock', color: 'text-amber-400' },
        { id: 'mod-cmd-slowmode', key: 'slowmode', title: 'Slowmode', icon: 'timer', color: 'text-brand' }
    ];

    container.innerHTML = `
        <div class="card p-6">
            <h3 class="text-base font-semibold text-white mb-5 flex items-center gap-2">
                <i data-lucide="gavel" class="w-4 h-4 text-amber-400"></i>
                <span>Moderation</span>
            </h3>

            <form id="mod-form" class="space-y-5">
                <div class="flex items-center justify-between gap-4 p-4 rounded-xl bg-bg-elevated border border-slate-800">
                    <div class="text-sm font-semibold text-white">Enable Moderation</div>
                    ${renderToggleSwitch('mod-enabled', mod.enabled)}
                </div>

                <div class="p-4 rounded-2xl bg-bg-elevated/60 border border-slate-800 space-y-3">
                    <div class="text-sm font-semibold text-white">Admin command roles</div>
                    <div id="mod-admin-roles-list" class="space-y-2">
                        ${buildModAdminRoleRowsHtml(state.modDraftAdminRoleIds)}
                    </div>
                    ${renderAddButtonHtml('mod-add-admin-role-btn', 'Add role')}
                    <p class="text-xs text-slate-500">Bot owner always has access.</p>
                </div>

                <div class="space-y-2.5">
                    <label class="text-xs font-medium text-slate-400 block">Commands</label>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                        ${commandRows.map(c => `
                            <div class="flex items-center justify-between gap-3 p-3.5 rounded-xl bg-bg-elevated/60 border border-slate-800">
                                <div class="text-sm font-medium text-white inline-flex items-center gap-2">
                                    <i data-lucide="${c.icon}" class="w-4 h-4 ${c.color} shrink-0"></i>
                                    <span>${escapeHtml(c.title)}</span>
                                </div>
                                ${renderToggleSwitch(c.id, cmds[c.key] !== false)}
                            </div>
                        `).join('')}
                    </div>
                </div>

                <div class="space-y-2.5">
                    <label class="text-xs font-medium text-slate-400 block">Behavior</label>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div class="flex items-center justify-between gap-3 p-3.5 rounded-xl bg-bg-elevated/60 border border-slate-800">
                            <div class="text-sm font-medium text-white">Send reason via DM</div>
                            ${renderToggleSwitch('mod-dm-user', mod.dmUser !== false)}
                        </div>
                        <div class="flex items-center justify-between gap-3 p-3.5 rounded-xl bg-bg-elevated/60 border border-slate-800">
                            <div class="text-sm font-medium text-white">Log to Admin Log</div>
                            ${renderToggleSwitch('mod-log-adminlog', mod.logToAdminLog !== false)}
                        </div>
                    </div>
                </div>

                <div class="p-4 rounded-2xl bg-bg-elevated/60 border border-slate-800 space-y-3">
                    <div class="flex items-center justify-between gap-4">
                        <div class="text-sm font-semibold text-white">Auto-escalation</div>
                        ${renderToggleSwitch('mod-ae-enabled', ae.enabled)}
                    </div>

                    <div id="mod-ae-wrap" class="space-y-2.5 ${ae.enabled ? '' : 'hidden'}">
                        <div id="mod-ae-rules-list" class="space-y-2">
                            ${buildModEscalationRulesHtml(state.modDraftEscalationRules)}
                        </div>
                        ${renderAddButtonHtml('mod-ae-add-btn', 'Add rule')}
                    </div>
                </div>

                <div class="flex justify-end pt-2">
                    <button id="mod-save-btn" type="submit" class="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand hover:bg-brand-hover text-white text-sm font-semibold transition">
                        <i data-lucide="save" class="w-4 h-4"></i>
                        <span>Save</span>
                    </button>
                </div>
            </form>
        </div>

        <div class="card p-6 space-y-4">
            <div class="flex items-center justify-between gap-3">
                <h3 id="mod-bans-heading" class="text-base font-semibold text-white">Banned users (${state.bans.length})</h3>
                <button id="mod-bans-refresh" type="button" class="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-bg-elevated hover:bg-bg-hover border border-slate-700 text-xs font-medium text-slate-200 transition">
                    <i data-lucide="refresh-cw" class="w-3.5 h-3.5"></i>
                    <span>Refresh</span>
                </button>
            </div>
            <div id="mod-bans-list">${buildBansListHtml()}</div>
        </div>
    `;

    document.getElementById('mod-add-admin-role-btn').addEventListener('click', () => {
        readModAdminRolesDraftFromDom();
        state.modDraftAdminRoleIds.push('');
        document.getElementById('mod-admin-roles-list').innerHTML = buildModAdminRoleRowsHtml(
            state.modDraftAdminRoleIds
        );
        attachModAdminRoleRowListeners();
        setDirty(true, 'mod-form');
        refreshIcons();
    });

    document.getElementById('mod-ae-enabled').addEventListener('change', e => {
        document.getElementById('mod-ae-wrap')?.classList.toggle('hidden', !e.target.checked);
    });

    document.getElementById('mod-ae-add-btn').addEventListener('click', () => {
        readModEscalationRulesDraftFromDom();
        const used = new Set(state.modDraftEscalationRules.map(r => r.threshold));
        let nextThreshold = 3;
        while (used.has(nextThreshold)) nextThreshold++;
        state.modDraftEscalationRules.push({ threshold: nextThreshold, action: 'timeout', durationMinutes: 60 });
        document.getElementById('mod-ae-rules-list').innerHTML = buildModEscalationRulesHtml(
            state.modDraftEscalationRules
        );
        attachModEscalationRuleListeners();
        setDirty(true, 'mod-form');
        refreshIcons();
    });

    document.getElementById('mod-form').addEventListener('submit', async e => {
        e.preventDefault();
        readModAdminRolesDraftFromDom();
        readModEscalationRulesDraftFromDom();
        const btn = document.getElementById('mod-save-btn');
        await setButtonLoading(btn, true, 'Saving...');
        try {
            const res = await apiFetch('/api/settings/moderation', {
                method: 'PUT',
                body: JSON.stringify({
                    enabled: document.getElementById('mod-enabled').checked,
                    adminRoleIds: state.modDraftAdminRoleIds.filter(Boolean),
                    dmUser: document.getElementById('mod-dm-user').checked,
                    logToAdminLog: document.getElementById('mod-log-adminlog').checked,
                    commands: {
                        warn: document.getElementById('mod-cmd-warn').checked,
                        timeout: document.getElementById('mod-cmd-timeout').checked,
                        kick: document.getElementById('mod-cmd-kick').checked,
                        ban: document.getElementById('mod-cmd-ban').checked,
                        clear: document.getElementById('mod-cmd-clear').checked,
                        lock: document.getElementById('mod-cmd-lock').checked,
                        slowmode: document.getElementById('mod-cmd-slowmode').checked
                    },
                    autoEscalation: {
                        enabled: document.getElementById('mod-ae-enabled').checked,
                        rules: state.modDraftEscalationRules
                    }
                })
            });
            state.settings.moderation = res.moderation;
            syncDraftsFromSettings();
            setDirty(false);
            await refreshOverviewOnly();
            renderModeration();
            showToast('Moderation settings saved.');
            if (Array.isArray(res.warnings)) {
                res.warnings.forEach(w => showToast(w, 'error'));
            }
        } catch (err) {
            showToast(err.message, 'error');
        } finally {
            await setButtonLoading(btn, false);
        }
    });

    document.getElementById('mod-bans-refresh').addEventListener('click', async e => {
        const btn = e.currentTarget;
        await setButtonLoading(btn, true, '...');
        try {
            await refreshBansList();
            showToast('Ban list refreshed.', 'info');
        } finally {
            await setButtonLoading(btn, false);
        }
    });

    attachModAdminRoleRowListeners();
    attachModEscalationRuleListeners();
    attachBanListListeners();
    bindDirtyForm('mod-form');
    refreshIcons();
}

// --- DATA REFRESH, LIVE POLLING & NAVIGATION ---

function patchOverviewDom() {
    const ov = state.overview;
    if (!ov) return;

    const statusEl = document.getElementById('ov-bot-status');
    const pingEl = document.getElementById('ov-bot-ping');
    const uptimeEl = document.getElementById('ov-bot-uptime');
    const membersEl = document.getElementById('ov-members-count');
    const membersSubEl = document.getElementById('ov-members-sub');
    const voiceEl = document.getElementById('ov-voice-count');
    const tvEl = document.getElementById('ov-tv-count');
    const linkedEl = document.getElementById('ov-linked-count');
    const avgEloEl = document.getElementById('ov-avg-elo');
    const ticketsEl = document.getElementById('ov-tickets-count');
    const modSubEl = document.getElementById('ov-mod-sub');
    const totalsEl = document.getElementById('ov-activity-totals');
    const chartEl = document.getElementById('ov-activity-chart');
    const topEl = document.getElementById('ov-top-players');
    const logsEl = document.getElementById('ov-recent-logs');

    if (statusEl) {
        statusEl.className = `inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-0.5 rounded-full ${ov.bot.online ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30' : 'bg-red-500/15 text-red-300 border border-red-500/30'}`;
        statusEl.innerHTML = `<span class="w-1.5 h-1.5 rounded-full ${ov.bot.online ? 'bg-emerald-400' : 'bg-red-400'}"></span><span>${ov.bot.online ? 'Online' : 'Offline'}</span>`;
    }
    if (pingEl) {
        pingEl.textContent = ov.bot.online ? `${ov.bot.ping} ms` : '—';
    }
    if (uptimeEl) {
        uptimeEl.textContent = formatDuration(ov.bot.uptimeMs);
    }
    if (membersEl) {
        membersEl.textContent = String(ov.guild.humanCount ?? ov.guild.memberCount);
    }
    if (membersSubEl) {
        membersSubEl.textContent = ov.guild.botCount ? `${ov.guild.botCount} bots` : `Total ${ov.guild.memberCount}`;
    }
    if (voiceEl) {
        voiceEl.textContent = String(ov.stats.inVoiceCount || 0);
    }
    if (tvEl) {
        tvEl.textContent = `TempVoice: ${ov.stats.activeTempRoomsCount}`;
    }
    if (linkedEl) {
        linkedEl.textContent = String(ov.stats.linkedPlayersCount);
    }
    if (avgEloEl) {
        avgEloEl.textContent = typeof ov.stats.avgElo === 'number'
            ? `Avg ${ov.stats.avgElo.toLocaleString('en-GB')} Elo`
            : 'No Elo';
    }
    if (ticketsEl) {
        ticketsEl.textContent = String(ov.stats.openTicketsCount || 0);
    }
    if (modSubEl) {
        modSubEl.textContent = `Warnings: ${ov.stats.totalWarningsCount || 0} · Timeout: ${ov.stats.timedOutCount || 0}`;
    }

    const daily = ov.stats.dailyActivity || [];
    if (totalsEl) {
        const weekMsgs = daily.reduce((s, d) => s + (d.messages || 0), 0);
        const weekVoice = daily.reduce((s, d) => s + (d.voiceJoins || 0), 0);
        const weekJoins = daily.reduce((s, d) => s + (d.joins || 0), 0);
        const weekLeaves = daily.reduce((s, d) => s + (d.leaves || 0), 0);
        totalsEl.innerHTML = `
            <span class="inline-flex items-center gap-1.5"><span class="w-2 h-2 rounded-full bg-brand"></span>Messages: <strong class="text-slate-200">${weekMsgs}</strong></span>
            <span class="inline-flex items-center gap-1.5"><span class="w-2 h-2 rounded-full bg-emerald-400"></span>Voice: <strong class="text-slate-200">${weekVoice}</strong></span>
            <span><strong class="text-emerald-400">+${weekJoins}</strong> / <strong class="text-red-400">-${weekLeaves}</strong></span>
        `;
    }
    if (chartEl) {
        chartEl.innerHTML = buildOverviewActivityChartSvg(daily);
    }
    if (topEl) {
        topEl.innerHTML = buildOverviewTopPlayersHtml(ov.stats.topPlayers);
        topEl.querySelectorAll('[data-ov-player]').forEach(btn => {
            btn.addEventListener('click', () => openPlayerDetailModal(btn.dataset.ovPlayer, 'cs2'));
        });
    }
    if (logsEl) {
        logsEl.innerHTML = buildOverviewRecentLogsHtml(ov.stats.recentLogs);
    }

    const moduleMap = {
        tempvoice: ov.modules.tempVoiceEnabled,
        patchbot: ov.modules.patchBotEnabled,
        joinroles: ov.modules.joinRolesEnabled,
        csstatus: ov.modules.csStatusEnabled,
        rankfeed: ov.modules.rankFeedEnabled,
        adminlog: ov.modules.adminLogEnabled,
        welcome: ov.modules.welcomeEnabled,
        tickets: ov.modules.ticketsEnabled,
        moderation: ov.modules.moderationEnabled
    };

    Object.entries(moduleMap).forEach(([key, enabled]) => {
        const dot = document.querySelector(`[data-module-badge="${key}"]`);
        if (!dot) return;
        dot.className = `w-2 h-2 rounded-full shrink-0 ${enabled ? 'bg-emerald-400' : 'bg-slate-600'}`;
        dot.title = enabled ? 'Active' : 'Disabled';
    });
}

function patchPlayersTableDom() {
    const heading = document.getElementById('players-count-heading');
    if (heading) {
        heading.innerHTML = `<i data-lucide="users" class="w-4 h-4 text-brand"></i><span>Players (${state.players.length})</span>`;
    }

    const tbody = document.getElementById('players-tbody');
    if (!tbody || tbody.querySelector('button:disabled')) return;

    const nextHtml = renderPlayersTableRows();
    if (nextHtml !== lastPlayersHtml) {
        lastPlayersHtml = nextHtml;
        tbody.innerHTML = nextHtml;
        attachPlayerTableListeners();
        refreshIcons();
    }
}

function patchTempRoomsDom() {
    const heading = document.getElementById('tv-rooms-heading');
    if (heading) {
        heading.textContent = `Active rooms (${state.tempRooms.length})`;
    }

    const listEl = document.getElementById('tv-rooms-list');
    if (!listEl || listEl.querySelector('button:disabled')) return;

    const nextHtml = renderTempVoiceRoomsList();
    if (nextHtml !== lastRoomsHtml) {
        lastRoomsHtml = nextHtml;
        listEl.innerHTML = nextHtml;
        attachTempVoiceRoomListeners();
        refreshIcons();
    }
}

async function pollLiveUpdates() {
    if (document.hidden || isLivePolling || !state.auth?.authorized) return;
    isLivePolling = true;
    try {
        const data = await apiFetch(`/api/live?section=${encodeURIComponent(state.activeSection)}`);
        if (data.overview) {
            state.overview = data.overview;
            if (state.activeSection === 'overview') {
                patchOverviewDom();
            }
        }
        if (data.rankUpdaterStatus) {
            state.rankUpdaterStatus = data.rankUpdaterStatus;
            if (state.activeSection === 'settings') {
                const playingBadge = document.getElementById('set-ru-playing-badge');
                if (playingBadge) {
                    playingBadge.textContent = `In CS2: ${data.rankUpdaterStatus.playingCount}`;
                }
                const rlBadge = document.getElementById('set-ru-rl-badge');
                if (rlBadge) {
                    const isLimited = Boolean(data.rankUpdaterStatus.rateLimitedUntil && data.rankUpdaterStatus.rateLimitedUntil > Date.now());
                    rlBadge.classList.toggle('hidden', !isLimited);
                }
            }
        }
        if (Array.isArray(data.players) && state.activeSection === 'players') {
            state.players = data.players;
            patchPlayersTableDom();
        }
        if (Array.isArray(data.rooms) && state.activeSection === 'tempvoice') {
            state.tempRooms = data.rooms;
            patchTempRoomsDom();
        }
        if (Array.isArray(data.logs) && state.activeSection === 'logs') {
            state.logs = data.logs;
            patchLogsDom();
        }
        if (Array.isArray(data.openTickets) && state.activeSection === 'tickets') {
            state.openTickets = data.openTickets;
            patchOpenTicketsDom();
        }
        if (Array.isArray(data.announcementsHistory) && state.activeSection === 'announcements') {
            const prevSig = JSON.stringify((state.announcementsHistory || []).map(h => `${h.channelId}:${h.messageId}:${h.sentAt || 0}`));
            const nextSig = JSON.stringify(data.announcementsHistory.map(h => `${h.channelId}:${h.messageId}:${h.sentAt || 0}`));
            if (prevSig !== nextSig) {
                state.announcementsHistory = data.announcementsHistory;
                if (state.editingAnnouncement && !data.announcementsHistory.some(
                    h => h.channelId === state.editingAnnouncement.channelId && h.messageId === state.editingAnnouncement.messageId
                )) {
                    state.editingAnnouncement = null;
                    showToast('The announcement being edited was deleted on Discord.', 'info');
                    renderAnnouncements();
                } else {
                    renderAnnouncementsHistoryBlock();
                }
            }
        }
    } catch {
        // Silently wait for the next tick on temporary connection loss
    } finally {
        isLivePolling = false;
    }
}

function startLiveUpdates() {
    stopLiveUpdates();
    livePollTimer = setInterval(pollLiveUpdates, LIVE_POLL_MS);
    uptimeTickTimer = setInterval(() => {
        if (document.hidden || !state.overview?.bot?.online) return;
        state.overview.bot.uptimeMs += 1000;
        const uptimeEl = document.getElementById('ov-bot-uptime');
        if (uptimeEl) {
            uptimeEl.textContent = formatDuration(state.overview.bot.uptimeMs);
        }
    }, 1000);
}

function stopLiveUpdates() {
    if (livePollTimer) {
        clearInterval(livePollTimer);
        livePollTimer = null;
    }
    if (uptimeTickTimer) {
        clearInterval(uptimeTickTimer);
        uptimeTickTimer = null;
    }
}

async function refreshOverviewOnly() {
    state.overview = await apiFetch('/api/overview');
    if (state.activeSection === 'overview') patchOverviewDom();
}

async function refreshOverviewAndPlayers() {
    const [ov, pl] = await Promise.all([apiFetch('/api/overview'), apiFetch('/api/players')]);
    state.overview = ov;
    state.players = pl.players || [];
    if (state.activeSection === 'overview') patchOverviewDom();
    if (state.activeSection === 'players') patchPlayersTableDom();
}

async function refreshTempRooms() {
    const data = await apiFetch('/api/tempvoice/rooms');
    state.tempRooms = data.rooms || [];
    if (document.getElementById('tv-rooms-list')) {
        patchTempRoomsDom();
    } else if (state.activeSection === 'tempvoice') {
        renderTempVoice();
    }
}

async function refreshMetaAndOverview() {
    const [ov, meta] = await Promise.all([apiFetch('/api/overview'), apiFetch('/api/guild/meta')]);
    state.overview = ov;
    state.meta = meta;
}

async function reloadAllDashboardData() {
    const [overview, meta, playersRes, settingsRes, roomsRes, logsRes, annRes, ticketsRes] = await Promise.all([
        apiFetch('/api/overview'),
        apiFetch('/api/guild/meta'),
        apiFetch('/api/players'),
        apiFetch('/api/settings'),
        apiFetch('/api/tempvoice/rooms'),
        apiFetch('/api/logs'),
        apiFetch('/api/announcements/history'),
        apiFetch('/api/tickets/open')
    ]);

    state.overview = overview;
    state.meta = meta;
    state.players = playersRes.players || [];
    state.settings = settingsRes.settings;
    state.steamApiKeyConfigured = Boolean(settingsRes.steamApiKeyConfigured);
    state.rankUpdaterStatus = settingsRes.rankUpdaterStatus || null;
    state.tempRooms = roomsRes.rooms || [];
    state.logs = logsRes.logs || [];
    state.announcementsHistory = annRes.history || [];
    state.openTickets = ticketsRes.openTickets || [];
    syncDraftsFromSettings();
}

function renderActiveSection() {
    const map = {
        overview: renderOverview,
        players: renderPlayers,
        announcements: renderAnnouncements,
        logs: renderLogs,
        tempvoice: renderTempVoice,
        patchbot: renderPatchBot,
        joinroles: renderJoinRoles,
        csstatus: renderCsStatus,
        rankfeed: renderRankFeed,
        adminlog: renderAdminLog,
        welcome: renderWelcome,
        tickets: renderTickets,
        moderation: renderModeration,
        settings: renderSettings
    };
    (map[state.activeSection] || renderOverview)();
    if (state.activeSection === 'players') {
        lastPlayersHtml = document.getElementById('players-tbody')?.innerHTML || '';
    }
    if (state.activeSection === 'tempvoice') {
        lastRoomsHtml = document.getElementById('tv-rooms-list')?.innerHTML || '';
    }
    if (state.activeSection === 'logs') {
        lastLogsHtml = document.getElementById('logs-list')?.innerHTML || '';
    }
    if (state.activeSection === 'tickets') {
        lastTicketsHtml = document.getElementById('tk-open-list')?.innerHTML || '';
    }
}

function switchSection(section) {
    setDirty(false);
    state.activeSection = section;
    document.getElementById('page-title').textContent = SECTION_TITLES[section] || 'Overview';

    document.querySelectorAll('.nav-item').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.section === section);
    });

    Object.keys(SECTION_TITLES).forEach(key => {
        document.getElementById(`section-${key}`).classList.toggle('hidden', key !== section);
    });

    syncDraftsFromSettings();
    renderActiveSection();
    if (section === 'announcements') {
        refreshAnnouncementsHistory();
    } else if (section === 'moderation') {
        refreshBansList();
    }
    closeMobileSidebar();
    pollLiveUpdates();
}

function openMobileSidebar() {
    document.getElementById('sidebar').classList.remove('-translate-x-full');
    document.getElementById('sidebar-backdrop').classList.remove('hidden');
}

function closeMobileSidebar() {
    document.getElementById('sidebar').classList.add('-translate-x-full');
    document.getElementById('sidebar-backdrop').classList.add('hidden');
}

async function handleLogout() {
    stopLiveUpdates();
    setDirty(false);
    await fetch('/api/logout', { method: 'POST' }).catch(() => null);
    window.location.href = '/';
}

async function bootstrap() {
    stopLiveUpdates();
    setDirty(false);
    showView('view-loading');
    try {
        const res = await fetch('/api/auth/me');
        const auth = await res.json();
        state.auth = auth;

        if (!auth.authenticated) {
            const botNameEl = document.getElementById('login-bot-name');
            const botAvatarEl = document.getElementById('login-bot-avatar');
            const botFallbackEl = document.getElementById('login-bot-fallback');
            botNameEl.textContent = auth.bot?.username || 'BOT Gaben';

            if (auth.bot?.avatarUrl) {
                botAvatarEl.src = auth.bot.avatarUrl;
                botAvatarEl.classList.remove('hidden');
                botFallbackEl.classList.add('hidden');
            }

            const urlParams = new URLSearchParams(window.location.search);
            const errCode = urlParams.get('error');
            const errBox = document.getElementById('login-error-box');
            if (errCode && OAUTH_ERRORS[errCode]) {
                errBox.textContent = OAUTH_ERRORS[errCode];
                errBox.classList.remove('hidden');
            } else {
                errBox.classList.add('hidden');
            }

            const oauthWarn = document.getElementById('login-oauth-warning');
            const loginBtn = document.getElementById('login-discord-btn');
            if (!auth.oauthConfigured) {
                oauthWarn.classList.remove('hidden');
                loginBtn.classList.add('opacity-50', 'pointer-events-none');
            }

            showView('view-login');
            refreshIcons();
            return;
        }

        if (!auth.authorized) {
            document.getElementById('denied-user-avatar').src = auth.user?.avatarUrl || '';
            document.getElementById('denied-user-name').textContent = auth.user?.displayName || auth.user?.username || '';
            showView('view-denied');
            refreshIcons();
            return;
        }

        document.getElementById('nav-bot-name').textContent = auth.bot?.username || 'BOT Gaben';
        document.getElementById('nav-guild-name').textContent = auth.guild?.name || 'Discord server';
        if (auth.bot?.avatarUrl) document.getElementById('nav-bot-avatar').src = auth.bot.avatarUrl;
        document.getElementById('header-user-avatar').src = auth.user?.avatarUrl || '';
        document.getElementById('header-user-name').textContent = auth.user?.displayName || auth.user?.username || '';

        await reloadAllDashboardData();

        showView('view-app');
        switchSection(state.activeSection);
        startLiveUpdates();
    } catch (err) {
        console.error('Dashboard initialization error:', err);
        showView('view-login');
        showToast('Failed to load dashboard.', 'error');
    }
}

document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    const modalPairs = [
        ['confirm-modal', 'confirm-cancel'],
        ['rename-modal', 'rename-modal-cancel'],
        ['backup-modal', 'backup-modal-close'],
        ['player-mod-modal', 'pmod-close'],
        ['player-detail-modal', 'pdet-close']
    ];
    for (const [modalId, closeBtnId] of modalPairs) {
        const modal = document.getElementById(modalId);
        if (modal && !modal.classList.contains('hidden')) {
            document.getElementById(closeBtnId)?.click();
            break;
        }
    }
});

document.addEventListener('visibilitychange', () => {
    if (!document.hidden && state.auth?.authorized) {
        pollLiveUpdates();
    }
});

document.getElementById('unsaved-discard-btn')?.addEventListener('click', () => {
    syncDraftsFromSettings();
    setDirty(false);
    renderActiveSection();
    showToast('Changes discarded.', 'info');
});

document.getElementById('unsaved-save-btn').addEventListener('click', () => {
    if (state.dirtyFormId) {
        document.getElementById(state.dirtyFormId)?.requestSubmit();
    }
});

document.getElementById('denied-logout-btn').addEventListener('click', handleLogout);
document.getElementById('header-logout-btn').addEventListener('click', handleLogout);
document.getElementById('sidebar-open-btn').addEventListener('click', openMobileSidebar);
document.getElementById('sidebar-close-btn').addEventListener('click', closeMobileSidebar);
document.getElementById('sidebar-backdrop').addEventListener('click', closeMobileSidebar);
document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => switchSection(btn.dataset.section));
});

bootstrap();
