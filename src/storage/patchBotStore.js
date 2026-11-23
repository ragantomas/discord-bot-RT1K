const fs = require('fs');
const { PATCHBOT_DB_FILE } = require('../config');

const MAX_POSTED_GIDS = 50;

function loadPatchBotData() {
    if (!fs.existsSync(PATCHBOT_DB_FILE)) {
        return { guilds: {} };
    }

    try {
        const raw = JSON.parse(fs.readFileSync(PATCHBOT_DB_FILE, 'utf8'));
        return {
            guilds: raw?.guilds && typeof raw.guilds === 'object' ? raw.guilds : {}
        };
    } catch {
        return { guilds: {} };
    }
}

function savePatchBotData(data) {
    fs.writeFileSync(PATCHBOT_DB_FILE, JSON.stringify(data, null, 2));
}

function patchBotFileExists() {
    return fs.existsSync(PATCHBOT_DB_FILE);
}

function getPatchGuildConfig(guildId) {
    const data = loadPatchBotData();
    return data.guilds[guildId] || null;
}

function getAllPatchGuildConfigs() {
    const data = loadPatchBotData();
    return data.guilds;
}

function setPatchGuildConfig(guildId, config) {
    const data = loadPatchBotData();
    data.guilds[guildId] = config;
    savePatchBotData(data);
    return config;
}

function deletePatchGuildConfig(guildId) {
    const data = loadPatchBotData();
    if (!data.guilds[guildId]) return false;
    delete data.guilds[guildId];
    savePatchBotData(data);
    return true;
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

function markGidsPosted(guildId, gids, latestItem = null) {
    const data = loadPatchBotData();
    const config = data.guilds[guildId];
    if (!config) return null;

    config.postedGids = mergePostedGids(config.postedGids, gids);

    if (latestItem) {
        if (latestItem.title) {
            config.lastPostedTitle = latestItem.title;
        }
        if (typeof latestItem.date === 'number') {
            config.lastPostedAt = latestItem.date;
        }
    }

    data.guilds[guildId] = config;
    savePatchBotData(data);
    return config;
}

module.exports = {
    loadPatchBotData,
    savePatchBotData,
    patchBotFileExists,
    getPatchGuildConfig,
    getAllPatchGuildConfigs,
    setPatchGuildConfig,
    deletePatchGuildConfig,
    mergePostedGids,
    markGidsPosted
};
