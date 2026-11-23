const fs = require('fs');
const {
    UNRANKED_ROLE_ID,
    RANK_ROLES,
    SETTINGS_FILE,
    TEMPVOICE_DB_FILE,
    PATCHBOT_DB_FILE,
    JOINROLES_DB_FILE,
    CSSTATUS_DB_FILE,
    PATCHBOT_DEFAULTS,
    CSSTATUS_DEFAULTS,
    TEMPVOICE_DEFAULTS
} = require('../config');

const MAX_POSTED_GIDS = 50;

function uniqueStringIds(list) {
    if (!Array.isArray(list)) return [];
    const seen = new Set();
    const out = [];
    for (const item of list) {
        const val = item ? String(item).trim() : '';
        if (!val || seen.has(val)) continue;
        seen.add(val);
        out.push(val);
    }
    return out;
}

function getDefaultTempVoiceSetup(id = 'default') {
    return {
        id,
        enabled: false,
        triggerChannelId: null,
        categoryId: null,
        triggerName: TEMPVOICE_DEFAULTS.triggerName,
        roomNameTemplate: TEMPVOICE_DEFAULTS.roomNameTemplate,
        bitrateKbps: TEMPVOICE_DEFAULTS.bitrateKbps,
        userLimit: TEMPVOICE_DEFAULTS.userLimit
    };
}

function getDefaultSettings() {
    return {
        dashboardRoleId: null,
        allowedChannelId: null,
        unrankedRoleId: UNRANKED_ROLE_ID,
        rankRoles: RANK_ROLES.map(r => ({ ...r })),
        tempVoice: {
            enabled: false,
            setups: [],
            rooms: {}
        },
        patchBot: {
            enabled: false,
            channelIds: [],
            roleId: null,
            mode: PATCHBOT_DEFAULTS.mode,
            postedGids: [],
            lastPostedTitle: null,
            lastPostedAt: null
        },
        joinRoles: {
            enabled: false,
            memberRoleIds: [],
            botRoleIds: []
        },
        csStatus: {
            enabled: false,
            channelId: null,
            messageId: null,
            intervalSeconds: CSSTATUS_DEFAULTS.intervalSeconds,
            lastUpdatedAt: 0
        },
        botStatus: {
            mode: 'auto',
            customText: '',
            activityType: 'Custom'
        },
        rankFeed: {
            enabled: false,
            channelId: null,
            notifyRankUp: true,
            notifyDerank: true
        },
        adminLog: {
            enabled: false,
            channelId: null,
            events: {
                memberJoin: true,
                memberLeave: true,
                bans: true,
                timeouts: true,
                roleChanges: true,
                voiceActivity: false
            }
        },
        announcementsHistory: []
    };
}

function normalizeRankRoles(rankRoles) {
    if (!Array.isArray(rankRoles) || rankRoles.length === 0) {
        return RANK_ROLES.map(r => ({ ...r }));
    }

    const cleaned = rankRoles
        .filter(r => r && typeof r === 'object')
        .map(r => ({
            min: Number.isFinite(Number(r.min)) ? Math.max(0, Math.round(Number(r.min))) : 0,
            roleId: r.roleId ? String(r.roleId).trim() : '',
            color: Number.isFinite(Number(r.color)) ? Number(r.color) : 0x808080
        }))
        .filter(r => r.roleId);

    cleaned.sort((a, b) => b.min - a.min);
    return cleaned.length > 0 ? cleaned : RANK_ROLES.map(r => ({ ...r }));
}

