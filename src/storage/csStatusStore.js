const fs = require('fs');
const { CSSTATUS_DB_FILE } = require('../config');

function loadCsStatusData() {
    if (!fs.existsSync(CSSTATUS_DB_FILE)) {
        return { guilds: {} };
    }

    try {
        const raw = JSON.parse(fs.readFileSync(CSSTATUS_DB_FILE, 'utf8'));
        return {
            guilds: raw?.guilds && typeof raw.guilds === 'object' ? raw.guilds : {}
        };
    } catch {
        return { guilds: {} };
    }
}

function saveCsStatusData(data) {
    fs.writeFileSync(CSSTATUS_DB_FILE, JSON.stringify(data, null, 2));
}

function csStatusFileExists() {
    return fs.existsSync(CSSTATUS_DB_FILE);
}

function getCsStatusGuildConfig(guildId) {
    const data = loadCsStatusData();
    return data.guilds[guildId] || null;
}

function getAllCsStatusGuildConfigs() {
    const data = loadCsStatusData();
    return data.guilds;
}

function setCsStatusGuildConfig(guildId, config) {
    const data = loadCsStatusData();
    data.guilds[guildId] = config;
    saveCsStatusData(data);
    return config;
}

function deleteCsStatusGuildConfig(guildId) {
    const data = loadCsStatusData();
    if (!data.guilds[guildId]) return false;
    delete data.guilds[guildId];
    saveCsStatusData(data);
    return true;
}

module.exports = {
    loadCsStatusData,
    saveCsStatusData,
    csStatusFileExists,
    getCsStatusGuildConfig,
    getAllCsStatusGuildConfigs,
    setCsStatusGuildConfig,
    deleteCsStatusGuildConfig
};
