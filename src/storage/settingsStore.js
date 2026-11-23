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

function getDefaultSettings() {
    return {
        dashboardRoleId: null,
        allowedChannelId: null,
        unrankedRoleId: UNRANKED_ROLE_ID,
        rankRoles: RANK_ROLES.map(r => ({ ...r })),
        tempVoice: {
            enabled: false,
            triggerChannelId: null,
            categoryId: null,
            triggerName: TEMPVOICE_DEFAULTS.triggerName,
            roomNameTemplate: TEMPVOICE_DEFAULTS.roomNameTemplate,
            bitrateKbps: TEMPVOICE_DEFAULTS.bitrateKbps,
            userLimit: TEMPVOICE_DEFAULTS.userLimit,
            rooms: {}
        },
        patchBot: {
            enabled: false,
            channelId: null,
            roleId: null,
            mode: PATCHBOT_DEFAULTS.mode,
            postedGids: [],
            lastPostedTitle: null,
            lastPostedAt: null
        },
        joinRoles: {
            enabled: false,
            memberRoleId: null,
            botRoleId: null
        },
        csStatus: {
            enabled: false,
            channelId: null,
            messageId: null,
            intervalSeconds: CSSTATUS_DEFAULTS.intervalSeconds,
            lastUpdatedAt: 0
        }
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

function normalizeSettings(raw) {
    const defaults = getDefaultSettings();
    const src = raw && typeof raw === 'object' ? raw : {};

    const tv = src.tempVoice && typeof src.tempVoice === 'object' ? src.tempVoice : {};
    const pb = src.patchBot && typeof src.patchBot === 'object' ? src.patchBot : {};
    const jr = src.joinRoles && typeof src.joinRoles === 'object' ? src.joinRoles : {};
    const cs = src.csStatus && typeof src.csStatus === 'object' ? src.csStatus : {};

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
            enabled: typeof tv.enabled === 'boolean' ? tv.enabled : Boolean(tv.triggerChannelId),
            triggerChannelId: tv.triggerChannelId || null,
            categoryId: tv.categoryId || null,
            triggerName: typeof tv.triggerName === 'string' && tv.triggerName.trim()
                ? tv.triggerName.trim()
                : defaults.tempVoice.triggerName,
            roomNameTemplate: typeof tv.roomNameTemplate === 'string' && tv.roomNameTemplate.trim()
                ? tv.roomNameTemplate.trim()
                : defaults.tempVoice.roomNameTemplate,
            bitrateKbps: typeof tv.bitrateKbps === 'number'
                ? Math.min(Math.max(Math.round(tv.bitrateKbps), 8), 384)
                : defaults.tempVoice.bitrateKbps,
            userLimit: typeof tv.userLimit === 'number'
                ? Math.min(Math.max(Math.round(tv.userLimit), 0), 99)
                : defaults.tempVoice.userLimit,
            rooms: tv.rooms && typeof tv.rooms === 'object' ? tv.rooms : {}
        },
        patchBot: {
            enabled: typeof pb.enabled === 'boolean' ? pb.enabled : Boolean(pb.channelId),
            channelId: pb.channelId || null,
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
                : Boolean(jr.memberRoleId || jr.botRoleId),
            memberRoleId: jr.memberRoleId || null,
            botRoleId: jr.botRoleId || null
        },
        csStatus: {
            enabled: typeof cs.enabled === 'boolean' ? cs.enabled : Boolean(cs.channelId),
            channelId: cs.channelId || null,
            messageId: cs.messageId || null,
            intervalSeconds,
            lastUpdatedAt: typeof cs.lastUpdatedAt === 'number' ? cs.lastUpdatedAt : 0
        }
    };
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
            migrated.tempVoice = {
                ...migrated.tempVoice,
                ...firstGuild,
                enabled: Boolean(firstGuild.triggerChannelId)
            };
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
                enabled: Boolean(firstGuild.channelId)
            };
        }
    }

    const legacyJr = readJsonSafe(JOINROLES_DB_FILE);
    if (legacyJr) {
        const firstGuild = Object.values(legacyJr.guilds || {})[0];
        if (firstGuild && typeof firstGuild === 'object') {
            migrated.joinRoles = {
                ...migrated.joinRoles,
                ...firstGuild
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

module.exports = {
    getDefaultSettings,
    normalizeSettings,
    normalizeRankRoles,
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
    updateCsStatusSettings
};
