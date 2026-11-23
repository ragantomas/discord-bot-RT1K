const MAX_LOGS = 150;
const logs = [];
let nextId = 1;

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

    return entry;
}

function getActivityLogs({ category = 'all', limit = 150 } = {}) {
    const filtered = category && category !== 'all'
        ? logs.filter(item => item.category === category)
        : logs;
    return filtered.slice(0, Math.max(1, Math.min(Number(limit) || MAX_LOGS, MAX_LOGS)));
}

function clearActivityLogs() {
    logs.length = 0;
}

module.exports = {
    addActivityLog,
    getActivityLogs,
    clearActivityLogs
};
