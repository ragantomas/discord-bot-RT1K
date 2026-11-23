const fs = require('fs');
const { JOINROLES_DB_FILE } = require('../config');

function loadJoinRolesData() {
    if (!fs.existsSync(JOINROLES_DB_FILE)) {
        return { guilds: {} };
    }

    try {
        const raw = JSON.parse(fs.readFileSync(JOINROLES_DB_FILE, 'utf8'));
        return {
            guilds: raw?.guilds && typeof raw.guilds === 'object' ? raw.guilds : {}
        };
    } catch {
        return { guilds: {} };
    }
}

function saveJoinRolesData(data) {
    fs.writeFileSync(JOINROLES_DB_FILE, JSON.stringify(data, null, 2));
}

function joinRolesFileExists() {
    return fs.existsSync(JOINROLES_DB_FILE);
}

function getJoinRolesGuildConfig(guildId) {
    const data = loadJoinRolesData();
    return data.guilds[guildId] || null;
}

function setJoinRolesGuildConfig(guildId, config) {
    const data = loadJoinRolesData();
    data.guilds[guildId] = config;
    saveJoinRolesData(data);
    return config;
}

function deleteJoinRolesGuildConfig(guildId) {
    const data = loadJoinRolesData();
    if (!data.guilds[guildId]) return false;
    delete data.guilds[guildId];
    saveJoinRolesData(data);
    return true;
}

module.exports = {
    loadJoinRolesData,
    saveJoinRolesData,
    joinRolesFileExists,
    getJoinRolesGuildConfig,
    setJoinRolesGuildConfig,
    deleteJoinRolesGuildConfig
};