function normalizeTempVoiceSetup(rawSetup, index = 0) {
    const def = getDefaultTempVoiceSetup(`tv_${index + 1}`);
    const src = rawSetup && typeof rawSetup === 'object' ? rawSetup : {};

    return {
        id: typeof src.id === 'string' && src.id.trim() ? src.id.trim() : def.id,
        enabled: typeof src.enabled === 'boolean' ? src.enabled : Boolean(src.triggerChannelId),
        triggerChannelId: src.triggerChannelId ? String(src.triggerChannelId).trim() : null,
        categoryId: src.categoryId ? String(src.categoryId).trim() : null,
        triggerName: typeof src.triggerName === 'string' && src.triggerName.trim()
            ? src.triggerName.trim().slice(0, 100)
            : def.triggerName,
        roomNameTemplate: typeof src.roomNameTemplate === 'string' && src.roomNameTemplate.trim()
            ? src.roomNameTemplate.trim().slice(0, 100)
            : def.roomNameTemplate,
        bitrateKbps: typeof src.bitrateKbps === 'number' && Number.isFinite(src.bitrateKbps)
            ? Math.min(Math.max(Math.round(src.bitrateKbps), 8), 384)
            : def.bitrateKbps,
        userLimit: typeof src.userLimit === 'number' && Number.isFinite(src.userLimit)
            ? Math.min(Math.max(Math.round(src.userLimit), 0), 99)
            : def.userLimit
    };
}

