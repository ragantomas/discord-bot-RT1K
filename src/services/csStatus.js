const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require('discord.js');
const { CS2_APP_ID, CS2_ICON_URL, CSSTATUS_DEFAULTS } = require('../config');
const {
    getCsStatusGuildConfig,
    getAllCsStatusGuildConfigs,
    setCsStatusGuildConfig
} = require('../storage/csStatusStore');

const REQUEST_TIMEOUT_MS = 8000;

const EU_DATACENTER_REGEX = /^(EU\b|Poland|Spain|Austria|Germany|Sweden|Netherlands|Finland|France|UK|United Kingdom|Frankfurt|Vienna|Warsaw|Stockholm|Amsterdam|Madrid|London|Helsinki)/i;

async function fetchWithTimeout(url) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
        return await fetch(url, {
            headers: { 'User-Agent': 'CS2-Discord-Bot/1.0' },
            signal: controller.signal
        });
    } finally {
        clearTimeout(timeoutId);
    }
}

async function probeEndpoint(url) {
    const start = Date.now();
    try {
        const res = await fetchWithTimeout(url);
        return {
            ok: res.ok,
            status: res.status,
            latencyMs: Date.now() - start
        };
    } catch {
        return {
            ok: false,
            status: null,
            latencyMs: null
        };
    }
}

async function fetchCs2PlayerCount() {
    try {
        const res = await fetchWithTimeout(
            `https://api.steampowered.com/ISteamUserStats/GetNumberOfCurrentPlayers/v1/?appid=${CS2_APP_ID}`
        );
        if (!res.ok) return null;
        const data = await res.json();
        return typeof data?.response?.player_count === 'number'
            ? data.response.player_count
            : null;
    } catch {
        return null;
    }
}

async function fetchCs2GameServersStatus(apiKey) {
    try {
        const res = await fetchWithTimeout(
            `https://api.steampowered.com/ICSGOServers_730/GetGameServersStatus/v1/?key=${encodeURIComponent(apiKey)}`
        );
        if (res.status === 401 || res.status === 403) {
            return { result: null, error: 'invalid_key' };
        }
        if (!res.ok) {
            return { result: null, error: 'http_error' };
        }
        const data = await res.json();
        return { result: data?.result || null, error: null };
    } catch {
        return { result: null, error: 'network_error' };
    }
}

async function fetchCs2SteamStatus() {
    const apiKey = process.env.STEAM_API_KEY?.trim() || '';
    const hasApiKey = Boolean(apiKey);

    const [store, community, webApi, playerCount, cs2Resp] = await Promise.all([
        probeEndpoint('https://store.steampowered.com/'),
        probeEndpoint('https://steamcommunity.com/'),
        probeEndpoint('https://api.steampowered.com/ISteamWebAPIUtil/GetServerInfo/v1/'),
        fetchCs2PlayerCount(),
        hasApiKey ? fetchCs2GameServersStatus(apiKey) : Promise.resolve({ result: null, error: null })
    ]);

    return {
        fetchedAt: Date.now(),
        steam: { store, community, webApi },
        playerCount,
        cs2: cs2Resp.result,
        hasApiKey,
        apiKeyError: cs2Resp.error
    };
}

function formatProbeStatus(probe) {
    if (!probe) return '🔴 Nedostupné';
    if (probe.ok && typeof probe.latencyMs === 'number' && probe.latencyMs < 1500) {
        return `🟢 Online (${probe.latencyMs} ms)`;
    }
    if (probe.ok) {
        return `🟡 Pomalé (${probe.latencyMs} ms)`;
    }
    if (probe.status) {
        return `🔴 Chyba (HTTP ${probe.status})`;
    }
    return '🔴 Nedostupné';
}

function formatValveState(state) {
    const normalized = String(state || '').toLowerCase();
    const map = {
        normal: '🟢 Normálny',
        idle: '🟢 OK (voľný)',
        low: '🟢 Nízka záťaž',
        medium: '🟡 Stredná záťaž',
        delayed: '🟡 Oneskorený',
        high: '🟠 Vysoká záťaž',
        surge: '🟠 Nápor',
        full: '🔴 Plná kapacita',
        offline: '🔴 Offline',
        critical: '🔴 Kritický výpadok'
    };
    return map[normalized] || (state ? `⚪ ${state}` : '⚪ Neznáme');
}

