const fs = require('fs');
const { ACTIVITY_LOG_FILE } = require('../config');

const MAX_LOGS = 500;
let nextId = 1;
let persistTimer = null;

function loadPersistedLogs() {
    try {
        if (!ACTIVITY_LOG_FILE || !fs.existsSync(ACTIVITY_LOG_FILE)) return [];
        const raw = JSON.parse(fs.readFileSync(ACTIVITY_LOG_FILE, 'utf8'));
        if (!Array.isArray(raw)) return [];

        const valid = raw
            .filter(item => item && typeof item === 'object' && typeof item.message === 'string' && item.message.trim())
            .slice(0, MAX_LOGS)
            .map((item, idx) => ({
                id: typeof item.id === 'number' && Number.isFinite(item.id) ? item.id : idx + 1,
                timestamp: typeof item.timestamp === 'number' && Number.isFinite(item.timestamp) ? item.timestamp : Date.now(),
                level: typeof item.level === 'string' ? item.level : 'info',
                category: typeof item.category === 'string' ? item.category : 'system',
                message: String(item.message).slice(0, 500),
                actor: item.actor ? String(item.actor).slice(0, 80) : null
            }));

        const maxId = valid.reduce((max, item) => (item.id > max ? item.id : max), 0);
        nextId = maxId + 1;
        return valid;
    } catch {
        return [];
    }
}

const logs = loadPersistedLogs();

function persistNow() {
    if (persistTimer) {
        clearTimeout(persistTimer);
        persistTimer = null;
    }
    try {
        fs.writeFileSync(ACTIVITY_LOG_FILE, JSON.stringify(logs, null, 2));
    } catch (err) {
        console.error('Chyba pri ukladaní Activity Logu:', err);
    }
}

function schedulePersist() {
    if (persistTimer) return;
    persistTimer = setTimeout(() => {
        persistTimer = null;
        try {
            fs.writeFileSync(ACTIVITY_LOG_FILE, JSON.stringify(logs, null, 2));
        } catch (err) {
            console.error('Chyba pri ukladaní Activity Logu:', err);
        }
    }, 800);
    if (typeof persistTimer.unref === 'function') {
        persistTimer.unref();
    }
}

function addActivityLog({ level = 'info', category = 'system', message = '', actor = null } = {}) {
    if (!message) return null;

    const entry = {
        id: nextId++,
        timestamp: Date.now(),
        level,
        category,
        message: String(message).slice(0, 500),
        actor: actor ? String(actor).slice(0, 80) : null
    };

    logs.unshift(entry);
    if (logs.length > MAX_LOGS) {
        logs.length = MAX_LOGS;
    }

    schedulePersist();
    return entry;
}

function getActivityLogs({ category = 'all', limit = MAX_LOGS } = {}) {
    const filtered = category && category !== 'all'
        ? logs.filter(item => item.category === category)
        : logs;
    return filtered.slice(0, Math.max(1, Math.min(Number(limit) || MAX_LOGS, MAX_LOGS)));
}

function clearActivityLogs() {
    logs.length = 0;
    persistNow();
}

module.exports = {
    MAX_LOGS,
    addActivityLog,
    getActivityLogs,
    clearActivityLogs,
    persistNow
};