function normalizeSettings(raw) {
    const defaults = getDefaultSettings();
    const src = raw && typeof raw === 'object' ? raw : {};

    const tv = src.tempVoice && typeof src.tempVoice === 'object' ? src.tempVoice : {};
    const pb = src.patchBot && typeof src.patchBot === 'object' ? src.patchBot : {};
    const jr = src.joinRoles && typeof src.joinRoles === 'object' ? src.joinRoles : {};
    const cs = src.csStatus && csStatusValid(src.csStatus) ? src.csStatus : {};
    const bs = src.botStatus && typeof src.botStatus === 'object' ? src.botStatus : {};
    const rf = src.rankFeed && typeof src.rankFeed === 'object' ? src.rankFeed : {};
    const al = src.adminLog && typeof src.adminLog === 'object' ? src.adminLog : {};
    const alEvents = al.events && typeof al.events === 'object' ? al.events : {};
    const allowedActivityTypes = new Set(['Custom', 'Playing', 'Watching', 'Listening', 'Competing']);

    // TempVoice: migrácia starého jednotného objektu na pole setups[]
    let rawSetups = Array.isArray(tv.setups) ? tv.setups : null;
    if (!rawSetups && (tv.triggerChannelId || tv.categoryId || tv.triggerName || tv.roomNameTemplate)) {
        rawSetups = [{
            id: 'default',
            enabled: typeof tv.enabled === 'boolean' ? tv.enabled : Boolean(tv.triggerChannelId),
            triggerChannelId: tv.triggerChannelId || null,
            categoryId: tv.categoryId || null,
            triggerName: tv.triggerName,
            roomNameTemplate: tv.roomNameTemplate,
            bitrateKbps: tv.bitrateKbps,
            userLimit: tv.userLimit
        }];
    }
    const normalizedSetups = Array.isArray(rawSetups)
        ? rawSetups.map((s, idx) => normalizeTempVoiceSetup(s, idx))
        : [];

    // PatchBot: migrácia channelId -> channelIds[]
    const patchChannelIds = Array.isArray(pb.channelIds)
        ? uniqueStringIds(pb.channelIds)
        : uniqueStringIds(pb.channelId ? [pb.channelId] : []);

    // Join Roles: migrácia memberRoleId / botRoleId -> polia
    const memberRoleIds = Array.isArray(jr.memberRoleIds)
        ? uniqueStringIds(jr.memberRoleIds)
        : uniqueStringIds(jr.memberRoleId ? [jr.memberRoleId] : []);

    const botRoleIds = Array.isArray(jr.botRoleIds)
        ? uniqueStringIds(jr.botRoleIds)
        : uniqueStringIds(jr.botRoleId ? [jr.botRoleId] : []);

    let intervalSeconds = CSSTATUS_DEFAULTS.intervalSeconds;
    if (typeof cs.intervalSeconds === 'number') {
        intervalSeconds = Math.min(
            Math.max(Math.round(cs.intervalSeconds), CSSTATUS_DEFAULTS.minIntervalSeconds),
            CSSTATUS_DEFAULTS.maxIntervalSeconds
        );
    } else if (typeof cs.intervalMinutes === 'number') {
        intervalSeconds = Math.min(
            Math.max(Math.round(cs.intervalMinutes * 60), CSSTATUS_DEFAULTS.minIntervalSeconds),
            CSSTATUS_DEFAULTS.maxIntervalSeconds
        );
    }

    return {
        dashboardRoleId: src.dashboardRoleId || null,
        allowedChannelId: src.allowedChannelId || null,
        unrankedRoleId: src.unrankedRoleId || defaults.unrankedRoleId,
        rankRoles: normalizeRankRoles(src.rankRoles),
        tempVoice: {
            enabled: typeof tv.enabled === 'boolean'
                ? tv.enabled
                : normalizedSetups.some(s => s.enabled && s.triggerChannelId),
            setups: normalizedSetups,
            rooms: tv.rooms && typeof tv.rooms === 'object' ? tv.rooms : {}
        },
        patchBot: {
            enabled: typeof pb.enabled === 'boolean' ? pb.enabled : patchChannelIds.length > 0,
            channelIds: patchChannelIds,
            roleId: pb.roleId || null,
            mode: pb.mode === 'patchnotes' ? 'patchnotes' : 'all',
            postedGids: Array.isArray(pb.postedGids)
                ? pb.postedGids.map(String).slice(-MAX_POSTED_GIDS)
                : [],
            lastPostedTitle: pb.lastPostedTitle || null,
            lastPostedAt: typeof pb.lastPostedAt === 'number' ? pb.lastPostedAt : null
        },
        joinRoles: {
            enabled: typeof jr.enabled === 'boolean'
                ? jr.enabled
                : (memberRoleIds.length > 0 || botRoleIds.length > 0),
            memberRoleIds,
            botRoleIds
        },
        csStatus: {
            enabled: typeof cs.enabled === 'boolean' ? cs.enabled : Boolean(cs.channelId),
            channelId: cs.channelId || null,
            messageId: cs.messageId || null,
            intervalSeconds,
            lastUpdatedAt: typeof cs.lastUpdatedAt === 'number' ? cs.lastUpdatedAt : 0
        },
        botStatus: {
            mode: bs.mode === 'custom' ? 'custom' : 'auto',
            customText: typeof bs.customText === 'string' ? bs.customText.trim().slice(0, 128) : '',
            activityType: allowedActivityTypes.has(bs.activityType) ? bs.activityType : 'Custom'
        },
        rankFeed: {
            enabled: typeof rf.enabled === 'boolean' ? rf.enabled : false,
            channelId: rf.channelId || null,
            notifyRankUp: typeof rf.notifyRankUp === 'boolean' ? rf.notifyRankUp : true,
            notifyDerank: typeof rf.notifyDerank === 'boolean' ? rf.notifyDerank : true
        },
        adminLog: {
            enabled: typeof al.enabled === 'boolean' ? al.enabled : false,
            channelId: al.channelId || null,
            events: {
                memberJoin: typeof alEvents.memberJoin === 'boolean' ? alEvents.memberJoin : true,
                memberLeave: typeof alEvents.memberLeave === 'boolean' ? alEvents.memberLeave : true,
                bans: typeof alEvents.bans === 'boolean' ? alEvents.bans : true,
                timeouts: typeof alEvents.timeouts === 'boolean' ? alEvents.timeouts : true,
                roleChanges: typeof alEvents.roleChanges === 'boolean' ? alEvents.roleChanges : true,
                voiceActivity: typeof alEvents.voiceActivity === 'boolean' ? alEvents.voiceActivity : false
            }
        },
        announcementsHistory: Array.isArray(src.announcementsHistory)
            ? src.announcementsHistory.filter(item => item && item.channelId && item.messageId).slice(0, 15)
            : []
    };
}

function csStatusValid(val) {
    return val && typeof val === 'object';
}

function readJsonSafe(filePath) {
    if (!filePath || !fs.existsSync(filePath)) return null;
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch {
        return null;
    }
}

