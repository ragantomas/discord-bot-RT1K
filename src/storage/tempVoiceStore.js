const fs = require('fs');
const { TEMPVOICE_DB_FILE } = require('../config');

function loadTempVoiceData() {
    if (!fs.existsSync(TEMPVOICE_DB_FILE)) {
        return { guilds: {}, rooms: {} };
    }

    const raw = JSON.parse(fs.readFileSync(TEMPVOICE_DB_FILE, 'utf8'));
    return {
        guilds: raw?.guilds && typeof raw.guilds === 'object' ? raw.guilds : {},
        rooms: raw?.rooms && typeof raw.rooms === 'object' ? raw.rooms : {}
    };
}

function saveTempVoiceData(data) {
    fs.writeFileSync(TEMPVOICE_DB_FILE, JSON.stringify(data, null, 2));
}

function tempVoiceFileExists() {
    return fs.existsSync(TEMPVOICE_DB_FILE);
}

function getGuildConfig(guildId) {
    const data = loadTempVoiceData();
    return data.guilds[guildId] || null;
}

function setGuildConfig(guildId, config) {
    const data = loadTempVoiceData();
    data.guilds[guildId] = config;
    saveTempVoiceData(data);
    return config;
}

function deleteGuildConfig(guildId) {
    const data = loadTempVoiceData();
    if (!data.guilds[guildId]) return false;
    delete data.guilds[guildId];
    saveTempVoiceData(data);
    return true;
}

function getTempRoom(channelId) {
    const data = loadTempVoiceData();
    return data.rooms[channelId] || null;
}

function setTempRoom(channelId, room) {
    const data = loadTempVoiceData();
    data.rooms[channelId] = room;
    saveTempVoiceData(data);
    return room;
}

function deleteTempRoom(channelId) {
    const data = loadTempVoiceData();
    if (!data.rooms[channelId]) return false;
    delete data.rooms[channelId];
    saveTempVoiceData(data);
    return true;
}

function getAllTempRooms() {
    const data = loadTempVoiceData();
    return data.rooms;
}

module.exports = {
    loadTempVoiceData,
    saveTempVoiceData,
    tempVoiceFileExists,
    getGuildConfig,
    setGuildConfig,
    deleteGuildConfig,
    getTempRoom,
    setTempRoom,
    deleteTempRoom,
    getAllTempRooms
};
