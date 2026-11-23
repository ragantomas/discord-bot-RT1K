const state = {
    auth: null,
    activeSection: 'overview',
    overview: null,
    meta: null,
    players: [],
    playerSearch: '',
    settings: null,
    steamApiKeyConfigured: false,
    tempRooms: [],
    tvDraftSetups: [],
    pbDraftChannelIds: [],
    jrDraftMemberRoleIds: [],
    jrDraftBotRoleIds: [],
    logs: [],
    logCategory: 'all',
    logSearch: '',
    announcementsHistory: [],
    editingAnnouncement: null,
    isDirty: false,
    dirtyFormId: null
};

const SECTION_TITLES = {
    overview: 'Prehľad',
    players: 'Hráči (CS2 Premier)',
    announcements: 'Oznámenia / Embed Builder',
    logs: 'Activity Log',
    tempvoice: 'TempVoice',
    patchbot: 'CS2 PatchBot',
    joinroles: 'Join Roles',
    csstatus: 'CS2 / Steam Status',
    rankfeed: 'Rank-Up / Derank',
    adminlog: 'Admin Log',
    settings: 'Nastavenia'
};

const OAUTH_ERRORS = {
    bot_starting: 'Bot sa práve spúšťa, skús sa prihlásiť o pár sekúnd.',
    oauth_config: 'V .env chýba CLIENT_SECRET alebo REDIRECT_URI pre Discord OAuth2.',
    oauth_cancelled: 'Prihlásenie cez Discord bolo zrušené.',
    oauth_state: 'Platnosť prihlasovacej relácie vypršala. Skús sa prihlásiť znova.',
    oauth_failed: 'Nepodarilo sa overiť prihlásenie cez Discord API.'
};

const LIVE_POLL_MS = 5000;
let livePollTimer = null;
let uptimeTickTimer = null;
let isLivePolling = false;
let lastPlayersHtml = '';
let lastRoomsHtml = '';
let lastLogsHtml = '';

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
    if (!unixSeconds) return 'Zatiaľ žiadny';
    return new Date(unixSeconds * 1000).toLocaleString('sk-SK');
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
        createTriggerChannel: false
    }));
    state.pbDraftChannelIds = [...(s.patchBot?.channelIds || [])];
    state.jrDraftMemberRoleIds = [...(s.joinRoles?.memberRoleIds || [])];
    state.jrDraftBotRoleIds = [...(s.joinRoles?.botRoleIds || [])];
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

async function setButtonLoading(button, isLoading, loadingText = 'Pracujem...') {
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

function confirmAction({ title = 'Potvrdiť akciu', message = '', confirmLabel = 'Potvrdiť', danger = true }) {
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
        throw new Error(data.error || `Chyba servera (${res.status})`);
    }
    return data;
}

function showView(viewId) {
    ['view-loading', 'view-login', 'view-denied', 'view-app'].forEach(id => {
        document.getElementById(id).classList.toggle('hidden', id !== viewId);
    });
}

function buildRoleOptions(selectedId, { allowNone = true, noneLabel = '— Žiadna —', allowEveryone = false, onlyAssignable = false } = {}) {
    const roles = state.meta?.roles || [];
    let html = allowNone ? `<option value="">${escapeHtml(noneLabel)}</option>` : '';

    for (const r of roles) {
        if (r.isEveryone && !allowEveryone) continue;
        if (onlyAssignable && !r.isEveryone && r.managed) continue;
        const selected = r.id === selectedId ? 'selected' : '';
        let suffix = '';
        if (!r.isEveryone && r.managed) suffix = ' (spravovaná integráciou)';
        else if (!r.isEveryone && !r.editable && onlyAssignable) suffix = ' (nad rolou bota)';
        html += `<option value="${escapeHtml(r.id)}" ${selected}>${escapeHtml(r.name)}${suffix}</option>`;
    }
    return html;
}

function buildTextChannelOptions(selectedId, { allowNone = true, noneLabel = '— Nevybraný —' } = {}) {
    const channels = state.meta?.textChannels || [];
    let html = allowNone ? `<option value="">${escapeHtml(noneLabel)}</option>` : '';
    for (const c of channels) {
        const selected = c.id === selectedId ? 'selected' : '';
        const prefix = c.type === 'announcement' ? '📢 #' : '#';
        html += `<option value="${escapeHtml(c.id)}" ${selected}>${prefix}${escapeHtml(c.name)}</option>`;
    }
    return html;
}

function buildVoiceChannelOptions(selectedId, { allowNone = true, noneLabel = '— Nevybraný —' } = {}) {
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
    let html = '<option value="">— Bez kategórie / automaticky —</option>';
    for (const c of cats) {
        const selected = c.id === selectedId ? 'selected' : '';
        html += `<option value="${escapeHtml(c.id)}" ${selected}>📁 ${escapeHtml(c.name)}</option>`;
    }
    return html;
}

