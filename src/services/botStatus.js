const { ActivityType } = require('discord.js');
const { loadUsers } = require('../storage/usersStore');
const { getBotStatusSettings, getAllTempRooms } = require('../storage/settingsStore');

const BOT_STATUS_VARIABLES = [
    { token: '{players}', label: 'Prepojení hráči' },
    { token: '{members}', label: 'Členovia servera' },
    { token: '{rooms}', label: 'Aktívne TempVoice' },
    { token: '{top_elo}', label: 'Najvyššie Elo' },
    { token: '{ping}', label: 'Ping bota' },
    { token: '{uptime}', label: 'Uptime bota' }
];

let lastAppliedState = null;

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

function formatNumberWithSpaces(value) {
    return Math.round(Number(value) || 0)
        .toString()
        .replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

function resolvePrimaryGuild(client) {
    if (!client?.guilds?.cache) return null;
    if (process.env.GUILD_ID) {
        const configured = client.guilds.cache.get(process.env.GUILD_ID);
        if (configured) return configured;
    }
    return client.guilds.cache.first() || null;
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

function resolveBotStatusText(template, client) {
    const raw = typeof template === 'string' ? template : '';
    if (!raw) return '';

    const guild = resolvePrimaryGuild(client);
    const users = loadUsers();
    const userEntries = Object.values(users);

    const playersCount = userEntries.length;
    const membersCount = guild?.memberCount ?? 0;

    const roomsMap = getAllTempRooms() || {};
    const activeRoomsCount = guild
        ? Object.values(roomsMap).filter(r => r && r.guildId === guild.id && guild.channels.cache.has(r.channelId)).length
        : Object.keys(roomsMap).length;

    const pluralCounts = {
        players: playersCount,
        members: membersCount,
        rooms: activeRoomsCount
    };

    const players = String(playersCount);
    const members = String(membersCount);
    const rooms = String(activeRoomsCount);

    const topEloVal = userEntries.reduce(
        (max, u) => (typeof u?.elo === 'number' && u.elo > max ? u.elo : max),
        0
    );
    const topElo = topEloVal > 0 ? formatNumberWithSpaces(topEloVal) : '0';

    const pingVal = Number.isFinite(client?.ws?.ping) && client.ws.ping >= 0
        ? Math.round(client.ws.ping)
        : 0;
    const ping = `${pingVal}ms`;
    const uptime = formatCompactUptime(client?.uptime || 0);

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

function updateBotStatus(client, { force = false } = {}) {
    if (!client?.user) return;

    const statusConfig = getBotStatusSettings();
    const template = typeof statusConfig?.text === 'string' ? statusConfig.text.trim() : '';

    if (!template) {
        if (force || lastAppliedState !== '') {
            client.user.setPresence({ activities: [], status: 'online', afk: false });
            lastAppliedState = '';
        }
        return;
    }

    const resolved = resolveBotStatusText(template, client).trim().slice(0, 128);
    if (!resolved) {
        if (force || lastAppliedState !== '') {
            client.user.setPresence({ activities: [], status: 'online', afk: false });
            lastAppliedState = '';
        }
        return;
    }

    if (force || lastAppliedState !== resolved) {
        client.user.setActivity({
            name: 'custom',
            type: ActivityType.Custom,
            state: resolved
        });
        lastAppliedState = resolved;
    }
}

module.exports = {
    BOT_STATUS_VARIABLES,
    formatCompactUptime,
    formatNumberWithSpaces,
    pickSlovakPlural,
    resolveBotStatusText,
    updateBotStatus
};
