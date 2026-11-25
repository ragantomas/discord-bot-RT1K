const fs = require('fs');
const { PLAYER_ACTIVITY_FILE } = require('../config');

const MAX_VOICE_HISTORY = 25;
const MAX_DAILY_DAYS = 14;
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
let persistTimer = null;

function loadActivityMap() {
    if (!PLAYER_ACTIVITY_FILE || !fs.existsSync(PLAYER_ACTIVITY_FILE)) {
        return {};
    }
    try {
        const raw = JSON.parse(fs.readFileSync(PLAYER_ACTIVITY_FILE, 'utf8'));
        return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    } catch {
        return {};
    }
}

const activityMap = loadActivityMap();

function schedulePersist() {
    if (persistTimer) return;
    persistTimer = setTimeout(() => {
        persistTimer = null;
        try {
            fs.writeFileSync(PLAYER_ACTIVITY_FILE, JSON.stringify(activityMap, null, 2));
        } catch (err) {
            console.error('Chyba pri ukladaní aktivity hráčov:', err);
        }
    }, 1000);
    if (typeof persistTimer.unref === 'function') {
        persistTimer.unref();
    }
}

function getLocalDateKey(date = new Date()) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function bumpDailyCounter(field) {
    if (!activityMap._daily || typeof activityMap._daily !== 'object' || Array.isArray(activityMap._daily)) {
        activityMap._daily = {};
    }

    const key = getLocalDateKey();
    if (!activityMap._daily[key] || typeof activityMap._daily[key] !== 'object') {
        activityMap._daily[key] = { messages: 0, voiceJoins: 0, joins: 0, leaves: 0 };
    }
    activityMap._daily[key][field] = (Number(activityMap._daily[key][field]) || 0) + 1;

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - MAX_DAILY_DAYS);
    const cutoffKey = getLocalDateKey(cutoffDate);
    for (const k of Object.keys(activityMap._daily)) {
        if (k < cutoffKey) {
            delete activityMap._daily[k];
        }
    }
}

function ensureUserRecord(userId) {
    if (!activityMap[userId] || typeof activityMap[userId] !== 'object') {
        activityMap[userId] = {
            lastMessageAt: null,
            lastMessageChannelName: null,
            messagesTotal: 0,
            lastVoiceAt: null,
            lastVoiceChannelName: null,
            voiceHistory: []
        };
    }
    if (!Array.isArray(activityMap[userId].voiceHistory)) {
        activityMap[userId].voiceHistory = [];
    }
    return activityMap[userId];
}

function recordMessageActivity(message) {
    if (!message?.guild || !message.author || message.author.bot) return;
    const rec = ensureUserRecord(message.author.id);
    rec.lastMessageAt = message.createdTimestamp || Date.now();
    rec.lastMessageChannelName = message.channel?.name || null;
    rec.messagesTotal = (Number(rec.messagesTotal) || 0) + 1;
    bumpDailyCounter('messages');
    schedulePersist();
}

function recordVoiceActivity(oldState, newState) {
    const member = newState?.member || oldState?.member;
    if (!member || member.user?.bot) return;
    if (oldState?.channelId === newState?.channelId) return;

    const rec = ensureUserRecord(member.id);
    const now = Date.now();
    let type = 'leave';
    let channelName = oldState?.channel?.name || 'Voice';

    if (!oldState?.channelId && newState?.channelId) {
        type = 'join';
        channelName = newState.channel?.name || 'Voice';
        bumpDailyCounter('voiceJoins');
    } else if (oldState?.channelId && newState?.channelId) {
        type = 'move';
        channelName = `${oldState.channel?.name || 'Voice'} → ${newState.channel?.name || 'Voice'}`;
    }

    rec.lastVoiceAt = now;
    rec.lastVoiceChannelName = newState?.channel?.name || oldState?.channel?.name || null;
    rec.voiceHistory.unshift({
        timestamp: now,
        type,
        channelName: String(channelName).slice(0, 120)
    });
    if (rec.voiceHistory.length > MAX_VOICE_HISTORY) {
        rec.voiceHistory.length = MAX_VOICE_HISTORY;
    }

    schedulePersist();
}

function recordMemberJoin(member) {
    if (!member?.guild || member.user?.bot) return;
    bumpDailyCounter('joins');
    schedulePersist();
}

function recordMemberLeave(member) {
    if (!member?.guild || member.user?.bot) return;
    bumpDailyCounter('leaves');
    schedulePersist();
}

function getDailyActivity(days = 7) {
    const count = Math.min(Math.max(Math.round(Number(days) || 7), 1), MAX_DAILY_DAYS);
    const dailyMap = activityMap._daily && typeof activityMap._daily === 'object' ? activityMap._daily : {};
    const out = [];

    for (let i = count - 1; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const key = getLocalDateKey(d);
        const entry = dailyMap[key] || {};
        out.push({
            date: key,
            label: DAYS[d.getDay()],
            messages: Number(entry.messages) || 0,
            voiceJoins: Number(entry.voiceJoins) || 0,
            joins: Number(entry.joins) || 0,
            leaves: Number(entry.leaves) || 0
        });
    }

    return out;
}

function getPlayerActivity(userId) {
    const rec = activityMap[userId];
    if (!rec || userId === '_daily') {
        return {
            lastMessageAt: null,
            lastMessageChannelName: null,
            messagesTotal: 0,
            lastVoiceAt: null,
            lastVoiceChannelName: null,
            voiceHistory: []
        };
    }
    return {
        ...rec,
        voiceHistory: Array.isArray(rec.voiceHistory) ? [...rec.voiceHistory] : []
    };
}

function getAllPlayerActivity() {
    const out = {};
    for (const [k, v] of Object.entries(activityMap)) {
        if (k === '_daily') continue;
        out[k] = v;
    }
    return out;
}

module.exports = {
    recordMessageActivity,
    recordVoiceActivity,
    recordMemberJoin,
    recordMemberLeave,
    getDailyActivity,
    getPlayerActivity,
    getAllPlayerActivity
};
