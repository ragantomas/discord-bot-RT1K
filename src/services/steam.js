const { CS2_APP_ID } = require('../config');

const STEAM_API_TIMEOUT_MS = 10000;
const STEAM_SUMMARIES_CHUNK_SIZE = 100;

// Vytiahne 17-miestne Steam64 ID z ID, Leetify URL, Steam /profiles/ aj /id/custom
async function resolveSteam64Id(input) {
    const cleaned = input.trim();

    // 1. Priame Steam64 ID, Steam /profiles/ alebo Leetify link
    const directMatch = cleaned.match(/7656119\d{10}/);
    if (directMatch) return directMatch[0];

    // 2. Steam custom URL (napr. https://steamcommunity.com/id/svetrikk)
    const customMatch = cleaned.match(/steamcommunity\.com\/id\/([^/?#]+)/i);
    const vanity = customMatch ? customMatch[1] : (!cleaned.includes('/') && !cleaned.includes(' ') ? cleaned : null);

    if (!vanity) return null;

    try {
        const res = await fetch(`https://steamcommunity.com/id/${encodeURIComponent(vanity)}/?xml=1`, {
            headers: { 'User-Agent': 'CS2-Discord-Bot/1.0' },
            signal: AbortSignal.timeout(STEAM_API_TIMEOUT_MS)
        });
        if (!res.ok) return null;
        const xml = await res.text();
        const idMatch = xml.match(/<steamID64>(\d{17})<\/steamID64>/);
        return idMatch ? idMatch[1] : null;
    } catch {
        return null;
    }
}

// Dávkovo (po 100 ID) zistí cez Steam Web API, ktoré Steam účty majú práve spustené CS2
async function fetchSteamCs2PlayingIds(steamIds) {
    const apiKey = process.env.STEAM_API_KEY?.trim() || '';
    const playingIds = new Set();

    if (!apiKey) {
        return { ok: false, missingKey: true, rateLimited: false, checked: 0, playingIds };
    }

    const uniqueIds = [];
    const seen = new Set();
    for (const id of steamIds || []) {
        const clean = String(id || '').trim();
        if (!/^\d{17}$/.test(clean) || seen.has(clean)) continue;
        seen.add(clean);
        uniqueIds.push(clean);
    }

    if (uniqueIds.length === 0) {
        return { ok: true, missingKey: false, rateLimited: false, checked: 0, playingIds };
    }

    let checked = 0;
    const targetAppId = String(CS2_APP_ID);

    for (let i = 0; i < uniqueIds.length; i += STEAM_SUMMARIES_CHUNK_SIZE) {
        const chunk = uniqueIds.slice(i, i + STEAM_SUMMARIES_CHUNK_SIZE);
        const url = `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${encodeURIComponent(apiKey)}&steamids=${chunk.join(',')}`;

        try {
            const res = await fetch(url, {
                headers: { 'User-Agent': 'CS2-Discord-Bot/1.0' },
                signal: AbortSignal.timeout(STEAM_API_TIMEOUT_MS)
            });

            if (res.status === 429) {
                return { ok: false, missingKey: false, rateLimited: true, checked, playingIds };
            }

            if (!res.ok) {
                return { ok: false, missingKey: false, rateLimited: false, status: res.status, checked, playingIds };
            }

            const data = await res.json();
            const players = Array.isArray(data?.response?.players) ? data.response.players : [];
            checked += chunk.length;

            for (const player of players) {
                if (player?.steamid && String(player.gameid || '') === targetAppId) {
                    playingIds.add(String(player.steamid));
                }
            }
        } catch (err) {
            return {
                ok: false,
                missingKey: false,
                rateLimited: false,
                error: err?.message || 'network_error',
                checked,
                playingIds
            };
        }
    }

    return { ok: true, missingKey: false, rateLimited: false, checked, playingIds };
}

module.exports = {
    resolveSteam64Id,
    fetchSteamCs2PlayingIds
};