function buildMigratedSettings() {
    const migrated = getDefaultSettings();

    const legacyTv = readJsonSafe(TEMPVOICE_DB_FILE);
    if (legacyTv) {
        const firstGuild = Object.values(legacyTv.guilds || {})[0];
        if (firstGuild && typeof firstGuild === 'object') {
            migrated.tempVoice.enabled = Boolean(firstGuild.triggerChannelId);
            migrated.tempVoice.setups = [normalizeTempVoiceSetup({
                id: 'default',
                enabled: Boolean(firstGuild.triggerChannelId),
                ...firstGuild
            }, 0)];
        }
        if (legacyTv.rooms && typeof legacyTv.rooms === 'object') {
            migrated.tempVoice.rooms = legacyTv.rooms;
        }
    }

    const legacyPb = readJsonSafe(PATCHBOT_DB_FILE);
    if (legacyPb) {
        const firstGuild = Object.values(legacyPb.guilds || {})[0];
        if (firstGuild && typeof firstGuild === 'object') {
            migrated.patchBot = {
                ...migrated.patchBot,
                ...firstGuild,
                channelIds: firstGuild.channelId ? [firstGuild.channelId] : [],
                enabled: Boolean(firstGuild.channelId)
            };
        }
    }

    const legacyJr = readJsonSafe(JOINROLES_DB_FILE);
    if (legacyJr) {
        const firstGuild = Object.values(legacyJr.guilds || {})[0];
        if (firstGuild && typeof firstGuild === 'object') {
            migrated.joinRoles = {
                enabled: typeof firstGuild.enabled === 'boolean' ? firstGuild.enabled : false,
                memberRoleIds: firstGuild.memberRoleId ? [firstGuild.memberRoleId] : [],
                botRoleIds: firstGuild.botRoleId ? [firstGuild.botRoleId] : []
            };
        }
    }

    const legacyCs = readJsonSafe(CSSTATUS_DB_FILE);
    if (legacyCs) {
        const firstGuild = Object.values(legacyCs.guilds || {})[0];
        if (firstGuild && typeof firstGuild === 'object') {
            const migratedIntervalSeconds = typeof firstGuild.intervalSeconds === 'number'
                ? firstGuild.intervalSeconds
                : (typeof firstGuild.intervalMinutes === 'number'
                    ? firstGuild.intervalMinutes * 60
                    : migrated.csStatus.intervalSeconds);

            migrated.csStatus = {
                ...migrated.csStatus,
                ...firstGuild,
                intervalSeconds: migratedIntervalSeconds,
                enabled: Boolean(firstGuild.channelId)
            };
            delete migrated.csStatus.intervalMinutes;
        }
    }

    return normalizeSettings(migrated);
}

function settingsFileExists() {
    return fs.existsSync(SETTINGS_FILE);
}

function saveSettings(settings) {
    const normalized = normalizeSettings(settings);
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(normalized, null, 2));
    return normalized;
}

function loadSettings() {
    if (!fs.existsSync(SETTINGS_FILE)) {
        const initial = buildMigratedSettings();
        saveSettings(initial);
        return initial;
    }

    const raw = readJsonSafe(SETTINGS_FILE);
    return normalizeSettings(raw);
}

function updateSettings(mutator) {
    const current = loadSettings();
    const updated = typeof mutator === 'function' ? (mutator(current) || current) : { ...current, ...mutator };
    return saveSettings(updated);
}

function getRankSettings() {
    const settings = loadSettings();
    const allRankRoleIds = [...settings.rankRoles.map(r => r.roleId)];
    if (settings.unrankedRoleId && !allRankRoleIds.includes(settings.unrankedRoleId)) {
        allRankRoleIds.push(settings.unrankedRoleId);
    }
    return {
        unrankedRoleId: settings.unrankedRoleId,
        rankRoles: settings.rankRoles,
        allRankRoleIds
    };
}

function getTempVoiceSettings() {
    return loadSettings().tempVoice;
}

function updateTempVoiceSettings(patch) {
    return updateSettings(s => {
        s.tempVoice = { ...s.tempVoice, ...patch };
    }).tempVoice;
}

function getTempRoom(channelId) {
    return loadSettings().tempVoice.rooms[channelId] || null;
}

