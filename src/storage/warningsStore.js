const fs = require('fs');
const { WARNINGS_FILE } = require('../config');

function normalizeWarningsData(raw) {
    const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const rawByUser = src.byUser && typeof src.byUser === 'object' && !Array.isArray(src.byUser)
        ? src.byUser
        : {};

    const byUser = {};
    let maxId = 0;

    for (const [userId, list] of Object.entries(rawByUser)) {
        if (!/^\d{15,22}$/.test(String(userId)) || !Array.isArray(list)) continue;
        const cleaned = [];
        for (const item of list) {
            if (!item || typeof item !== 'object') continue;
            const id = Number.isInteger(Number(item.id)) && Number(item.id) > 0
                ? Number(item.id)
                : maxId + 1;
            if (id > maxId) maxId = id;

            const reason = String(item.reason || '').trim().slice(0, 500);
            if (!reason) continue;

            cleaned.push({
                id,
                reason,
                moderatorId: item.moderatorId ? String(item.moderatorId).trim() : null,
                moderatorTag: item.moderatorTag ? String(item.moderatorTag).trim().slice(0, 80) : 'Neznámy',
                createdAt: typeof item.createdAt === 'number' && Number.isFinite(item.createdAt)
                    ? item.createdAt
                    : Date.now()
            });
        }
        if (cleaned.length > 0) {
            byUser[userId] = cleaned;
        }
    }

    const rawNextId = Number.isInteger(Number(src.nextId)) ? Number(src.nextId) : 1;
    return {
        nextId: Math.max(rawNextId, maxId + 1),
        byUser
    };
}

function loadWarnings() {
    if (!fs.existsSync(WARNINGS_FILE)) {
        return { nextId: 1, byUser: {} };
    }
    try {
        const raw = JSON.parse(fs.readFileSync(WARNINGS_FILE, 'utf8'));
        return normalizeWarningsData(raw);
    } catch {
        return { nextId: 1, byUser: {} };
    }
}

function saveWarnings(data) {
    const normalized = normalizeWarningsData(data);
    fs.writeFileSync(WARNINGS_FILE, JSON.stringify(normalized, null, 2));
    return normalized;
}

function getUserWarnings(userId) {
    const data = loadWarnings();
    return [...(data.byUser[userId] || [])];
}

function getAllWarningsByUser() {
    return loadWarnings().byUser;
}

function addWarning(userId, { reason, moderatorId = null, moderatorTag = 'Neznámy' } = {}) {
    const cleanReason = String(reason || '').trim().slice(0, 500) || 'Bez dôvodu';
    const data = loadWarnings();
    const warning = {
        id: data.nextId++,
        reason: cleanReason,
        moderatorId: moderatorId ? String(moderatorId).trim() : null,
        moderatorTag: String(moderatorTag || 'Neznámy').trim().slice(0, 80),
        createdAt: Date.now()
    };

    if (!Array.isArray(data.byUser[userId])) {
        data.byUser[userId] = [];
    }
    data.byUser[userId].push(warning);
    const saved = saveWarnings(data);

    return {
        warning,
        total: (saved.byUser[userId] || []).length
    };
}

function deleteWarning(userId, warningId) {
    const targetId = Number(warningId);
    const data = loadWarnings();
    const list = data.byUser[userId];
    if (!Array.isArray(list) || !Number.isInteger(targetId)) {
        return { removed: null, remaining: Array.isArray(list) ? list.length : 0 };
    }

    const idx = list.findIndex(w => w.id === targetId);
    if (idx === -1) {
        return { removed: null, remaining: list.length };
    }

    const [removed] = list.splice(idx, 1);
    if (list.length === 0) {
        delete data.byUser[userId];
    }
    const saved = saveWarnings(data);

    return {
        removed,
        remaining: (saved.byUser[userId] || []).length
    };
}

function clearUserWarnings(userId) {
    const data = loadWarnings();
    const list = data.byUser[userId];
    if (!Array.isArray(list) || list.length === 0) return 0;

    const count = list.length;
    delete data.byUser[userId];
    saveWarnings(data);
    return count;
}

module.exports = {
    normalizeWarningsData,
    loadWarnings,
    saveWarnings,
    getUserWarnings,
    getAllWarningsByUser,
    addWarning,
    deleteWarning,
    clearUserWarnings
};