function buildMemberDropdownItemsHtml(query = '') {
    const members = state.meta?.members || [];
    const q = query.trim().toLowerCase();
    const filtered = q
        ? members.filter(m => m.displayName.toLowerCase().includes(q) || m.username.toLowerCase().includes(q) || m.id.includes(q))
        : members;

    if (filtered.length === 0) {
        return '<div class="px-3.5 py-3 text-xs text-slate-400 text-center">Žiadny člen nevyhovuje hľadaniu.</div>';
    }

    return filtered.slice(0, 60).map(m => `
        <button type="button" data-member-pick="${escapeHtml(m.id)}" data-member-label="${escapeHtml(`${m.displayName} (@${m.username})`)}" class="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-bg-hover transition">
            <img src="${escapeHtml(m.avatarUrl)}" alt="" class="w-7 h-7 rounded-full object-cover bg-bg-base shrink-0" />
            <div class="min-w-0 flex-1">
                <div class="text-sm font-medium text-white truncate">${escapeHtml(m.displayName)}</div>
                <div class="text-xs text-slate-400 truncate">@${escapeHtml(m.username)}</div>
            </div>
        </button>
    `).join('');
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

function renderOverview() {
    const container = document.getElementById('section-overview');
    const ov = state.overview;
    if (!ov) return;

    const pingBadge = ov.bot.online ? `${ov.bot.ping} ms` : 'N/A';
    const moduleRows = [
        { key: 'tempvoice', label: 'TempVoice', enabled: ov.modules.tempVoiceEnabled, icon: 'mic' },
        { key: 'patchbot', label: 'CS2 PatchBot', enabled: ov.modules.patchBotEnabled, icon: 'newspaper' },
        { key: 'joinroles', label: 'Join Roles', enabled: ov.modules.joinRolesEnabled, icon: 'user-plus' },
        { key: 'csstatus', label: 'CS2 / Steam Status', enabled: ov.modules.csStatusEnabled, icon: 'activity' },
        { key: 'rankfeed', label: 'Rank-Up / Derank', enabled: ov.modules.rankFeedEnabled, icon: 'trending-up' },
        { key: 'adminlog', label: 'Admin Log', enabled: ov.modules.adminLogEnabled, icon: 'shield-check' }
    ];

    container.innerHTML = `
        <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <div class="card p-5">
                <div class="flex items-center justify-between text-slate-400 text-xs font-medium uppercase tracking-wider">
                    <span>Stav bota</span>
                    <i data-lucide="radio" class="w-4 h-4 text-emerald-400"></i>
                </div>
                <div class="mt-3 flex items-baseline gap-2.5">
                    <span id="ov-bot-status" class="text-2xl font-bold ${ov.bot.online ? 'text-emerald-400' : 'text-red-400'}">${ov.bot.online ? 'Online' : 'Offline'}</span>
                    <span id="ov-bot-ping" class="text-xs text-slate-400">Ping: ${escapeHtml(pingBadge)}</span>
                </div>
            </div>

            <div class="card p-5">
                <div class="flex items-center justify-between text-slate-400 text-xs font-medium uppercase tracking-wider">
                    <span>Uptime</span>
                    <i data-lucide="clock" class="w-4 h-4 text-brand"></i>
                </div>
                <div id="ov-bot-uptime" class="mt-3 text-2xl font-bold text-white">${escapeHtml(formatDuration(ov.bot.uptimeMs))}</div>
                <div id="ov-guild-members" class="text-xs text-slate-400 mt-1">${escapeHtml(ov.guild.name)} (${ov.guild.memberCount} členov)</div>
            </div>

            <div class="card p-5">
                <div class="flex items-center justify-between text-slate-400 text-xs font-medium uppercase tracking-wider">
                    <span>Prepojení hráči</span>
                    <i data-lucide="users" class="w-4 h-4 text-brand-gold"></i>
                </div>
                <div id="ov-linked-count" class="mt-3 text-2xl font-bold text-white">${ov.stats.linkedPlayersCount}</div>
                <div class="text-xs text-slate-400 mt-1">V databáze <code class="text-slate-300">users.json</code></div>
            </div>

            <div class="card p-5">
                <div class="flex items-center justify-between text-slate-400 text-xs font-medium uppercase tracking-wider">
                    <span>Aktívne TempVoice</span>
                    <i data-lucide="headphones" class="w-4 h-4 text-sky-400"></i>
                </div>
                <div id="ov-tv-count" class="mt-3 text-2xl font-bold text-white">${ov.stats.activeTempRoomsCount}</div>
                <div class="text-xs text-slate-400 mt-1">Momentálne otvorené miestnosti</div>
            </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div class="card p-6">
                <h3 class="text-base font-semibold text-white mb-4 flex items-center gap-2">
                    <i data-lucide="zap" class="w-4 h-4 text-brand-gold"></i>
                    <span>Rýchle akcie, Záloha & Obnova</span>
                </h3>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button id="ov-update-all" type="button" class="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-brand hover:bg-brand-hover text-white text-sm font-medium transition">
                        <i data-lucide="refresh-cw" class="w-4 h-4"></i>
                        <span>Aktualizovať všetky ranky</span>
                    </button>
                    <a href="/api/backup/download/all" class="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/35 text-emerald-200 text-sm font-medium transition">
                        <i data-lucide="archive" class="w-4 h-4"></i>
                        <span>Stiahnuť kompletnú zálohu</span>
                    </a>
                    <a href="/api/backup/download/users" class="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-bg-elevated hover:bg-bg-hover border border-slate-700 text-slate-200 text-sm font-medium transition">
                        <i data-lucide="download" class="w-4 h-4"></i>
                        <span>Stiahnuť users.json</span>
                    </a>
                    <a href="/api/backup/download/settings" class="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-bg-elevated hover:bg-bg-hover border border-slate-700 text-slate-200 text-sm font-medium transition">
                        <i data-lucide="download" class="w-4 h-4"></i>
                        <span>Stiahnuť settings.json</span>
                    </a>
                    <div class="sm:col-span-2 pt-1">
                        <input id="ov-restore-file" type="file" accept=".json,application/json" class="hidden" />
                        <button id="ov-restore-btn" type="button" class="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-dashed border-slate-700 hover:border-amber-400/70 bg-bg-elevated/60 hover:bg-amber-500/10 text-slate-200 text-sm font-medium transition">
                            <i data-lucide="upload" class="w-4 h-4 text-amber-400"></i>
                            <span>Obnoviť databázu zo zálohy (.json)</span>
                        </button>
                    </div>
                </div>
            </div>

            <div class="card p-6">
                <h3 class="text-base font-semibold text-white mb-4 flex items-center gap-2">
                    <i data-lucide="layers" class="w-4 h-4 text-brand"></i>
                    <span>Stav modulov</span>
                </h3>
                <div class="space-y-2.5">
                    ${moduleRows.map(m => `
                        <button type="button" data-jump="${m.key}" class="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-bg-elevated hover:bg-bg-hover border border-slate-800 transition text-left">
                            <span class="flex items-center gap-2.5 text-sm font-medium text-slate-200">
                                <i data-lucide="${m.icon}" class="w-4 h-4 text-slate-400"></i>
                                ${escapeHtml(m.label)}
                            </span>
                            <span data-module-badge="${m.key}" class="text-xs font-semibold px-2.5 py-1 rounded-full ${m.enabled ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30' : 'bg-slate-700/40 text-slate-400 border border-slate-700'}">
                                ${m.enabled ? 'Aktívny' : 'Vypnutý'}
                            </span>
                        </button>
                    `).join('')}
                </div>
            </div>
        </div>
    `;

    container.querySelectorAll('[data-jump]').forEach(btn => {
        btn.addEventListener('click', () => switchSection(btn.dataset.jump));
    });

    document.getElementById('ov-update-all').addEventListener('click', async e => {
        const btn = e.currentTarget;
        await setButtonLoading(btn, true, 'Aktualizujem...');
        try {
            const res = await apiFetch('/api/players/update-all', { method: 'POST' });
            showToast(`Aktualizácia dokončená: ${res.updated}/${res.total} hráčov obnovených.`);
            await refreshOverviewAndPlayers();
        } catch (err) {
            showToast(err.message, 'error');
        } finally {
            await setButtonLoading(btn, false);
        }
    });

    const restoreInput = document.getElementById('ov-restore-file');
    const restoreBtn = document.getElementById('ov-restore-btn');
    restoreBtn.addEventListener('click', () => restoreInput.click());

    restoreInput.addEventListener('change', async () => {
        const file = restoreInput.files?.[0];
        restoreInput.value = '';
        if (!file) return;

        let parsed;
        try {
            parsed = JSON.parse(await file.text());
        } catch {
            showToast('Vybraný súbor nie je platný JSON.', 'error');
            return;
        }

        const ok = await confirmAction({
            title: 'Obnoviť dáta zo zálohy?',
            message: `Súbor „${file.name}“ prepíše zodpovedajúce dáta bota (users.json / settings.json).`,
            confirmLabel: 'Obnoviť zálohu',
            danger: true
        });
        if (!ok) return;

        await setButtonLoading(restoreBtn, true, 'Obnovujem...');
        try {
            const res = await apiFetch('/api/backup/restore', {
                method: 'POST',
                body: JSON.stringify({ data: parsed })
            });
            await reloadAllDashboardData();
            renderOverview();
            showToast(`Záloha bola úspešne obnovená (${res.restored.join(' + ')}).`);
        } catch (err) {
            showToast(err.message, 'error');
        } finally {
            await setButtonLoading(restoreBtn, false);
        }
    });

    refreshIcons();
}

function renderPlayersTableRows() {
    const q = state.playerSearch.trim().toLowerCase();
    const list = q
        ? state.players.filter(p =>
            p.displayName.toLowerCase().includes(q)
            || p.username.toLowerCase().includes(q)
            || p.steamId.includes(q)
        )
        : state.players;

    if (list.length === 0) {
        return `<tr><td colspan="4" class="px-4 py-8 text-center text-sm text-slate-400">Žiadni prepojení hráči nezodpovedajú hľadaniu.</td></tr>`;
    }

    return list.map(p => {
        const eloBadge = typeof p.elo === 'number'
            ? `<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border" style="background-color: ${escapeHtml(p.rankColor)}22; border-color: ${escapeHtml(p.rankColor)}66; color: ${escapeHtml(p.rankColor)};">${p.elo.toLocaleString('sk-SK')}</span>`
            : `<span class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-slate-800 text-slate-400 border border-slate-700">Unranked</span>`;

        return `
            <tr class="border-t border-slate-800/80 hover:bg-bg-elevated/50 transition">
                <td class="px-4 py-3">
                    <div class="flex items-center gap-3">
                        <img src="${escapeHtml(p.avatarUrl)}" alt="" class="w-9 h-9 rounded-full object-cover bg-bg-elevated" />
                        <div class="min-w-0">
                            <div class="text-sm font-semibold text-white truncate">${escapeHtml(p.displayName)}</div>
                            <div class="text-xs text-slate-400 truncate">@${escapeHtml(p.username)}${p.inGuild ? '' : ' • mimo servera'}</div>
                        </div>
                    </div>
                </td>
                <td class="px-4 py-3 text-xs font-mono">
                    <a href="${escapeHtml(p.leetifyUrl)}" target="_blank" rel="noopener noreferrer" class="text-sky-400 hover:underline inline-flex items-center gap-1">
                        <span>${escapeHtml(p.steamId)}</span>
                        <i data-lucide="external-link" class="w-3 h-3"></i>
                    </a>
                </td>
                <td class="px-4 py-3">${eloBadge}</td>
                <td class="px-4 py-3 text-right">
                    <div class="inline-flex items-center gap-2">
                        <button type="button" data-player-update="${escapeHtml(p.userId)}" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-bg-elevated hover:bg-bg-hover border border-slate-700 text-xs font-medium text-slate-200 transition">
                            <i data-lucide="refresh-cw" class="w-3.5 h-3.5"></i>
                            <span>Update</span>
                        </button>
                        <button type="button" data-player-unlink="${escapeHtml(p.userId)}" data-player-name="${escapeHtml(p.displayName)}" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/15 hover:bg-red-500/25 border border-red-500/30 text-xs font-medium text-red-300 transition">
                            <i data-lucide="unlink" class="w-3.5 h-3.5"></i>
                            <span>Odpojiť</span>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

function attachPlayerTableListeners() {
    const tbody = document.getElementById('players-tbody');
    if (!tbody) return;

    tbody.querySelectorAll('[data-player-update]').forEach(btn => {
        btn.addEventListener('click', async () => {
            const userId = btn.dataset.playerUpdate;
            await setButtonLoading(btn, true, '...');
            try {
                const res = await apiFetch(`/api/players/${encodeURIComponent(userId)}/update`, { method: 'POST' });
                const eloMsg = typeof res.elo === 'number' ? res.elo.toLocaleString('sk-SK') : 'Unranked';
                showToast(`Rank aktualizovaný (${eloMsg}).`);
                await refreshOverviewAndPlayers();
            } catch (err) {
                showToast(err.message, 'error');
            } finally {
                await setButtonLoading(btn, false);
            }
        });
    });

    tbody.querySelectorAll('[data-player-unlink]').forEach(btn => {
        btn.addEventListener('click', async () => {
            const userId = btn.dataset.playerUnlink;
            const name = btn.dataset.playerName;
            const ok = await confirmAction({
                title: 'Odpojiť hráča?',
                message: `Naozaj chceš odpojiť Steam účet hráča ${name} a odobrať mu CS2 rank rolu?`,
                confirmLabel: 'Odpojiť'
            });
            if (!ok) return;

            await setButtonLoading(btn, true, 'Odpájam...');
            try {
                await apiFetch(`/api/players/${encodeURIComponent(userId)}`, { method: 'DELETE' });
                showToast(`Hráč ${name} bol odpojený.`);
                await refreshOverviewAndPlayers();
            } catch (err) {
                showToast(err.message, 'error');
            } finally {
                await setButtonLoading(btn, false);
            }
        });
    });
}

function renderPlayers() {
    const container = document.getElementById('section-players');

    container.innerHTML = `
        <div class="card p-6">
            <h3 class="text-base font-semibold text-white mb-4 flex items-center gap-2">
                <i data-lucide="link" class="w-4 h-4 text-brand"></i>
                <span>Rýchle prepojenie hráča (Force Link)</span>
            </h3>
            <form id="force-link-form" class="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
                <div class="md:col-span-5 space-y-1.5">
                    <label class="text-xs font-medium text-slate-400">Člen servera</label>
                    <div id="fl-member-combobox" class="relative">
                        <input id="fl-user-id" type="hidden" value="" />
                        <input id="fl-member-input" type="text" autocomplete="off" placeholder="Vyber alebo vyhľadaj člena..." class="input-field pr-9" />
                        <button id="fl-member-clear" type="button" title="Vymazať výber" class="hidden absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-md text-slate-400 hover:text-white hover:bg-bg-hover transition">
                            <i data-lucide="x" class="w-3.5 h-3.5"></i>
                        </button>
                        <div id="fl-member-dropdown" class="hidden absolute left-0 right-0 top-full mt-1.5 z-30 max-h-64 overflow-y-auto rounded-xl bg-bg-surface border border-slate-700 shadow-2xl divide-y divide-slate-800/70"></div>
                    </div>
                </div>
                <div class="md:col-span-5 space-y-1.5">
                    <label class="text-xs font-medium text-slate-400">Steam64 ID, Steam link alebo Leetify URL</label>
                    <input id="fl-profile" type="text" required placeholder="https://steamcommunity.com/id/... alebo 7656119..." class="input-field" />
                </div>
                <div class="md:col-span-2">
                    <button id="fl-submit-btn" type="submit" class="w-full h-[42px] inline-flex items-center justify-center gap-2 px-4 rounded-xl bg-brand hover:bg-brand-hover text-white text-sm font-semibold transition">
                        <i data-lucide="plus" class="w-4 h-4"></i>
                        <span>Prepojiť</span>
                    </button>
                </div>
            </form>
        </div>

        <div class="card overflow-hidden">
            <div class="p-5 border-b border-slate-800/90 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                    <h3 id="players-count-heading" class="text-base font-semibold text-white">Prepojení hráči (${state.players.length})</h3>
                    <p class="text-xs text-slate-400 mt-0.5">Zoradené podľa Premier Elo od najvyššieho</p>
                </div>
                <div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
                    <input id="players-search" type="text" placeholder="Hľadať hráča alebo Steam ID..." class="input-field sm:w-64" value="${escapeHtml(state.playerSearch)}" />
                    <button id="players-update-all" type="button" class="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-bg-elevated hover:bg-bg-hover border border-slate-700 text-sm font-medium text-slate-100 transition shrink-0">
                        <i data-lucide="refresh-cw" class="w-4 h-4"></i>
                        <span>Aktualizovať všetkých</span>
                    </button>
                </div>
            </div>

            <div class="overflow-x-auto">
                <table class="w-full text-left border-collapse">
                    <thead>
                        <tr class="bg-bg-elevated/60 text-xs uppercase tracking-wider text-slate-400">
                            <th class="px-4 py-3 font-medium">Hráč</th>
                            <th class="px-4 py-3 font-medium">Steam64 ID / Leetify</th>
                            <th class="px-4 py-3 font-medium">Premier Elo</th>
                            <th class="px-4 py-3 font-medium text-right">Akcie</th>
                        </tr>
                    </thead>
                    <tbody id="players-tbody">
                        ${renderPlayersTableRows()}
                    </tbody>
                </table>
            </div>
        </div>
    `;

    const memberInput = document.getElementById('fl-member-input');
    const memberHidden = document.getElementById('fl-user-id');
    const memberClear = document.getElementById('fl-member-clear');
    const memberDropdown = document.getElementById('fl-member-dropdown');

    function openMemberDropdown(query = '') {
        memberDropdown.innerHTML = buildMemberDropdownItemsHtml(query);
        memberDropdown.classList.remove('hidden');
        memberDropdown.querySelectorAll('[data-member-pick]').forEach(item => {
            item.addEventListener('click', () => {
                memberHidden.value = item.dataset.memberPick;
                memberInput.value = item.dataset.memberLabel;
                memberClear.classList.remove('hidden');
                memberDropdown.classList.add('hidden');
            });
        });
    }

    memberInput.addEventListener('focus', () => {
        const query = memberHidden.value ? '' : memberInput.value;
        openMemberDropdown(query);
    });

    memberInput.addEventListener('input', () => {
        memberHidden.value = '';
        memberClear.classList.toggle('hidden', !memberInput.value);
        openMemberDropdown(memberInput.value);
    });

    memberInput.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            memberDropdown.classList.add('hidden');
        }
    });

    memberClear.addEventListener('click', () => {
        memberHidden.value = '';
        memberInput.value = '';
        memberClear.classList.add('hidden');
        openMemberDropdown('');
        memberInput.focus();
    });

    document.getElementById('force-link-form').addEventListener('submit', async e => {
        e.preventDefault();
        const userId = memberHidden.value;
        const profile = document.getElementById('fl-profile').value.trim();
        const btn = document.getElementById('fl-submit-btn');

        if (!userId) {
            showToast('Najprv vyber člena servera zo zoznamu.', 'error');
            memberInput.focus();
            openMemberDropdown(memberInput.value);
            return;
        }

        await setButtonLoading(btn, true, 'Prepájam...');
        try {
            const res = await apiFetch('/api/players/link', {
                method: 'POST',
                body: JSON.stringify({ userId, profile })
            });
            const eloText = typeof res.elo === 'number' ? res.elo.toLocaleString('sk-SK') : 'Unranked';
            showToast(`Účet prepojený (${eloText}).`);
            memberHidden.value = '';
            memberInput.value = '';
            memberClear.classList.add('hidden');
            document.getElementById('fl-profile').value = '';
            await refreshOverviewAndPlayers();
        } catch (err) {
            showToast(err.message, 'error');
        } finally {
            await setButtonLoading(btn, false);
        }
    });

    document.getElementById('players-search').addEventListener('input', e => {
        state.playerSearch = e.target.value;
        document.getElementById('players-tbody').innerHTML = renderPlayersTableRows();
        attachPlayerTableListeners();
        refreshIcons();
    });

    document.getElementById('players-update-all').addEventListener('click', async e => {
        const btn = e.currentTarget;
        await setButtonLoading(btn, true, 'Aktualizujem...');
        try {
            const res = await apiFetch('/api/players/update-all', { method: 'POST' });
            showToast(`Aktualizovaných ${res.updated}/${res.total} hráčov.`);
            await refreshOverviewAndPlayers();
        } catch (err) {
            showToast(err.message, 'error');
        } finally {
            await setButtonLoading(btn, false);
        }
    });

    attachPlayerTableListeners();
    refreshIcons();
}

// --- OZNÁMENIA / EMBED BUILDER ---

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
        ? `<span class="px-1 py-0.5 rounded bg-brand/30 text-indigo-200 font-medium">${escapeHtml(roleObj?.isEveryone ? '@everyone' : `@${roleObj?.name || 'rola'}`)}</span> `
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
                    <span class="text-xs text-slate-500">Dnes</span>
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
                                ${escapeHtml(footer)}${(footer && timestamp) ? ' • ' : ''}${timestamp ? 'Dnes' : ''}
                            </div>
                        ` : ''}
                    </div>
                ` : '<p class="text-xs text-slate-500 mt-2 italic">Začni písať text alebo embed na zobrazenie náhľadu...</p>'}
            </div>
        </div>
    `;
}

function renderAnnouncements() {
    const container = document.getElementById('section-announcements');
    const editing = state.editingAnnouncement;
    const history = state.announcementsHistory || [];

    container.innerHTML = `
        <div class="grid grid-cols-1 xl:grid-cols-12 gap-6">
            <div class="xl:col-span-7 card p-6 space-y-5">
                <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <h3 class="text-base font-semibold text-white flex items-center gap-2">
                        <i data-lucide="megaphone" class="w-4 h-4 text-brand"></i>
                        <span>${editing ? 'Upraviť odoslané oznámenie' : 'Vytvoriť nové oznámenie'}</span>
                    </h3>
                    ${editing ? `
                        <button id="ann-cancel-edit" type="button" class="px-3 py-1.5 rounded-xl bg-bg-elevated hover:bg-bg-hover border border-slate-700 text-xs text-slate-200 transition">
                            Prepnúť na novú správu
                        </button>
                    ` : ''}
                </div>

                ${history.length > 0 ? `
                    <div class="p-3.5 rounded-xl bg-bg-elevated/70 border border-slate-800 space-y-1.5">
                        <label class="text-xs font-medium text-slate-400">Načítať a upraviť posledné oznámenie (voliteľné)</label>
                        <select id="ann-history-select" class="input-field">
                            <option value="">— Vytvoriť nové oznámenie —</option>
                            ${history.map((h, i) => `
                                <option value="${i}" ${editing && editing.messageId === h.messageId ? 'selected' : ''}>
                                    #${escapeHtml(h.channelName || h.channelId)} — ${escapeHtml(h.title || h.content || 'Bez nadpisu')}
                                </option>
                            `).join('')}
                        </select>
                    </div>
                ` : ''}

                <form id="ann-form" class="space-y-4">
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div class="space-y-1.5">
                            <label class="text-xs font-medium text-slate-400">Cieľový kanál</label>
                            <select id="ann-channel" class="input-field" ${editing ? 'disabled' : ''}>
                                ${buildTextChannelOptions(editing?.channelId || '')}
                            </select>
                        </div>
                        <div class="space-y-1.5">
                            <label class="text-xs font-medium text-slate-400">Ping rola (voliteľné)</label>
                            <select id="ann-role" class="input-field">
                                ${buildRoleOptions(editing?.roleId || '', { allowNone: true, noneLabel: '— Bez pingu —', allowEveryone: true })}
                            </select>
                        </div>
                    </div>

                    <div class="space-y-1.5">
                        <label class="text-xs font-medium text-slate-400">Obyčajný text nad embedom (voliteľné)</label>
                        <input id="ann-content" type="text" maxlength="2000" class="input-field" value="${escapeHtml(editing?.content || '')}" placeholder="Krátka správa alebo oznámenie..." />
                    </div>

                    <div class="grid grid-cols-1 md:grid-cols-12 gap-4">
                        <div class="md:col-span-9 space-y-1.5">
                            <label class="text-xs font-medium text-slate-400">Nadpis embedu</label>
                            <input id="ann-title" type="text" maxlength="256" class="input-field" value="${escapeHtml(editing?.title || '')}" placeholder="Napr. Pravidlá servera alebo CS2 Turnaj" />
                        </div>
                        <div class="md:col-span-3 space-y-1.5">
                            <label class="text-xs font-medium text-slate-400">Farba</label>
                            <input id="ann-color" type="color" class="w-full h-[42px] rounded-xl bg-bg-base border border-slate-700 cursor-pointer p-1" value="${escapeHtml(editing?.color || '#5865F2')}" />
                        </div>
                    </div>

                    <div class="space-y-1.5">
                        <label class="text-xs font-medium text-slate-400">Popis embedu (podporuje Discord Markdown)</label>
                        <textarea id="ann-description" rows="5" maxlength="4096" class="input-field resize-y" placeholder="Text oznámenia...">${escapeHtml(editing?.description || '')}</textarea>
                    </div>

                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div class="space-y-1.5">
                            <label class="text-xs font-medium text-slate-400">Thumbnail URL (malý obrázok vpravo)</label>
                            <input id="ann-thumb" type="url" class="input-field" value="${escapeHtml(editing?.thumbnailUrl || '')}" placeholder="https://..." />
                        </div>
                        <div class="space-y-1.5">
                            <label class="text-xs font-medium text-slate-400">Veľký obrázok URL (banner)</label>
                            <input id="ann-image" type="url" class="input-field" value="${escapeHtml(editing?.imageUrl || '')}" placeholder="https://..." />
                        </div>
                    </div>

                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
                        <div class="space-y-1.5">
                            <label class="text-xs font-medium text-slate-400">Footer text (voliteľné)</label>
                            <input id="ann-footer" type="text" maxlength="2048" class="input-field" value="${escapeHtml(editing?.footerText || '')}" placeholder="BOT Gaben • ROAD TO 1K" />
                        </div>
                        <div class="flex flex-col gap-2.5 pt-4">
                            <label class="flex items-center justify-between gap-3 text-xs text-slate-300">
                                <span>Zobraziť čas odoslania (Timestamp)</span>
                                ${renderToggleSwitch('ann-timestamp', editing ? Boolean(editing.timestamp) : true)}
                            </label>
                            ${!editing ? `
                                <label class="flex items-center justify-between gap-3 text-xs text-slate-300">
                                    <span>Automaticky publikovať (Announcement kanál)</span>
                                    ${renderToggleSwitch('ann-crosspost', false)}
                                </label>
                            ` : ''}
                        </div>
                    </div>

                    <div class="flex justify-end pt-2">
                        <button id="ann-submit-btn" type="submit" class="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand hover:bg-brand-hover text-white text-sm font-semibold transition">
                            <i data-lucide="send" class="w-4 h-4"></i>
                            <span>${editing ? 'Uložiť úpravu správy' : 'Odoslať oznámenie'}</span>
                        </button>
                    </div>
                </form>
            </div>

            <div class="xl:col-span-5 card p-6 flex flex-col">
                <h3 class="text-base font-semibold text-white mb-4 flex items-center gap-2">
                    <i data-lucide="eye" class="w-4 h-4 text-sky-400"></i>
                    <span>Živý Discord náhľad</span>
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

    const histSelect = document.getElementById('ann-history-select');
    if (histSelect) {
        histSelect.addEventListener('change', () => {
            const idx = histSelect.value;
            state.editingAnnouncement = idx === '' ? null : state.announcementsHistory[Number(idx)] || null;
            renderAnnouncements();
        });
    }

    const cancelEditBtn = document.getElementById('ann-cancel-edit');
    if (cancelEditBtn) {
        cancelEditBtn.addEventListener('click', () => {
            state.editingAnnouncement = null;
            renderAnnouncements();
        });
    }

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

        await setButtonLoading(btn, true, editing ? 'Upravujem...' : 'Posielam...');
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
            showToast(editing ? 'Oznámenie bolo upravené.' : 'Oznámenie bolo odoslané do kanála.');
        } catch (err) {
            showToast(err.message, 'error');
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
        if (state.logCategory !== 'all' && item.category !== state.logCategory) return false;
        if (q && !item.message.toLowerCase().includes(q) && !(item.actor || '').toLowerCase().includes(q)) return false;
        return true;
    });

    if (list.length === 0) {
        return `<div class="p-8 text-center text-sm text-slate-400">Zatiaľ nie sú zaznamenané žiadne udalosti pre tento filter.</div>`;
    }

    const levelStyles = {
        success: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
        warn: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
        error: 'bg-red-500/15 text-red-300 border-red-500/30',
        info: 'bg-sky-500/15 text-sky-300 border-sky-500/30'
    };

    const categoryLabels = {
        dashboard: 'Dashboard',
        elo: 'CS2 Elo',
        tempvoice: 'TempVoice',
        patchbot: 'PatchBot',
        joinroles: 'Join Roles',
        adminlog: 'Admin Log',
        system: 'Systém'
    };

    return list.map(item => `
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-4 py-3 border-t border-slate-800/75 hover:bg-bg-elevated/40 transition">
            <div class="flex items-start sm:items-center gap-3 min-w-0">
                <span class="px-2 py-0.5 rounded-full text-[11px] font-semibold border shrink-0 ${levelStyles[item.level] || levelStyles.info}">
                    ${escapeHtml(categoryLabels[item.category] || item.category)}
                </span>
                <span class="text-sm text-slate-200 break-words">${escapeHtml(item.message)}</span>
            </div>
            <div class="flex items-center gap-2 text-xs text-slate-400 shrink-0">
                ${item.actor ? `<span class="px-2 py-0.5 rounded-md bg-bg-elevated border border-slate-800 text-slate-300">${escapeHtml(item.actor)}</span>` : ''}
                <span>${escapeHtml(new Date(item.timestamp).toLocaleTimeString('sk-SK'))}</span>
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
        { id: 'all', label: 'Všetko' },
        { id: 'dashboard', label: 'Dashboard' },
        { id: 'elo', label: 'CS2 Elo' },
        { id: 'tempvoice', label: 'TempVoice' },
        { id: 'patchbot', label: 'PatchBot' },
        { id: 'joinroles', label: 'Join Roles' },
        { id: 'adminlog', label: 'Admin Log' }
    ];

    container.innerHTML = `
        <div class="card overflow-hidden">
            <div class="p-5 border-b border-slate-800/90 space-y-4">
                <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                        <h3 class="text-base font-semibold text-white flex items-center gap-2">
                            <i data-lucide="scroll-text" class="w-4 h-4 text-brand"></i>
                            <span>Živý Activity Log bota</span>
                        </h3>
                        <p class="text-xs text-slate-400 mt-0.5">Posledných 150 udalostí od štartu bota (automaticky sa obnovuje každých 5 s).</p>
                    </div>
                    <div class="flex items-center gap-2">
                        <input id="logs-search" type="text" placeholder="Hľadať v logu..." class="input-field sm:w-56" value="${escapeHtml(state.logSearch)}" />
                        <button id="logs-clear-btn" type="button" class="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-red-500/15 hover:bg-red-500/25 border border-red-500/30 text-xs font-medium text-red-300 transition shrink-0">
                            <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                            <span>Vyčistiť</span>
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

    document.getElementById('logs-clear-btn').addEventListener('click', async e => {
        const btn = e.currentTarget;
        await setButtonLoading(btn, true, 'Čistím...');
        try {
            const res = await apiFetch('/api/logs', { method: 'DELETE' });
            state.logs = res.logs || [];
            patchLogsDom();
            showToast('Activity Log bol vyčistený.');
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
        return `<p class="text-sm text-slate-400 py-4 text-center">Momentálne nie sú otvorené žiadne dočasné miestnosti.</p>`;
    }

    return `
        <div class="space-y-3">
            ${state.tempRooms.map(r => `
                <div class="p-4 rounded-xl bg-bg-elevated border border-slate-800 space-y-3">
                    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div class="min-w-0">
                            <div class="flex items-center gap-2 flex-wrap">
                                <span class="font-semibold text-white text-sm truncate">${escapeHtml(r.name)}</span>
                                <span class="text-xs px-2 py-0.5 rounded-full ${r.locked ? 'bg-red-500/15 text-red-300 border border-red-500/30' : 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'}">
                                    ${r.locked ? '🔒 Zamknutá' : '🔓 Odomknutá'}
                                </span>
                            </div>
                            <div class="text-xs text-slate-400 mt-1">
                                Majiteľ: <strong class="text-slate-200">${escapeHtml(r.ownerName)}</strong> •
                                Hráči: ${r.memberCount}/${r.userLimit === 0 ? '∞' : r.userLimit} •
                                ${r.bitrateKbps} kbps
                            </div>
                        </div>
                        <div class="flex items-center flex-wrap gap-2 shrink-0">
                            <button type="button" data-tv-rename="${escapeHtml(r.channelId)}" data-tv-name="${escapeHtml(r.name)}" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-bg-surface hover:bg-bg-hover border border-slate-700 text-xs font-medium text-slate-200 transition">
                                <i data-lucide="pencil" class="w-3.5 h-3.5"></i>
                                <span>Premenovať</span>
                            </button>
                            <button type="button" data-tv-lock="${escapeHtml(r.channelId)}" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-bg-surface hover:bg-bg-hover border border-slate-700 text-xs font-medium text-slate-200 transition">
                                <i data-lucide="${r.locked ? 'unlock' : 'lock'}" class="w-3.5 h-3.5"></i>
                                <span>${r.locked ? 'Odomknúť' : 'Zamknúť'}</span>
                            </button>
                            <button type="button" data-tv-close="${escapeHtml(r.channelId)}" data-tv-name="${escapeHtml(r.name)}" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/15 hover:bg-red-500/25 border border-red-500/30 text-xs font-medium text-red-300 transition">
                                <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                                <span>Zavrieť</span>
                            </button>
                        </div>
                    </div>

                    ${(r.members && r.members.length > 0) ? `
                        <div class="pt-2.5 border-t border-slate-800/80 flex flex-wrap gap-2">
                            ${r.members.map(m => `
                                <div class="inline-flex items-center gap-2 px-2.5 py-1 rounded-lg bg-bg-surface border border-slate-700/70 text-xs">
                                    <img src="${escapeHtml(m.avatarUrl)}" alt="" class="w-4 h-4 rounded-full object-cover" />
                                    <span class="text-slate-200 font-medium">${m.isOwner ? '👑 ' : ''}${escapeHtml(m.displayName)}</span>
                                    <button type="button" data-tv-kick-room="${escapeHtml(r.channelId)}" data-tv-kick-user="${escapeHtml(m.id)}" data-tv-kick-name="${escapeHtml(m.displayName)}" title="Odpojiť z miestnosti" class="text-slate-400 hover:text-red-400 transition ml-0.5">
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
                showToast(`Miestnosť premenovaná na „${newName}“.`);
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
                showToast(res.locked ? 'Miestnosť bola zamknutá.' : 'Miestnosť bola odomknutá.');
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
                title: 'Zavrieť dočasnú miestnosť?',
                message: `Miestnosť „${name}“ bude okamžite zmazaná z Discord servera.`,
                confirmLabel: 'Zavrieť miestnosť'
            });
            if (!ok) return;

            await setButtonLoading(btn, true, 'Mažem...');
            try {
                await apiFetch(`/api/tempvoice/rooms/${encodeURIComponent(channelId)}`, { method: 'DELETE' });
                showToast(`Miestnosť ${name} bola zatvorená.`);
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
                title: 'Odpojiť hráča z miestnosti?',
                message: `Hráč ${name} bude odpojený z hlasového kanála.`,
                confirmLabel: 'Odpojiť'
            });
            if (!ok) return;

            try {
                await apiFetch(`/api/tempvoice/rooms/${encodeURIComponent(channelId)}/kick/${encodeURIComponent(userId)}`, { method: 'POST' });
                showToast(`Hráč ${name} bol odpojený z miestnosti.`);
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
        createTriggerChannel: card.querySelector('.tv-setup-create').checked,
        categoryId: card.querySelector('.tv-setup-category').value || null,
        triggerName: card.querySelector('.tv-setup-trigger-name').value,
        roomNameTemplate: card.querySelector('.tv-setup-template').value,
        userLimit: Number(card.querySelector('.tv-setup-limit').value),
        bitrateKbps: Number(card.querySelector('.tv-setup-bitrate').value)
    }));
}

function buildTempVoiceSetupCardsHtml() {
    const maxBitrate = state.meta?.maxBitrateKbps || 96;
    if (state.tvDraftSetups.length === 0) {
        return `<div class="p-6 rounded-xl bg-bg-elevated/60 border border-slate-800 text-center text-sm text-slate-400">Zatiaľ nemáš žiadny TempVoice kanál. Klikni na <strong>Pridať TempVoice</strong> nižšie.</div>`;
    }

    return state.tvDraftSetups.map((setup, idx) => `
        <div class="tv-setup-card p-5 rounded-2xl bg-bg-elevated/70 border border-slate-800 space-y-4" data-setup-id="${escapeHtml(setup.id)}">
            <div class="flex items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
                <div class="flex items-center gap-3">
                    <span class="w-7 h-7 rounded-lg bg-brand/15 text-brand text-xs font-bold flex items-center justify-center">#${idx + 1}</span>
                    <div>
                        <div class="text-sm font-semibold text-white">TempVoice konfigurácia #${idx + 1}</div>
                        <div class="text-xs text-slate-400">Nezávislý spúšťací VC a šablóna miestností</div>
                    </div>
                </div>
                <div class="flex items-center gap-3">
                    <div class="inline-flex items-center gap-2 text-xs text-slate-300">
                        <span>Aktívny</span>
                        ${renderToggleSwitch('', setup.enabled, 'tv-setup-enabled')}
                    </div>
                    <button type="button" data-tv-remove="${idx}" title="Odstrániť túto konfiguráciu" class="p-2 rounded-lg bg-red-500/15 hover:bg-red-500/25 border border-red-500/30 text-red-300 transition">
                        <i data-lucide="trash-2" class="w-4 h-4"></i>
                    </button>
                </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div class="space-y-1.5">
                    <label class="text-xs font-medium text-slate-400">Spúšťací hlasový kanál (Trigger VC)</label>
                    <select class="tv-setup-trigger input-field">
                        ${buildVoiceChannelOptions(setup.triggerChannelId)}
                    </select>
                    <label class="inline-flex items-center gap-2 text-xs text-slate-300 mt-1.5 cursor-pointer">
                        <input type="checkbox" class="tv-setup-create accent-brand rounded" ${setup.createTriggerChannel ? 'checked' : ''} />
                        <span>Vytvoriť nový spúšťací kanál na serveri</span>
                    </label>
                </div>

                <div class="space-y-1.5">
                    <label class="text-xs font-medium text-slate-400">Kategória</label>
                    <select class="tv-setup-category input-field">
                        ${buildCategoryOptions(setup.categoryId)}
                    </select>
                </div>

                <div class="space-y-1.5">
                    <label class="text-xs font-medium text-slate-400">Názov spúšťacieho kanála</label>
                    <input type="text" maxlength="100" required class="tv-setup-trigger-name input-field" value="${escapeHtml(setup.triggerName || '➕ Vytvoriť miestnosť')}" />
                </div>

                <div class="space-y-1.5">
                    <label class="text-xs font-medium text-slate-400">Šablóna názvu (<code class="text-slate-300">{user}</code>, <code class="text-slate-300">{username}</code>)</label>
                    <input type="text" maxlength="100" required class="tv-setup-template input-field" value="${escapeHtml(setup.roomNameTemplate || '🎮 {user}')}" />
                </div>

                <div class="space-y-1.5">
                    <label class="text-xs font-medium text-slate-400">Predvolený limit hráčov (0–99, 0 = bez limitu)</label>
                    <input type="number" min="0" max="99" required class="tv-setup-limit input-field" value="${Number(setup.userLimit ?? 0)}" />
                </div>

                <div class="space-y-1.5">
                    <label class="text-xs font-medium text-slate-400">Bitrate v kbps (8–384, limit servera: ${maxBitrate} kbps)</label>
                    <input type="number" min="8" max="384" required class="tv-setup-bitrate input-field" value="${Number(setup.bitrateKbps ?? 64)}" />
                </div>
            </div>
        </div>
    `).join('');
}

function attachTempVoiceSetupListeners() {
    document.querySelectorAll('[data-tv-remove]').forEach(btn => {
        btn.addEventListener('click', async () => {
            const idx = Number(btn.dataset.tvRemove);
            const ok = await confirmAction({
                title: 'Odstrániť TempVoice konfiguráciu?',
                message: `Odstráni sa konfigurácia #${idx + 1} zo zoznamu (kanál na Discorde ostane zachovaný).`,
                confirmLabel: 'Odstrániť'
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
                <i data-lucide="sliders" class="w-4 h-4 text-brand"></i>
                <span>Nastavenia TempVoice</span>
            </h3>

            <form id="tv-settings-form" class="space-y-5">
                <div class="flex items-center justify-between gap-4 p-4 rounded-xl bg-bg-elevated border border-slate-800">
                    <div>
                        <div class="text-sm font-semibold text-white">Zapnúť TempVoice modul</div>
                        <div class="text-xs text-slate-400">Deaktivácia iba pozastaví vytváranie nových miestností — všetky nastavenia aj kanály ostanú zachované.</div>
                    </div>
                    ${renderToggleSwitch('tv-global-enabled', tv.enabled)}
                </div>

                <div id="tv-setups-list" class="space-y-4">
                    ${buildTempVoiceSetupCardsHtml()}
                </div>

                <div>
                    ${renderAddButtonHtml('tv-add-setup-btn', 'Pridať TempVoice')}
                </div>

                <div class="flex justify-end pt-2">
                    <button id="tv-save-btn" type="submit" class="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand hover:bg-brand-hover text-white text-sm font-semibold transition">
                        <i data-lucide="save" class="w-4 h-4"></i>
                        <span>Uložiť TempVoice nastavenia</span>
                    </button>
                </div>
            </form>
        </div>

        <div class="card p-6">
            <div class="flex items-center justify-between gap-3 mb-4">
                <div>
                    <h3 id="tv-rooms-heading" class="text-base font-semibold text-white">Aktívne dočasné miestnosti (${state.tempRooms.length})</h3>
                    <p class="text-xs text-slate-400 mt-0.5">Na diaľku ich môžeš premenovať, zamknúť, odomknúť, zavrieť alebo odpojiť hráča.</p>
                </div>
                <button id="tv-refresh-rooms" type="button" class="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-bg-elevated hover:bg-bg-hover border border-slate-700 text-xs font-medium text-slate-200 transition">
                    <i data-lucide="refresh-cw" class="w-3.5 h-3.5"></i>
                    <span>Obnoviť</span>
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
            triggerName: '➕ Vytvoriť miestnosť',
            roomNameTemplate: '🎮 {user}',
            bitrateKbps: 64,
            userLimit: 0
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
        await setButtonLoading(btn, true, 'Ukladám...');
        try {
            const res = await apiFetch('/api/settings/tempvoice', {
                method: 'PUT',
                body: JSON.stringify({
                    enabled: document.getElementById('tv-global-enabled').checked,
                    setups: state.tvDraftSetups
                })
            });
            state.settings.tempVoice = res.tempVoice;
            syncDraftsFromSettings();
            setDirty(false);
            await refreshMetaAndOverview();
            renderTempVoice();
            showToast('Nastavenia TempVoice boli uložené.');
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
            showToast('Zoznam miestností obnovený.', 'info');
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
        return `<p class="text-xs text-slate-400 py-2">Zatiaľ nie je pridaný žiadny kanál. Pridaj kanál tlačidlom nižšie.</p>`;
    }

    return state.pbDraftChannelIds.map((channelId, idx) => `
        <div class="flex items-center gap-2">
            <select class="pb-channel-select input-field flex-1">
                ${buildTextChannelOptions(channelId, { allowNone: true, noneLabel: '— Vyber kanál —' })}
            </select>
            <button type="button" data-pb-remove-channel="${idx}" title="Odobrať kanál" class="p-2.5 rounded-xl bg-red-500/15 hover:bg-red-500/25 border border-red-500/30 text-red-300 transition shrink-0">
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
                <i data-lucide="newspaper" class="w-4 h-4 text-brand-gold"></i>
                <span>CS2 PatchBot (automatické novinky zo Steamu)</span>
            </h3>

            <form id="pb-form" class="space-y-5">
                <div class="flex items-center justify-between gap-4 p-4 rounded-xl bg-bg-elevated border border-slate-800">
                    <div>
                        <div class="text-sm font-semibold text-white">Zapnúť CS2 PatchBota</div>
                        <div class="text-xs text-slate-400">Kontroluje nové CS2 updaty každých 5 minút. Pri vypnutí ostanú nastavenia zachované.</div>
                    </div>
                    ${renderToggleSwitch('pb-enabled', pb.enabled)}
                </div>

                <div class="space-y-2.5">
                    <label class="text-xs font-medium text-slate-400 block">Cieľové kanály pre CS2 updaty</label>
                    <div id="pb-channels-list" class="space-y-2">
                        ${buildPatchBotChannelRowsHtml()}
                    </div>
                    <div class="pt-1">
                        ${renderAddButtonHtml('pb-add-channel-btn', 'Pridať kanál')}
                    </div>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div class="space-y-1.5">
                        <label class="text-xs font-medium text-slate-400">Typ správ</label>
                        <select id="pb-mode" class="input-field">
                            <option value="all" ${pb.mode !== 'patchnotes' ? 'selected' : ''}>Všetky oficiálne CS2 oznámenia</option>
                            <option value="patchnotes" ${pb.mode === 'patchnotes' ? 'selected' : ''}>Len Patch Notes (Release Notes)</option>
                        </select>
                    </div>

                    <div class="space-y-1.5">
                        <label class="text-xs font-medium text-slate-400">Ping rola pri novom update</label>
                        <select id="pb-role" class="input-field">
                            ${buildRoleOptions(pb.roleId, { allowNone: true, noneLabel: '— Bez pingu —', allowEveryone: true })}
                        </select>
                    </div>
                </div>

                <div class="flex items-center justify-between flex-wrap gap-3 pt-2">
                    <div class="text-xs text-slate-400">
                        Posledný odoslaný update:
                        <strong class="text-slate-200">${escapeHtml(pb.lastPostedTitle || 'Zatiaľ žiadny')}</strong>
                        ${pb.lastPostedAt ? `(${escapeHtml(formatRelativeTimestamp(pb.lastPostedAt))})` : ''}
                    </div>
                    <button id="pb-save-btn" type="submit" class="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand hover:bg-brand-hover text-white text-sm font-semibold transition">
                        <i data-lucide="save" class="w-4 h-4"></i>
                        <span>Uložiť PatchBot nastavenia</span>
                    </button>
                </div>
            </form>
        </div>

        <div class="card p-6">
            <h3 class="text-base font-semibold text-white mb-2">Otestovať / poslať najnovší CS2 príspevok</h3>
            <p class="text-xs text-slate-400 mb-4">Okamžite stiahne najnovší príspevok podľa zvoleného režimu a odošle ho do všetkých nastavených kanálov.</p>
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <label class="inline-flex items-center gap-3 text-sm text-slate-300 cursor-pointer">
                    ${renderToggleSwitch('pb-test-ping', false)}
                    <span>Označiť nastavenú ping rolu</span>
                </label>
                <button id="pb-send-latest-btn" type="button" class="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-bg-elevated hover:bg-bg-hover border border-slate-700 text-sm font-medium text-white transition">
                    <i data-lucide="send" class="w-4 h-4"></i>
                    <span>Poslať najnovší update teraz</span>
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
        await setButtonLoading(btn, true, 'Ukladám...');
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
            showToast('Nastavenia CS2 PatchBota uložené.');
        } catch (err) {
            showToast(err.message, 'error');
        } finally {
            await setButtonLoading(btn, false);
        }
    });

    document.getElementById('pb-send-latest-btn').addEventListener('click', async e => {
        const btn = e.currentTarget;
        await setButtonLoading(btn, true, 'Posielam...');
        try {
            const withPing = document.getElementById('pb-test-ping').checked;
            const res = await apiFetch('/api/patchbot/latest', {
                method: 'POST',
                body: JSON.stringify({ withPing })
            });
            state.settings.patchBot = res.patchBot;
            syncDraftsFromSettings();
            renderPatchBot();
            showToast(`Odoslané do ${res.sentCount} kanálov: ${res.title}`);
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
        return `<p class="text-xs text-slate-400 py-2">Zatiaľ žiadna rola. Pridaj rolu tlačidlom nižšie.</p>`;
    }

    return roleIds.map((roleId, idx) => `
        <div class="flex items-center gap-2">
            <select class="${selectClass} input-field flex-1">
                ${buildRoleOptions(roleId, { allowNone: true, noneLabel: '— Vyber rolu —', onlyAssignable: true })}
            </select>
            <button type="button" ${removeAttr}="${idx}" title="Odobrať rolu" class="p-2.5 rounded-xl bg-red-500/15 hover:bg-red-500/25 border border-red-500/30 text-red-300 transition shrink-0">
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
                <span>Join Roles (automatické role po pripojení)</span>
            </h3>

            <form id="jr-form" class="space-y-5">
                <div class="flex items-center justify-between gap-4 p-4 rounded-xl bg-bg-elevated border border-slate-800">
                    <div>
                        <div class="text-sm font-semibold text-white">Zapnúť automatické Join Roles</div>
                        <div class="text-xs text-slate-400">Noví členovia a boti dostanú vybrané role po vstupe na server. Pri vypnutí sa nič nevymaže.</div>
                    </div>
                    ${renderToggleSwitch('jr-enabled', jr.enabled)}
                </div>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div class="p-4 rounded-2xl bg-bg-elevated/60 border border-slate-800 space-y-3">
                        <div class="flex items-center gap-2 text-sm font-semibold text-white">
                            <i data-lucide="user" class="w-4 h-4 text-brand"></i>
                            <span>Role pre bežných hráčov</span>
                        </div>
                        <div id="jr-member-list" class="space-y-2">
                            ${buildJoinRoleRowsHtml(state.jrDraftMemberRoleIds, 'jr-member-select', 'data-jr-remove-member')}
                        </div>
                        ${renderAddButtonHtml('jr-add-member-btn', 'Pridať rolu pre hráčov')}
                    </div>

                    <div class="p-4 rounded-2xl bg-bg-elevated/60 border border-slate-800 space-y-3">
                        <div class="flex items-center gap-2 text-sm font-semibold text-white">
                            <i data-lucide="bot" class="w-4 h-4 text-sky-400"></i>
                            <span>Role pre botov</span>
                        </div>
                        <div id="jr-bot-list" class="space-y-2">
                            ${buildJoinRoleRowsHtml(state.jrDraftBotRoleIds, 'jr-bot-select', 'data-jr-remove-bot')}
                        </div>
                        ${renderAddButtonHtml('jr-add-bot-btn', 'Pridať rolu pre botov')}
                    </div>
                </div>

                <div class="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-200 flex items-start gap-2.5">
                    <i data-lucide="info" class="w-4 h-4 mt-0.5 shrink-0 text-amber-400"></i>
                    <span>Rola bota musí byť v nastaveniach rolí Discord servera umiestnená <strong>vyššie</strong> ako všetky vybrané join role.</span>
                </div>

                <div class="flex justify-end">
                    <button id="jr-save-btn" type="submit" class="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand hover:bg-brand-hover text-white text-sm font-semibold transition">
                        <i data-lucide="save" class="w-4 h-4"></i>
                        <span>Uložiť Join Roles</span>
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
        await setButtonLoading(btn, true, 'Ukladám...');
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
            showToast('Nastavenia Join Roles boli uložené.');
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
                <span>Živý stav CS2 a Steam serverov</span>
            </h3>

            <form id="cs-form" class="space-y-5">
                <div class="flex items-center justify-between gap-4 p-4 rounded-xl bg-bg-elevated border border-slate-800">
                    <div>
                        <div class="text-sm font-semibold text-white">Zapnúť automatický embed so stavom serverov</div>
                        <div class="text-xs text-slate-400">Upravuje jednu embed správu v určenom kanáli. Pri vypnutí ostane všetko zachované.</div>
                    </div>
                    ${renderToggleSwitch('cs-enabled', cs.enabled)}
                </div>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div class="space-y-1.5">
                        <label class="text-xs font-medium text-slate-400">Cieľový kanál</label>
                        <select id="cs-channel" class="input-field">
                            ${buildTextChannelOptions(cs.channelId)}
                        </select>
                    </div>

                    <div class="space-y-1.5">
                        <label class="text-xs font-medium text-slate-400">Interval obnovy (30 s až 60 min)</label>
                        <div class="flex items-center gap-2">
                            <input id="cs-interval-num" type="number" min="1" max="3600" required class="input-field flex-1" value="${parts.value}" />
                            <select id="cs-interval-unit" class="input-field w-36">
                                <option value="s" ${parts.unit === 's' ? 'selected' : ''}>Sekúnd</option>
                                <option value="m" ${parts.unit === 'm' ? 'selected' : ''}>Minút</option>
                            </select>
                        </div>
                    </div>
                </div>

                <div class="p-4 rounded-xl bg-bg-elevated border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-300">
                    <div class="space-y-1">
                        <div>Aktuálny interval: <strong>${escapeHtml(formatIntervalLabel(cs.intervalSeconds))}</strong></div>
                        <div>Režim dát: <strong>${state.steamApiKeyConfigured ? 'Plný CS2/EU režim (STEAM_API_KEY aktívny)' : 'Základný Steam + CS2 hráči režim'}</strong></div>
                    </div>
                    <div class="flex items-center gap-2">
                        ${messageLink ? `
                            <a href="${escapeHtml(messageLink)}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-bg-surface hover:bg-bg-hover border border-slate-700 text-slate-200 transition">
                                <i data-lucide="external-link" class="w-3.5 h-3.5"></i>
                                <span>Otvoriť správu</span>
                            </a>
                        ` : ''}
                        <button id="cs-refresh-now" type="button" class="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-bg-surface hover:bg-bg-hover border border-slate-700 text-slate-200 transition">
                            <i data-lucide="refresh-cw" class="w-3.5 h-3.5"></i>
                            <span>Obnoviť stav teraz</span>
                        </button>
                    </div>
                </div>

                <div class="flex justify-end">
                    <button id="cs-save-btn" type="submit" class="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand hover:bg-brand-hover text-white text-sm font-semibold transition">
                        <i data-lucide="save" class="w-4 h-4"></i>
                        <span>Uložiť nastavenia</span>
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
            showToast('Zadaj platné celé číslo pre interval.', 'error');
            return;
        }

        const btn = document.getElementById('cs-save-btn');
        await setButtonLoading(btn, true, 'Ukladám...');
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
            showToast('Nastavenia stavu serverov boli uložené.');
        } catch (err) {
            showToast(err.message, 'error');
        } finally {
            await setButtonLoading(btn, false);
        }
    });

    document.getElementById('cs-refresh-now').addEventListener('click', async e => {
        const btn = e.currentTarget;
        await setButtonLoading(btn, true, 'Obnovujem...');
        try {
            const res = await apiFetch('/api/csstatus/refresh', { method: 'POST' });
            state.settings.csStatus = res.csStatus;
            renderCsStatus();
            showToast('Embed so stavom serverov bol obnovený.');
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
                <span>Rank-Up / Derank oznámenia</span>
            </h3>

            <form id="rf-form" class="space-y-5">
                <div class="flex items-center justify-between gap-4 p-4 rounded-xl bg-bg-elevated border border-slate-800">
                    <div>
                        <div class="text-sm font-semibold text-white">Zapnúť Rank-Up / Derank oznámenia</div>
                        <div class="text-xs text-slate-400">Keď hráč pri aktualizácii prestúpi do iného CS2 Premier pásma, bot pošle kartu do zvoleného kanála.</div>
                    </div>
                    ${renderToggleSwitch('rf-enabled', rf.enabled)}
                </div>

                <div class="space-y-1.5">
                    <label class="text-xs font-medium text-slate-400">Kanál pre oznámenia</label>
                    <select id="rf-channel" class="input-field">
                        ${buildTextChannelOptions(rf.channelId)}
                    </select>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div class="flex items-center justify-between gap-3 p-4 rounded-xl bg-bg-elevated/60 border border-slate-800">
                        <div>
                            <div class="text-sm font-medium text-white">📈 Oznámiť Rank-Up</div>
                            <div class="text-xs text-slate-400">Postup do vyššej farby Premier ranku</div>
                        </div>
                        ${renderToggleSwitch('rf-up', rf.notifyRankUp !== false)}
                    </div>
                    <div class="flex items-center justify-between gap-3 p-4 rounded-xl bg-bg-elevated/60 border border-slate-800">
                        <div>
                            <div class="text-sm font-medium text-white">📉 Oznámiť Derank</div>
                            <div class="text-xs text-slate-400">Pád do nižšej farby Premier ranku</div>
                        </div>
                        ${renderToggleSwitch('rf-down', rf.notifyDerank !== false)}
                    </div>
                </div>

                <div class="flex items-center justify-between flex-wrap gap-3 pt-2">
                    <button id="rf-test-btn" type="button" class="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-bg-elevated hover:bg-bg-hover border border-slate-700 text-sm font-medium text-slate-200 transition">
                        <i data-lucide="send" class="w-4 h-4"></i>
                        <span>Poslať testovacie oznámenie</span>
                    </button>
                    <button id="rf-save-btn" type="submit" class="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand hover:bg-brand-hover text-white text-sm font-semibold transition">
                        <i data-lucide="save" class="w-4 h-4"></i>
                        <span>Uložiť nastavenia</span>
                    </button>
                </div>
            </form>
        </div>
    `;

    document.getElementById('rf-form').addEventListener('submit', async e => {
        e.preventDefault();
        const btn = document.getElementById('rf-save-btn');
        await setButtonLoading(btn, true, 'Ukladám...');
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
            showToast('Nastavenia Rank-Up / Derank boli uložené.');
        } catch (err) {
            showToast(err.message, 'error');
        } finally {
            await setButtonLoading(btn, false);
        }
    });

    document.getElementById('rf-test-btn').addEventListener('click', async e => {
        const btn = e.currentTarget;
        await setButtonLoading(btn, true, 'Posielam...');
        try {
            await apiFetch('/api/rankfeed/test', { method: 'POST' });
            showToast('Testovacie Rank-Up oznámenie bolo odoslané.');
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
        { id: 'al-ev-join', key: 'memberJoin', title: '📥 Príchod člena', desc: 'Zobrazí vek Discord účtu a typ účtu' },
        { id: 'al-ev-leave', key: 'memberLeave', title: '📤 Odchod / Kick člena', desc: 'Zobrazí roly člena a pri kicku aj moderátora' },
        { id: 'al-ev-bans', key: 'bans', title: '🔨 Bany & Unbany', desc: 'Loguje udelené aj zrušené bany na serveri' },
        { id: 'al-ev-timeouts', key: 'timeouts', title: '🔇 Timeouty', desc: 'Loguje udelenie aj zrušenie timeoutu' },
        { id: 'al-ev-roles', key: 'roleChanges', title: '🏷️ Zmeny rolí', desc: 'Pridané a odobrané roly u členov' },
        { id: 'al-ev-voice', key: 'voiceActivity', title: '🎙️ Voice aktivita', desc: 'Pripojenia, odpojenia a presuny medzi VC' }
    ];

    container.innerHTML = `
        <div class="card p-6">
            <h3 class="text-base font-semibold text-white mb-5 flex items-center gap-2">
                <i data-lucide="shield-check" class="w-4 h-4 text-sky-400"></i>
                <span>Discord Admin Log</span>
            </h3>

            <form id="al-form" class="space-y-5">
                <div class="flex items-center justify-between gap-4 p-4 rounded-xl bg-bg-elevated border border-slate-800">
                    <div>
                        <div class="text-sm font-semibold text-white">Zapnúť Discord Admin Log</div>
                        <div class="text-xs text-slate-400">Automaticky zapisuje udalosti servera do vybraného log kanála.</div>
                    </div>
                    ${renderToggleSwitch('al-enabled', al.enabled)}
                </div>

                ${!hasAudit ? `
                    <div class="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-200 flex items-start gap-2.5">
                        <i data-lucide="alert-triangle" class="w-4 h-4 mt-0.5 shrink-0 text-amber-400"></i>
                        <span>Bot momentálne nemá právo <strong>View Audit Log</strong> — logovanie funguje, ale pri banoch, kickoch a timeoutoch nezobrazí meno moderátora.</span>
                    </div>
                ` : ''}

                <div class="space-y-1.5">
                    <label class="text-xs font-medium text-slate-400">Kanál pre Admin Log (napr. #admin-log)</label>
                    <select id="al-channel" class="input-field">
                        ${buildTextChannelOptions(al.channelId)}
                    </select>
                </div>

                <div class="space-y-2.5">
                    <label class="text-xs font-medium text-slate-400 block">Sledované udalosti</label>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                        ${eventRows.map(ev => `
                            <div class="flex items-center justify-between gap-3 p-3.5 rounded-xl bg-bg-elevated/60 border border-slate-800">
                                <div>
                                    <div class="text-sm font-medium text-white">${escapeHtml(ev.title)}</div>
                                    <div class="text-xs text-slate-400">${escapeHtml(ev.desc)}</div>
                                </div>
                                ${renderToggleSwitch(ev.id, Boolean(events[ev.key]))}
                            </div>
                        `).join('')}
                    </div>
                </div>

                <div class="flex items-center justify-between flex-wrap gap-3 pt-2">
                    <button id="al-test-btn" type="button" class="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-bg-elevated hover:bg-bg-hover border border-slate-700 text-sm font-medium text-slate-200 transition">
                        <i data-lucide="send" class="w-4 h-4"></i>
                        <span>Poslať testovací log</span>
                    </button>
                    <button id="al-save-btn" type="submit" class="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand hover:bg-brand-hover text-white text-sm font-semibold transition">
                        <i data-lucide="save" class="w-4 h-4"></i>
                        <span>Uložiť nastavenia</span>
                    </button>
                </div>
            </form>
        </div>
    `;

    document.getElementById('al-form').addEventListener('submit', async e => {
        e.preventDefault();
        const btn = document.getElementById('al-save-btn');
        await setButtonLoading(btn, true, 'Ukladám...');
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
            showToast('Nastavenia Admin Logu boli uložené.');
        } catch (err) {
            showToast(err.message, 'error');
        } finally {
            await setButtonLoading(btn, false);
        }
    });

    document.getElementById('al-test-btn').addEventListener('click', async e => {
        const btn = e.currentTarget;
        await setButtonLoading(btn, true, 'Posielam...');
        try {
            await apiFetch('/api/adminlog/test', { method: 'POST' });
            showToast('Testovacia Admin Log správa bola odoslaná.');
        } catch (err) {
            showToast(err.message, 'error');
        } finally {
            await setButtonLoading(btn, false);
        }
    });

    bindDirtyForm('al-form');
    refreshIcons();
}

// --- VŠEOBECNÉ NASTAVENIA + BOT STATUS + RANK ROLY ---

function renderSettings() {
    const container = document.getElementById('section-settings');
    const s = state.settings || {};
    const bs = s.botStatus || { mode: 'auto', customText: '', activityType: 'Custom' };
    const rankRoles = Array.isArray(s.rankRoles) ? s.rankRoles : [];

    container.innerHTML = `
        <form id="general-settings-form" class="space-y-6">
            <div class="card p-6 space-y-5">
                <h3 class="text-base font-semibold text-white flex items-center gap-2">
                    <i data-lucide="shield" class="w-4 h-4 text-brand"></i>
                    <span>Prístup a obmedzenie príkazov</span>
                </h3>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div class="space-y-1.5">
                        <label class="text-xs font-medium text-slate-400">Rola s prístupom do dashboardu</label>
                        <select id="set-dashboard-role" class="input-field">
                            ${buildRoleOptions(s.dashboardRoleId, { allowNone: true, noneLabel: '— Len majiteľ bota —' })}
                        </select>
                        <p class="text-xs text-slate-500">Majiteľ bota (<code class="text-slate-400">OWNER_ID</code>) má prístup vždy ako poistku.</p>
                    </div>

                    <div class="space-y-1.5">
                        <label class="text-xs font-medium text-slate-400">Povolený kanál pre hráčske slash príkazy</label>
                        <select id="set-allowed-channel" class="input-field">
                            ${buildTextChannelOptions(s.allowedChannelId, { allowNone: true, noneLabel: '— Všetky textové kanály —' })}
                        </select>
                        <p class="text-xs text-slate-500">Tlačidlá TempVoice v hlasových kanáloch fungujú vždy všade.</p>
                    </div>
                </div>
            </div>

            <div class="card p-6 space-y-5">
                <h3 class="text-base font-semibold text-white flex items-center gap-2">
                    <i data-lucide="sparkles" class="w-4 h-4 text-sky-400"></i>
                    <span>Status / aktivita bota na Discorde</span>
                </h3>

                <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div class="space-y-1.5">
                        <label class="text-xs font-medium text-slate-400">Režim statusu</label>
                        <select id="set-status-mode" class="input-field">
                            <option value="auto" ${bs.mode !== 'custom' ? 'selected' : ''}>Automaticky (Sleduje X CS2 hráčov)</option>
                            <option value="custom" ${bs.mode === 'custom' ? 'selected' : ''}>Vlastný text statusu</option>
                        </select>
                    </div>

                    <div class="space-y-1.5">
                        <label class="text-xs font-medium text-slate-400">Typ aktivity</label>
                        <select id="set-status-type" class="input-field" ${bs.mode !== 'custom' ? 'disabled' : ''}>
                            <option value="Custom" ${bs.activityType === 'Custom' ? 'selected' : ''}>Vlastný status (Custom)</option>
                            <option value="Playing" ${bs.activityType === 'Playing' ? 'selected' : ''}>Playing</option>
                            <option value="Watching" ${bs.activityType === 'Watching' ? 'selected' : ''}>Watching</option>
                            <option value="Listening" ${bs.activityType === 'Listening' ? 'selected' : ''}>Listening</option>
                            <option value="Competing" ${bs.activityType === 'Competing' ? 'selected' : ''}>Competing</option>
                        </select>
                    </div>

                    <div class="space-y-1.5">
                        <label class="text-xs font-medium text-slate-400">Vlastný text</label>
                        <input id="set-status-text" type="text" maxlength="128" class="input-field" value="${escapeHtml(bs.customText || '')}" placeholder="Napr. Counter-Strike 2" ${bs.mode !== 'custom' ? 'disabled' : ''} />
                    </div>
                </div>
            </div>

            <div class="card p-6 space-y-5">
                <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                        <h3 class="text-base font-semibold text-white flex items-center gap-2">
                            <i data-lucide="award" class="w-4 h-4 text-brand-gold"></i>
                            <span>Mapovanie CS2 Premier rank rolí</span>
                        </h3>
                        <p class="text-xs text-slate-400 mt-0.5">Zmeny sa prejavia okamžite pri ďalšej aktualizácii rankov bez reštartu bota.</p>
                    </div>
                    <button id="add-rank-row-btn" type="button" class="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-bg-elevated hover:bg-bg-hover border border-slate-700 text-xs font-medium text-slate-200 transition">
                        <i data-lucide="plus" class="w-3.5 h-3.5"></i>
                        <span>Pridať pásmo</span>
                    </button>
                </div>

                <div class="p-4 rounded-xl bg-bg-elevated border border-slate-800 grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
                    <div class="md:col-span-4 text-sm font-semibold text-slate-200">Unranked (bez Premier ranku)</div>
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
                                <th class="py-2.5 pr-3 font-medium">Farba</th>
                                <th class="py-2.5 px-3 font-medium">Min. Elo</th>
                                <th class="py-2.5 px-3 font-medium">Discord rola</th>
                                <th class="py-2.5 pl-3 font-medium text-right">Akcia</th>
                            </tr>
                        </thead>
                        <tbody id="rank-roles-tbody">
                            ${rankRoles.map(r => buildRankRowHtml(r)).join('')}
                        </tbody>
                    </table>
                </div>

                <div class="flex justify-end pt-2">
                    <button id="settings-save-btn" type="submit" class="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand hover:bg-brand-hover text-white text-sm font-semibold transition">
                        <i data-lucide="save" class="w-4 h-4"></i>
                        <span>Uložiť všetky nastavenia</span>
                    </button>
                </div>
            </div>
        </form>
    `;

    const modeSelect = document.getElementById('set-status-mode');
    const typeSelect = document.getElementById('set-status-type');
    const textInput = document.getElementById('set-status-text');
    modeSelect.addEventListener('change', () => {
        const isCustom = modeSelect.value === 'custom';
        typeSelect.disabled = !isCustom;
        textInput.disabled = !isCustom;
    });

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

        const rankRows = [...document.querySelectorAll('#rank-roles-tbody .rank-row')].map(row => ({
            color: row.querySelector('.rank-color-input').value,
            min: Number(row.querySelector('.rank-min-input').value),
            roleId: row.querySelector('.rank-role-select').value
        }));

        await setButtonLoading(btn, true, 'Ukladám...');
        try {
            const res = await apiFetch('/api/settings/general', {
                method: 'PUT',
                body: JSON.stringify({
                    dashboardRoleId: document.getElementById('set-dashboard-role').value || null,
                    allowedChannelId: document.getElementById('set-allowed-channel').value || null,
                    unrankedRoleId: document.getElementById('set-unranked-role').value,
                    rankRoles: rankRows,
                    botStatus: {
                        mode: modeSelect.value,
                        activityType: typeSelect.value,
                        customText: textInput.value.trim()
                    }
                })
            });
            state.settings = res.settings;
            setDirty(false);
            renderSettings();
            showToast('Všeobecné nastavenia, status bota a rank roly boli uložené.');
        } catch (err) {
            showToast(err.message, 'error');
        } finally {
            await setButtonLoading(btn, false);
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
                ${buildRoleOptions(r.roleId, { allowNone: true, noneLabel: '— Vyber rolu —' })}
            </select>
        </td>
        <td class="py-2.5 pl-3 text-right">
            <button type="button" class="rank-remove-btn p-2 rounded-lg bg-red-500/15 hover:bg-red-500/25 border border-red-500/30 text-red-300 transition" title="Odstrániť pásmo">
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
                showToast('Musí zostať aspoň jedno Elo pásmo.', 'error');
                return;
            }
            btn.closest('.rank-row').remove();
            setDirty(true, 'general-settings-form');
        };
    });
}

// --- DATA REFRESH, LIVE POLLING & NAVIGATION ---

function updateHeaderBotBadge(bot) {
    const badge = document.getElementById('header-bot-badge');
    if (!badge || !bot) return;
    badge.className = bot.online
        ? 'hidden sm:inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
        : 'hidden sm:inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-red-500/15 text-red-300 border border-red-500/30';
    badge.innerHTML = `<span class="w-2 h-2 rounded-full ${bot.online ? 'bg-emerald-400' : 'bg-red-400'}"></span>${bot.online ? `Online (${bot.ping} ms)` : 'Offline'}`;
}

function patchOverviewDom() {
    const ov = state.overview;
    if (!ov) return;

    const statusEl = document.getElementById('ov-bot-status');
    const pingEl = document.getElementById('ov-bot-ping');
    const uptimeEl = document.getElementById('ov-bot-uptime');
    const guildEl = document.getElementById('ov-guild-members');
    const linkedEl = document.getElementById('ov-linked-count');
    const tvEl = document.getElementById('ov-tv-count');

    if (statusEl) {
        statusEl.textContent = ov.bot.online ? 'Online' : 'Offline';
        statusEl.className = `text-2xl font-bold ${ov.bot.online ? 'text-emerald-400' : 'text-red-400'}`;
    }
    if (pingEl) {
        pingEl.textContent = `Ping: ${ov.bot.online ? `${ov.bot.ping} ms` : 'N/A'}`;
    }
    if (uptimeEl) {
        uptimeEl.textContent = formatDuration(ov.bot.uptimeMs);
    }
    if (guildEl) {
        guildEl.textContent = `${ov.guild.name} (${ov.guild.memberCount} členov)`;
    }
    if (linkedEl) {
        linkedEl.textContent = String(ov.stats.linkedPlayersCount);
    }
    if (tvEl) {
        tvEl.textContent = String(ov.stats.activeTempRoomsCount);
    }

    const moduleMap = {
        tempvoice: ov.modules.tempVoiceEnabled,
        patchbot: ov.modules.patchBotEnabled,
        joinroles: ov.modules.joinRolesEnabled,
        csstatus: ov.modules.csStatusEnabled,
        rankfeed: ov.modules.rankFeedEnabled,
        adminlog: ov.modules.adminLogEnabled
    };

    Object.entries(moduleMap).forEach(([key, enabled]) => {
        const pill = document.querySelector(`[data-module-badge="${key}"]`);
        if (!pill) return;
        pill.textContent = enabled ? 'Aktívny' : 'Vypnutý';
        pill.className = `text-xs font-semibold px-2.5 py-1 rounded-full ${enabled ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30' : 'bg-slate-700/40 text-slate-400 border border-slate-700'}`;
    });
}

function patchPlayersTableDom() {
    const heading = document.getElementById('players-count-heading');
    if (heading) {
        heading.textContent = `Prepojení hráči (${state.players.length})`;
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
        heading.textContent = `Aktívne dočasné miestnosti (${state.tempRooms.length})`;
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
            updateHeaderBotBadge(data.overview.bot);
            if (state.activeSection === 'overview') {
                patchOverviewDom();
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
    } catch {
        // Pri dočasnej strate spojenia ticho počkáme na ďalší tick
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
    updateHeaderBotBadge(state.overview?.bot);
    if (state.activeSection === 'overview') patchOverviewDom();
}

async function refreshOverviewAndPlayers() {
    const [ov, pl] = await Promise.all([apiFetch('/api/overview'), apiFetch('/api/players')]);
    state.overview = ov;
    state.players = pl.players || [];
    updateHeaderBotBadge(ov?.bot);
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
    const [overview, meta, playersRes, settingsRes, roomsRes, logsRes, annRes] = await Promise.all([
        apiFetch('/api/overview'),
        apiFetch('/api/guild/meta'),
        apiFetch('/api/players'),
        apiFetch('/api/settings'),
        apiFetch('/api/tempvoice/rooms'),
        apiFetch('/api/logs'),
        apiFetch('/api/announcements/history')
    ]);

    state.overview = overview;
    state.meta = meta;
    state.players = playersRes.players || [];
    state.settings = settingsRes.settings;
    state.steamApiKeyConfigured = Boolean(settingsRes.steamApiKeyConfigured);
    state.tempRooms = roomsRes.rooms || [];
    state.logs = logsRes.logs || [];
    state.announcementsHistory = annRes.history || [];
    syncDraftsFromSettings();
    updateHeaderBotBadge(overview.bot);
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
}

function switchSection(section) {
    setDirty(false);
    state.activeSection = section;
    document.getElementById('page-title').textContent = SECTION_TITLES[section] || 'Prehľad';

    document.querySelectorAll('.nav-item').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.section === section);
    });

    Object.keys(SECTION_TITLES).forEach(key => {
        document.getElementById(`section-${key}`).classList.toggle('hidden', key !== section);
    });

    syncDraftsFromSettings();
    renderActiveSection();
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
        console.error('Chyba inicializácie dashboardu:', err);
        showView('view-login');
        showToast('Nepodarilo sa načítať dashboard.', 'error');
    }
}

document.addEventListener('click', e => {
    if (!e.target.closest('#fl-member-combobox')) {
        document.getElementById('fl-member-dropdown')?.classList.add('hidden');
    }
});

document.addEventListener('visibilitychange', () => {
    if (!document.hidden && state.auth?.authorized) {
        pollLiveUpdates();
    }
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