function getDatacenterState(dc) {
    if (!dc || typeof dc !== 'object') return 'offline';
    const capacity = String(dc.capacity || '').toLowerCase();
    const load = String(dc.load || '').toLowerCase();

    if (capacity === 'offline' || !load || load === 'offline') {
        return 'offline';
    }
    return dc.load;
}

function extractEuDatacenters(datacenters) {
    if (!datacenters || typeof datacenters !== 'object') return [];

    return Object.entries(datacenters)
        .filter(([name]) => EU_DATACENTER_REGEX.test(name))
        .slice(0, 12)
        .map(([name, dc]) => `• **${name}:** ${formatValveState(getDatacenterState(dc))}`);
}

function computeOverallStatus(snapshot) {
    const probes = [snapshot.steam?.store, snapshot.steam?.community, snapshot.steam?.webApi];
    const services = snapshot.cs2?.services || {};
    const scheduler = snapshot.cs2?.matchmaking?.scheduler;

    const downStates = new Set(['offline', 'critical']);
    const warnStates = new Set(['delayed', 'surge']);

    const anyProbeDown = probes.some(p => !p?.ok);
    const criticalValveDown = downStates.has(String(services.SessionsLogon || '').toLowerCase())
        || downStates.has(String(scheduler || '').toLowerCase());

    if (anyProbeDown || criticalValveDown) {
        return { color: 0xED4245, label: '🔴 Zaznamenaný výpadok' };
    }

    const anyProbeSlow = probes.some(p => p?.ok && typeof p.latencyMs === 'number' && p.latencyMs >= 1500);
    const communityState = String(services.SteamCommunity || '').toLowerCase();
    const valveWarn = [
        services.SessionsLogon,
        scheduler,
        services.SteamCommunity
    ].some(val => warnStates.has(String(val || '').toLowerCase()))
        || downStates.has(communityState);

    if (anyProbeSlow || valveWarn) {
        return { color: 0xF5A623, label: '🟡 Čiastočné spomalenie / záťaž' };
    }

    return { color: 0x57F287, label: '🟢 Všetky služby fungujú normálne' };
}

function buildCsStatusMessagePayload(snapshot) {
    const overall = computeOverallStatus(snapshot);
    const fetchedUnix = Math.floor((snapshot.fetchedAt || Date.now()) / 1000);

    const steamLines = [
        `• **Steam Store:** ${formatProbeStatus(snapshot.steam?.store)}`,
        `• **Steam Community:** ${formatProbeStatus(snapshot.steam?.community)}`,
        `• **Steam Web API:** ${formatProbeStatus(snapshot.steam?.webApi)}`
    ];

    const cs2StatsLines = [
        `• **Online hráči:** ${typeof snapshot.playerCount === 'number' ? `**${snapshot.playerCount.toLocaleString('sk-SK')}**` : 'N/A'}`
    ];

    const mm = snapshot.cs2?.matchmaking;
    if (mm) {
        if (typeof mm.online_servers === 'number') {
            cs2StatsLines.push(`• **Online servery:** ${mm.online_servers.toLocaleString('sk-SK')}`);
        }
        if (typeof mm.searching_players === 'number') {
            cs2StatsLines.push(`• **Hľadajúci hráči:** ${mm.searching_players.toLocaleString('sk-SK')}`);
        }
        if (typeof mm.search_seconds_avg === 'number') {
            cs2StatsLines.push(`• **Priemerný čas hľadania:** ${mm.search_seconds_avg} s`);
        }
    }

    const embed = new EmbedBuilder()
        .setAuthor({ name: 'Counter-Strike 2 & Steam' })
        .setTitle('🖥️ Stav CS2 a Steam serverov')
        .setThumbnail(CS2_ICON_URL)
        .setColor(overall.color)
        .setDescription(`${overall.label}\n🕒 Posledná aktualizácia: <t:${fetchedUnix}:R>`)
        .addFields(
            { name: '🌐 Steam služby', value: steamLines.join('\n'), inline: false },
            { name: '🎮 CS2 štatistiky', value: cs2StatsLines.join('\n'), inline: false }
        )
        .setTimestamp(snapshot.fetchedAt || Date.now());

    const services = snapshot.cs2?.services;
    if (services) {
        const serviceLines = [
            `• **Sessions Logon:** ${formatValveState(services.SessionsLogon)}`,
            `• **Inventár hráčov:** ${formatValveState(services.SteamCommunity)}`,
            `• **Matchmaking:** ${formatValveState(mm?.scheduler)}`
        ];
        embed.addFields({ name: '⚙️ CS2 služby', value: serviceLines.join('\n'), inline: false });
    }

    const euLines = extractEuDatacenters(snapshot.cs2?.datacenters);
    if (euLines.length > 0) {
        embed.addFields({ name: '🇪🇺 EU servery', value: euLines.join('\n'), inline: false });
    }

    if (snapshot.apiKeyError === 'invalid_key') {
        embed.addFields({
            name: '⚠️ STEAM_API_KEY',
            value: 'Nastavený `STEAM_API_KEY` bol odmietnutý Steam API (401/403).',
            inline: false
        });
    }

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setLabel('Otvoriť na webe')
            .setEmoji('🌐')
            .setStyle(ButtonStyle.Link)
            .setURL('https://steamstat.us/')
    );

    return { embeds: [embed], components: [row] };
}

