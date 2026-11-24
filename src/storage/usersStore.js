const fs = require('fs');
const { DB_FILE } = require('../config');

const MAX_ELO_HISTORY = 30;

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

function loadUsers() {
    if (!fs.existsSync(DB_FILE)) return {};
    const raw = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    // Automatická konverzia zo starého formátu ("id": "7656...") na objekt + normalizácia eloHistory
    for (const [id, val] of Object.entries(raw)) {
        if (typeof val === 'string') {
            raw[id] = { steamId: val, elo: null, eloHistory: [] };
        } else if (val && typeof val === 'object') {
            val.eloHistory = normalizeEloHistory(val.eloHistory);
        }
    }
    return raw;
}

function saveUsers(users) {
    fs.writeFileSync(DB_FILE, JSON.stringify(users, null, 2));
}

function usersFileExists() {
    return fs.existsSync(DB_FILE);
}

module.exports = {
    MAX_ELO_HISTORY,
    normalizeEloHistory,
    appendEloHistory,
    loadUsers,
    saveUsers,
    usersFileExists
};
