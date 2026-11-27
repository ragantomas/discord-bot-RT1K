const fs = require('fs');
const { DB_FILE } = require('../config');
const { writeJsonAtomic } = require('./atomicWrite');

const MAX_ELO_HISTORY = 30;

function normalizeOptionalTimestamp(val) {
    return typeof val === 'number' && Number.isFinite(val) && val > 0
        ? Math.round(val)
        : null;
}

function normalizeEloHistory(rawHistory) {
    if (!Array.isArray(rawHistory)) return [];
    const cleaned = rawHistory
        .filter(point => (
            point &&
            typeof point === 'object' &&
            typeof point.elo === 'number' &&
            Number.isFinite(point.elo) &&
            point.elo >= 1000 &&
            typeof point.timestamp === 'number' &&
            Number.isFinite(point.timestamp) &&
            point.timestamp > 0
        ))
        .map(point => ({
            elo: Math.round(point.elo),
            timestamp: Math.round(point.timestamp)
        }))
        .sort((a, b) => a.timestamp - b.timestamp);

    return cleaned.slice(-MAX_ELO_HISTORY);
}

function appendEloHistory(entry, elo, timestamp = Date.now()) {
    if (!entry || typeof entry !== 'object') return [];
    entry.eloHistory = normalizeEloHistory(entry.eloHistory);

    if (typeof elo === 'number' && Number.isFinite(elo) && elo >= 1000) {
        const roundedElo = Math.round(elo);
        const last = entry.eloHistory[entry.eloHistory.length - 1];
        if (!last || last.elo !== roundedElo) {
            entry.eloHistory.push({
                elo: roundedElo,
                timestamp: Math.round(Number(timestamp) || Date.now())
            });
            if (entry.eloHistory.length > MAX_ELO_HISTORY) {
                entry.eloHistory = entry.eloHistory.slice(-MAX_ELO_HISTORY);
            }
        }
    }

    return entry.eloHistory;
}

function normalizeUserEntry(val) {
    if (typeof val === 'string') {
        return { steamId: val, elo: null, eloHistory: [] };
    }
    if (!val || typeof val !== 'object') return null;

    const normalized = {
        ...val,
        steamId: String(val.steamId || '').trim(),
        elo: typeof val.elo === 'number' && Number.isFinite(val.elo) ? Math.round(val.elo) : null,
        eloHistory: normalizeEloHistory(val.eloHistory)
    };

    const lastCheckedAt = normalizeOptionalTimestamp(val.lastCheckedAt);
    const lastCs2SeenAt = normalizeOptionalTimestamp(val.lastCs2SeenAt);
    const lastEloChangedAt = normalizeOptionalTimestamp(val.lastEloChangedAt);

    if (lastCheckedAt) normalized.lastCheckedAt = lastCheckedAt;
    else delete normalized.lastCheckedAt;

    if (lastCs2SeenAt) normalized.lastCs2SeenAt = lastCs2SeenAt;
    else delete normalized.lastCs2SeenAt;

    if (lastEloChangedAt) normalized.lastEloChangedAt = lastEloChangedAt;
    else delete normalized.lastEloChangedAt;

    return normalized;
}

function loadUsers() {
    if (!fs.existsSync(DB_FILE)) return {};
    const raw = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    // Automatická konverzia zo starého formátu ("id": "7656...") na objekt + normalizácia metadát
    for (const [id, val] of Object.entries(raw)) {
        const normalized = normalizeUserEntry(val);
        if (normalized) {
            raw[id] = normalized;
        }
    }
    return raw;
}

function saveUsers(users) {
    writeJsonAtomic(DB_FILE, users);
}

function usersFileExists() {
    return fs.existsSync(DB_FILE);
}

module.exports = {
    MAX_ELO_HISTORY,
    normalizeEloHistory,
    normalizeUserEntry,
    appendEloHistory,
    loadUsers,
    saveUsers,
    usersFileExists
};