async function updateGuildStatusMessage(client, guildId, { snapshot = null, forceNewMessage = false } = {}) {
    const config = getCsStatusGuildConfig(guildId);
    if (!config || !config.channelId) {
        return { ok: false, reason: 'not_configured' };
    }

    const guild = client.guilds.cache.get(guildId)
        || await client.guilds.fetch(guildId).catch(() => null);
    if (!guild) {
        return { ok: false, reason: 'missing_guild' };
    }

    const channel = guild.channels.cache.get(config.channelId)
        || await guild.channels.fetch(config.channelId).catch(() => null);
    if (!channel || !channel.isTextBased()) {
        return { ok: false, reason: 'missing_channel' };
    }

    const activeSnapshot = snapshot || await fetchCs2SteamStatus();
    const payload = buildCsStatusMessagePayload(activeSnapshot);

    let message = null;
    if (!forceNewMessage && config.messageId) {
        const existingMessage = await channel.messages.fetch(config.messageId).catch(() => null);
        if (existingMessage) {
            message = await existingMessage.edit(payload);
        }
    }

    if (!message) {
        message = await channel.send(payload);
    }

    const updatedConfig = {
        ...config,
        messageId: message.id,
        lastUpdatedAt: Date.now()
    };
    setCsStatusGuildConfig(guildId, updatedConfig);

    return {
        ok: true,
        messageId: message.id,
        channelId: config.channelId,
        snapshot: activeSnapshot
    };
}

async function updateDueStatusMessages(client) {
    const configs = getAllCsStatusGuildConfigs();
    const now = Date.now();

    const dueEntries = Object.entries(configs).filter(([, cfg]) => {
        if (!cfg?.channelId) return false;
        const intervalMs = (cfg.intervalMinutes || CSSTATUS_DEFAULTS.intervalMinutes) * 60 * 1000;
        return now - (cfg.lastUpdatedAt || 0) >= intervalMs;
    });

    if (dueEntries.length === 0) return;

    const snapshot = await fetchCs2SteamStatus();

    for (const [guildId] of dueEntries) {
        try {
            await updateGuildStatusMessage(client, guildId, { snapshot });
        } catch (err) {
            console.error(`Chyba pri aktualizácii CS2/Steam stavu na serveri ${guildId}:`, err);
        }
    }
}

module.exports = {
    fetchCs2SteamStatus,
    formatProbeStatus,
    formatValveState,
    extractEuDatacenters,
    buildCsStatusMessagePayload,
    updateGuildStatusMessage,
    updateDueStatusMessages
};
