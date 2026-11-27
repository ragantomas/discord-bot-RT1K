const fs = require('fs');
const { MODERATION_FILE } = require('../config');
const { writeJsonAtomic } = require('./atomicWrite');

const MAX_CASES = 1000;

function normalizeModerationData(raw) {
    const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const rawCases = Array.isArray(src.cases) ? src.cases : [];
    const cases = [];
    let maxCaseId = 0;

    for (const item of rawCases) {
        if (!item || typeof item !== 'object') continue;
        const caseId = Number.isInteger(Number(item.caseId)) && Number(item.caseId) > 0
            ? Number(item.caseId)
            : maxCaseId + 1;
        if (caseId > maxCaseId) maxCaseId = caseId;

        const userId = String(item.userId || '').trim();
        const action = String(item.action || '').trim();
        if (!userId || !action) continue;

        cases.push({
            caseId,
            action,
            userId,
            userTag: item.userTag ? String(item.userTag).trim().slice(0, 80) : `ID ${userId}`,
            moderatorId: item.moderatorId ? String(item.moderatorId).trim() : null,
            moderatorTag: item.moderatorTag ? String(item.moderatorTag).trim().slice(0, 80) : 'Neznámy',
            reason: item.reason ? String(item.reason).trim().slice(0, 500) : 'Bez dôvodu',
            durationMinutes: typeof item.durationMinutes === 'number' && Number.isFinite(item.durationMinutes) && item.durationMinutes > 0
                ? Math.round(item.durationMinutes)
                : null,
            expiresAt: typeof item.expiresAt === 'number' && Number.isFinite(item.expiresAt) && item.expiresAt > 0
                ? Math.round(item.expiresAt)
                : null,
            createdAt: typeof item.createdAt === 'number' && Number.isFinite(item.createdAt)
                ? Math.round(item.createdAt)
                : Date.now()
        });
    }

    cases.sort((a, b) => b.caseId - a.caseId);
    if (cases.length > MAX_CASES) {
        cases.length = MAX_CASES;
    }

    const rawTempBans = src.tempBans && typeof src.tempBans === 'object' && !Array.isArray(src.tempBans)
        ? src.tempBans
        : {};
    const tempBans = {};

    for (const [uid, tb] of Object.entries(rawTempBans)) {
        if (!/^\d{15,22}$/.test(String(uid)) || !tb || typeof tb !== 'object') continue;
        const expiresAt = Number(tb.expiresAt);
        if (!Number.isFinite(expiresAt) || expiresAt <= 0) continue;

        tempBans[uid] = {
            guildId: String(tb.guildId || '').trim(),
            userId: String(uid),
            userTag: tb.userTag ? String(tb.userTag).trim().slice(0, 80) : `ID ${uid}`,
            caseId: Number.isInteger(Number(tb.caseId)) ? Number(tb.caseId) : null,
            reason: tb.reason ? String(tb.reason).trim().slice(0, 500) : 'Bez dôvodu',
            expiresAt: Math.round(expiresAt),
            createdAt: typeof tb.createdAt === 'number' && Number.isFinite(tb.createdAt)
                ? Math.round(tb.createdAt)
                : Date.now()
        };
    }

    const rawNext = Number.isInteger(Number(src.nextCaseId)) ? Number(src.nextCaseId) : 1;
    return {
        nextCaseId: Math.max(rawNext, maxCaseId + 1),
        cases,
        tempBans
    };
}

function loadModerationData() {
    if (!MODERATION_FILE || !fs.existsSync(MODERATION_FILE)) {
        return { nextCaseId: 1, cases: [], tempBans: {} };
    }
    try {
        const raw = JSON.parse(fs.readFileSync(MODERATION_FILE, 'utf8'));
        return normalizeModerationData(raw);
    } catch {
        return { nextCaseId: 1, cases: [], tempBans: {} };
    }
}

function saveModerationData(data) {
    const normalized = normalizeModerationData(data);
    writeJsonAtomic(MODERATION_FILE, normalized);
    return normalized;
}

function recordModerationCase({
    action,
    userId,
    userTag = null,
    moderatorId = null,
    moderatorTag = 'Neznámy',
    reason = 'Bez dôvodu',
    durationMinutes = null,
    expiresAt = null
} = {}) {
    const data = loadModerationData();
    const cleanUserId = String(userId || '').trim();
    const entry = {
        caseId: data.nextCaseId++,
        action: String(action || 'unknown').trim(),
        userId: cleanUserId,
        userTag: userTag ? String(userTag).trim().slice(0, 80) : `ID ${cleanUserId}`,
        moderatorId: moderatorId ? String(moderatorId).trim() : null,
        moderatorTag: String(moderatorTag || 'Neznámy').trim().slice(0, 80),
        reason: String(reason || 'Bez dôvodu').trim().slice(0, 500),
        durationMinutes: typeof durationMinutes === 'number' && Number.isFinite(durationMinutes) && durationMinutes > 0
            ? Math.round(durationMinutes)
            : null,
        expiresAt: typeof expiresAt === 'number' && Number.isFinite(expiresAt) && expiresAt > 0
            ? Math.round(expiresAt)
            : null,
        createdAt: Date.now()
    };

    data.cases.unshift(entry);
    if (data.cases.length > MAX_CASES) {
        data.cases.length = MAX_CASES;
    }
    saveModerationData(data);
    return entry;
}

function getModerationCases({ userId = null, limit = 100 } = {}) {
    const data = loadModerationData();
    const filtered = userId
        ? data.cases.filter(c => c.userId === String(userId))
        : data.cases;
    const cap = Math.max(1, Math.min(Number(limit) || 100, MAX_CASES));
    return filtered.slice(0, cap);
}

function getModerationCase(caseId) {
    const id = Number(caseId);
    if (!Number.isInteger(id)) return null;
    const data = loadModerationData();
    return data.cases.find(c => c.caseId === id) || null;
}

function setTempBan(userId, entry) {
    const uid = String(userId || '').trim();
    if (!/^\d{15,22}$/.test(uid)) return null;
    const data = loadModerationData();
    data.tempBans[uid] = {
        guildId: String(entry.guildId || '').trim(),
        userId: uid,
        userTag: entry.userTag ? String(entry.userTag).trim().slice(0, 80) : `ID ${uid}`,
        caseId: entry.caseId ?? null,
        reason: entry.reason ? String(entry.reason).trim().slice(0, 500) : 'Bez dôvodu',
        expiresAt: Math.round(Number(entry.expiresAt)),
        createdAt: entry.createdAt ? Math.round(Number(entry.createdAt)) : Date.now()
    };
    const saved = saveModerationData(data);
    return saved.tempBans[uid] || null;
}

function deleteTempBan(userId) {
    const uid = String(userId || '').trim();
    const data = loadModerationData();
    if (!data.tempBans[uid]) return false;
    delete data.tempBans[uid];
    saveModerationData(data);
    return true;
}

function getTempBan(userId) {
    const uid = String(userId || '').trim();
    return loadModerationData().tempBans[uid] || null;
}

function getAllTempBans() {
    return loadModerationData().tempBans;
}

function getDueTempBans(now = Date.now()) {
    const all = loadModerationData().tempBans;
    return Object.values(all).filter(tb => tb && tb.expiresAt <= now);
}

module.exports = {
    loadModerationData,
    saveModerationData,
    normalizeModerationData,
    recordModerationCase,
    getModerationCases,
    getModerationCase,
    setTempBan,
    deleteTempBan,
    getTempBan,
    getAllTempBans,
    getDueTempBans
};
