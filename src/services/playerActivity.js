const fs = require('fs');
const { PLAYER_ACTIVITY_FILE } = require('../config');

const MAX_VOICE_HISTORY = 25;
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

function getPlayerActivity(userId) {
    const rec = activityMap[userId];
    if (!rec) {
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
    return activityMap;
}

module.exports = {
    recordMessageActivity,
    recordVoiceActivity,
    getPlayerActivity,
    getAllPlayerActivity
};