function setTempRoom(channelId, room) {
    updateSettings(s => {
        s.tempVoice.rooms[channelId] = room;
    });
    return room;
}

function deleteTempRoom(channelId) {
    let existed = false;
    updateSettings(s => {
        if (s.tempVoice.rooms[channelId]) {
            existed = true;
            delete s.tempVoice.rooms[channelId];
        }
    });
    return existed;
}

function getAllTempRooms() {
    return loadSettings().tempVoice.rooms;
}

function getPatchBotSettings() {
    return loadSettings().patchBot;
}

function updatePatchBotSettings(patch) {
    return updateSettings(s => {
        s.patchBot = { ...s.patchBot, ...patch };
    }).patchBot;
}

function mergePostedGids(existingGids = [], newGids = []) {
    const merged = [];
    const seen = new Set();

    for (const gid of [...existingGids, ...newGids]) {
        const key = String(gid);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        merged.push(key);
    }

    return merged.slice(-MAX_POSTED_GIDS);
}

function markPatchGidsPosted(gids, latestItem = null) {
    return updateSettings(s => {
        s.patchBot.postedGids = mergePostedGids(s.patchBot.postedGids, gids);
        if (latestItem?.title) {
            s.patchBot.lastPostedTitle = latestItem.title;
        }
        if (typeof latestItem?.date === 'number') {
            s.patchBot.lastPostedAt = latestItem.date;
        }
    }).patchBot;
}

function getJoinRolesSettings() {
    return loadSettings().joinRoles;
}

function updateJoinRolesSettings(patch) {
    return updateSettings(s => {
        s.joinRoles = { ...s.joinRoles, ...patch };
    }).joinRoles;
}

function getCsStatusSettings() {
    return loadSettings().csStatus;
}

function updateCsStatusSettings(patch) {
    return updateSettings(s => {
        s.csStatus = { ...s.csStatus, ...patch };
    }).csStatus;
}

function getBotStatusSettings() {
    return loadSettings().botStatus;
}

function updateBotStatusSettings(patch) {
    return updateSettings(s => {
        s.botStatus = { ...s.botStatus, ...patch };
    }).botStatus;
}

function getRankFeedSettings() {
    return loadSettings().rankFeed;
}

function updateRankFeedSettings(patch) {
    return updateSettings(s => {
        s.rankFeed = { ...s.rankFeed, ...patch };
    }).rankFeed;
}

function getAdminLogSettings() {
    return loadSettings().adminLog;
}

function updateAdminLogSettings(patch) {
    return updateSettings(s => {
        s.adminLog = {
            ...s.adminLog,
            ...patch,
            events: {
                ...s.adminLog.events,
                ...(patch.events || {})
            }
        };
    }).adminLog;
}

function getAnnouncementsHistory() {
    return loadSettings().announcementsHistory;
}

function addAnnouncementHistory(entry) {
    return updateSettings(s => {
        const filtered = (s.announcementsHistory || []).filter(
            item => !(item.channelId === entry.channelId && item.messageId === entry.messageId)
        );
        s.announcementsHistory = [entry, ...filtered].slice(0, 15);
    }).announcementsHistory;
}

module.exports = {
    uniqueStringIds,
    getDefaultTempVoiceSetup,
    getDefaultSettings,
    normalizeSettings,
    normalizeRankRoles,
    normalizeTempVoiceSetup,
    settingsFileExists,
    loadSettings,
    saveSettings,
    updateSettings,
    getRankSettings,
    getTempVoiceSettings,
    updateTempVoiceSettings,
    getTempRoom,
    setTempRoom,
    deleteTempRoom,
    getAllTempRooms,
    getPatchBotSettings,
    updatePatchBotSettings,
    mergePostedGids,
    markPatchGidsPosted,
    getJoinRolesSettings,
    updateJoinRolesSettings,
    getCsStatusSettings,
    updateCsStatusSettings,
    getBotStatusSettings,
    updateBotStatusSettings,
    getRankFeedSettings,
    updateRankFeedSettings,
    getAdminLogSettings,
    updateAdminLogSettings,
    getAnnouncementsHistory,
    addAnnouncementHistory
};
