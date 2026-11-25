const { ActivityType } = require('discord.js');
const { INTERVALS } = require('../config');
const { loadUsers, saveUsers } = require('../storage/usersStore');
const { getRankUpdaterSettings } = require('../storage/settingsStore');
const { fetchSteamCs2PlayingIds } = require('../services/steam');
const { resolveGuildMembers, updateMemberRank } = require('../services/ranks');

const CS2_DISCORD_APP_ID = '356875570916753438';
const BACKOFF_STEPS_MS = [60 * 1000, 2 * 60 * 1000, 5 * 60 * 1000];
const BACKUP_POST_MATCH_EXTRA_MS = 5 * 60 * 1000;
const TIMESTAMP_FLUSH_MS = 30 * 1000;
const SEEN_PERSIST_MIN_GAP_MS = 10 * 60 * 1000;

let activeClient = null;
let steamPollTimer = null;
let workerTimer = null;
let flushTimer = null;

let steamPollBusy = false;
let workerBusy = false;
let rateLimitUntil = 0;
let rateLimitBackoffLevel = 0;
let lastSteamPollAt = 0;

// In-memory stav prepojených hráčov (bez zbytočných zápisov na disk)
// userId -> {
//   steamId, steamPlaying, discordPlaying, isPlaying,
//   postMatchChecks: number[], nextCheckAt: number, priority: 1|2|3,
//   lastCheckedAt: number, lastCs2SeenAt: number, lastEloChangedAt: number,
//   lastHistoryAt: number, lastPersistedSeenAt: number
// }
const playerStates = new Map();

// Čakajúce aktualizácie metadát (lastCheckedAt / lastCs2SeenAt) na dávkový zápis do users.json
const pendingTimestampPatches = new Map();

function isPlayingCs2Presence(presence) {
    const activities = presence?.activities;
    if (!Array.isArray(activities) || activities.length === 0) return false;

    return activities.some(act => {
        if (!act) return false;
        if (act.type !== ActivityType.Playing && act.type !== 0) return false;
        if (act.applicationId && String(act.applicationId) === CS2_DISCORD_APP_ID) return true;
        const name = String(act.name || '').trim();
        return /counter-strike\s*2/i.test(name) || /^cs2$/i.test(name);
    });
}

function getLatestHistoryTimestamp(entry) {
    if (!Array.isArray(entry?.eloHistory) || entry.eloHistory.length === 0) return 0;
    let latest = 0;
    for (const point of entry.eloHistory) {
        if (typeof point?.timestamp === 'number' && point.timestamp > latest) {
            latest = point.timestamp;
        }
    }
    return latest;
}

function isPlayerRecentlyActive(state, now = Date.now()) {
    const cutoff = now - INTERVALS.RANK_INACTIVE_DAYS * 24 * 60 * 60 * 1000;
    const lastSignal = Math.max(
        state.lastCs2SeenAt || 0,
        state.lastEloChangedAt || 0,
        state.lastHistoryAt || 0
    );
    return lastSignal >= cutoff;
}

function getIntervalsMs(settings = getRankUpdaterSettings()) {
    return {
        activeMs: settings.activeIntervalMinutes * 60 * 1000,
        postMatchDelayMs: settings.postMatchDelayMinutes * 60 * 1000,
        backgroundMs: settings.backgroundIntervalMinutes * 60 * 1000,
        inactiveMs: settings.inactiveIntervalHours * 60 * 60 * 1000
    };
}

function queueTimestampPatch(userId, patch) {
    const prev = pendingTimestampPatches.get(userId) || {};
    pendingTimestampPatches.set(userId, { ...prev, ...patch });

    if (!flushTimer) {
        flushTimer = setTimeout(() => {
            flushTimer = null;
            flushPendingTimestamps();
        }, TIMESTAMP_FLUSH_MS);
        if (typeof flushTimer.unref === 'function') {
            flushTimer.unref();
        }
    }
}

function flushPendingTimestamps() {
    if (pendingTimestampPatches.size === 0) return;

    const snapshot = new Map(pendingTimestampPatches);
    pendingTimestampPatches.clear();

    try {
        const users = loadUsers();
        let changed = false;

        for (const [userId, patch] of snapshot.entries()) {
            const entry = users[userId];
            if (!entry) continue;

            if (typeof patch.lastCheckedAt === 'number' && patch.lastCheckedAt > (entry.lastCheckedAt || 0)) {
                entry.lastCheckedAt = patch.lastCheckedAt;
                changed = true;
            }
            if (typeof patch.lastCs2SeenAt === 'number' && patch.lastCs2SeenAt > (entry.lastCs2SeenAt || 0)) {
                entry.lastCs2SeenAt = patch.lastCs2SeenAt;
                changed = true;
            }
        }

        if (changed) {
            saveUsers(users);
        }
    } catch (err) {
        console.error('Chyba pri dávkovom ukladaní časov aktualizácie rankov:', err);
    }
}

function computeEffectivePlaying(state, settings) {
    const viaSteam = settings.useSteamApi && state.steamPlaying;
    const viaDiscord = settings.useDiscordPresence && state.discordPlaying;
    return Boolean(viaSteam || viaDiscord);
}

function computeBackgroundSchedule(state, now, intervals) {
    const recent = isPlayerRecentlyActive(state, now);
    const intervalMs = recent ? intervals.backgroundMs : intervals.inactiveMs;
    const priority = recent ? 2 : 3;
    return { intervalMs, priority };
}

function reconcilePlayingTransition(userId, state, now, settings) {
    const intervals = getIntervalsMs(settings);
    const wasPlaying = state.isPlaying;
    const nowPlaying = computeEffectivePlaying(state, settings);
    state.isPlaying = nowPlaying;

    if (nowPlaying) {
        state.lastCs2SeenAt = now;
        if (!state.lastPersistedSeenAt || now - state.lastPersistedSeenAt >= SEEN_PERSIST_MIN_GAP_MS) {
            state.lastPersistedSeenAt = now;
            queueTimestampPatch(userId, { lastCs2SeenAt: now });
        }

        if (!wasPlaying) {
            state.postMatchChecks = [];
            state.priority = 1;
            const target = now + intervals.activeMs;
            if (!state.nextCheckAt || state.nextCheckAt > target) {
                state.nextCheckAt = target;
            }
        }
        return;
    }

    if (wasPlaying && !nowPlaying) {
        // Hráč práve vypol CS2 -> 1. kontrola po postMatchDelay + poistná o 5 min neskôr
        const firstCheck = now + intervals.postMatchDelayMs;
        const backupCheck = firstCheck + BACKUP_POST_MATCH_EXTRA_MS;
        state.postMatchChecks = [firstCheck, backupCheck];
        state.priority = 1;
        state.nextCheckAt = firstCheck;
    }
}

function syncPlayerStatesWithUsers(users, now = Date.now(), settings = getRankUpdaterSettings()) {
    const intervals = getIntervalsMs(settings);
    const validIds = new Set(Object.keys(users));

    // Vyčistí odpojených hráčov
    for (const userId of playerStates.keys()) {
        if (!validIds.has(userId)) {
            playerStates.delete(userId);
            pendingTimestampPatches.delete(userId);
        }
    }

    let staggerIdx = 0;

    for (const [userId, entry] of Object.entries(users)) {
        const existing = playerStates.get(userId);
        const latestHistoryAt = getLatestHistoryTimestamp(entry);

        if (existing) {
            existing.steamId = entry.steamId;
            existing.lastHistoryAt = latestHistoryAt;
            if (entry.lastCheckedAt && entry.lastCheckedAt > existing.lastCheckedAt) {
                existing.lastCheckedAt = entry.lastCheckedAt;
            }
            if (entry.lastCs2SeenAt && entry.lastCs2SeenAt > existing.lastCs2SeenAt) {
                existing.lastCs2SeenAt = entry.lastCs2SeenAt;
            }
            if (entry.lastEloChangedAt && entry.lastEloChangedAt > existing.lastEloChangedAt) {
                existing.lastEloChangedAt = entry.lastEloChangedAt;
            }
            continue;
        }

        const state = {
            steamId: entry.steamId,
            steamPlaying: false,
            discordPlaying: false,
            isPlaying: false,
            postMatchChecks: [],
            nextCheckAt: now,
            priority: 2,
            lastCheckedAt: entry.lastCheckedAt || 0,
            lastCs2SeenAt: entry.lastCs2SeenAt || 0,
            lastEloChangedAt: entry.lastEloChangedAt || 0,
            lastHistoryAt: latestHistoryAt,
            lastPersistedSeenAt: entry.lastCs2SeenAt || 0
        };

        const { intervalMs, priority } = computeBackgroundSchedule(state, now, intervals);
        state.priority = priority;

        if (state.lastCheckedAt > 0) {
            const idealNext = state.lastCheckedAt + intervalMs;
            if (idealNext <= now) {
                state.nextCheckAt = now + staggerIdx * INTERVALS.RANK_WORKER_TICK_MS;
                staggerIdx++;
            } else {
                state.nextCheckAt = idealNext;
            }
        } else {
            state.nextCheckAt = now + staggerIdx * INTERVALS.RANK_WORKER_TICK_MS;
            staggerIdx++;
        }

        playerStates.set(userId, state);
    }
}

function scanGuildPresences(client) {
    const settings = getRankUpdaterSettings();
    if (!settings.useDiscordPresence || !client) return;

    const now = Date.now();
    for (const guild of client.guilds.cache.values()) {
        for (const [userId, presence] of guild.presences.cache.entries()) {
            const state = playerStates.get(userId);
            if (!state) continue;

            const playing = isPlayingCs2Presence(presence);
            if (state.discordPlaying !== playing) {
                state.discordPlaying = playing;
                reconcilePlayingTransition(userId, state, now, settings);
            }
        }
    }
}

async function runSteamPoll() {
    if (steamPollBusy) return;

    const settings = getRankUpdaterSettings();
    const now = Date.now();
    const users = loadUsers();
    syncPlayerStatesWithUsers(users, now, settings);

    if (!settings.useSteamApi || !process.env.STEAM_API_KEY?.trim()) {
        // Ak je Steam API vypnuté alebo chýba kľúč, vyčistí starý steamPlaying príznak
        for (const [userId, state] of playerStates.entries()) {
            if (state.steamPlaying) {
                state.steamPlaying = false;
                reconcilePlayingTransition(userId, state, now, settings);
            }
        }
        return;
    }

    const steamIds = [];
    for (const state of playerStates.values()) {
        if (state.steamId) steamIds.push(state.steamId);
    }
    if (steamIds.length === 0) return;

    steamPollBusy = true;
    try {
        const res = await fetchSteamCs2PlayingIds(steamIds);
        if (!res.ok) {
            if (res.rateLimited) {
                console.warn('[RankUpdater] Steam Web API vrátilo 429 rate-limit, ďalší pokus v ďalšom cykle.');
            }
            return;
        }

        lastSteamPollAt = Date.now();
        const checkTime = lastSteamPollAt;

        for (const [userId, state] of playerStates.entries()) {
            const nextSteamPlaying = res.playingIds.has(state.steamId);
            if (state.steamPlaying !== nextSteamPlaying || nextSteamPlaying) {
                state.steamPlaying = nextSteamPlaying;
                reconcilePlayingTransition(userId, state, checkTime, settings);
            }
        }
    } catch (err) {
        console.error('[RankUpdater] Chyba pri Steam pollovaní:', err);
    } finally {
        steamPollBusy = false;
    }
}

function pickNextDueUser(now) {
    let bestUserId = null;
    let bestState = null;

    for (const [userId, state] of playerStates.entries()) {
        if (state.nextCheckAt > now) continue;

        if (!bestState) {
            bestUserId = userId;
            bestState = state;
            continue;
        }

        if (state.priority < bestState.priority) {
            bestUserId = userId;
            bestState = state;
        } else if (state.priority === bestState.priority && state.nextCheckAt < bestState.nextCheckAt) {
            bestUserId = userId;
            bestState = state;
        }
    }

    return bestUserId ? { userId: bestUserId, state: bestState } : null;
}

async function processWorkerTick() {
    if (!activeClient || workerBusy) return;

    const now = Date.now();
    if (now < rateLimitUntil) return;

    const picked = pickNextDueUser(now);
    if (!picked) return;

    const { userId, state } = picked;
    workerBusy = true;

    try {
        const settings = getRankUpdaterSettings();
        const intervals = getIntervalsMs(settings);
        const users = loadUsers();
        const entry = users[userId];

        if (!entry) {
            playerStates.delete(userId);
            pendingTimestampPatches.delete(userId);
            return;
        }

        const members = await resolveGuildMembers(activeClient, userId);
        if (members.length === 0) {
            // Hráč nie je na žiadnom serveri bota -> skontroluj až neskôr
            state.lastCheckedAt = now;
            state.postMatchChecks = [];
            state.priority = 3;
            state.nextCheckAt = now + intervals.inactiveMs;
            return;
        }

        const previousElo = typeof entry.elo === 'number' ? entry.elo : null;
        let notified = false;
        let prefetchedProfile = null;
        let anyEloChanged = false;
        let anyDirty = false;
        let hitRateLimit = false;
        let retryAfterMs = 0;

        for (const member of members) {
            const result = await updateMemberRank(member, entry.steamId, users, {
                deferSave: true,
                prefetchedProfile,
                previousElo,
                notifyChange: !notified
            });

            if (result.rateLimited) {
                hitRateLimit = true;
                retryAfterMs = Math.max(retryAfterMs, result.retryAfterMs || 0);
                break;
            }

            if (!result.error) {
                if (result.notified) {
                    notified = true;
                }
                if (!prefetchedProfile && result.data) {
                    prefetchedProfile = result.data;
                }
                if (result.eloChanged) {
                    anyEloChanged = true;
                }
                if (result.dirty) {
                    anyDirty = true;
                }
            }
        }

        const doneAt = Date.now();

        if (hitRateLimit) {
            const stepMs = BACKOFF_STEPS_MS[Math.min(rateLimitBackoffLevel, BACKOFF_STEPS_MS.length - 1)];
            const waitMs = Math.max(stepMs, retryAfterMs);
            rateLimitBackoffLevel = Math.min(rateLimitBackoffLevel + 1, BACKOFF_STEPS_MS.length - 1);
            rateLimitUntil = doneAt + waitMs;
            state.nextCheckAt = rateLimitUntil + INTERVALS.RANK_WORKER_TICK_MS;
            console.warn(`[RankUpdater] Leetify API vrátilo 429 – pauza ${Math.round(waitMs / 1000)} s.`);
            return;
        }

        rateLimitBackoffLevel = 0;
        state.lastCheckedAt = doneAt;

        if (anyEloChanged) {
            state.lastEloChangedAt = doneAt;
            state.lastHistoryAt = doneAt;
        }

        if (anyDirty) {
            // Okamžitý bezpečný zápis iba zmeneného hráča do čerstvého users.json
            const freshUsers = loadUsers();
            if (freshUsers[userId]) {
                freshUsers[userId] = {
                    ...freshUsers[userId],
                    elo: entry.elo,
                    eloHistory: entry.eloHistory,
                    lastCheckedAt: doneAt,
                    ...(anyEloChanged ? { lastEloChangedAt: doneAt } : {}),
                    ...(state.lastCs2SeenAt ? { lastCs2SeenAt: Math.max(freshUsers[userId].lastCs2SeenAt || 0, state.lastCs2SeenAt) } : {})
                };
                saveUsers(freshUsers);
            }
            pendingTimestampPatches.delete(userId);
        } else {
            queueTimestampPatch(userId, { lastCheckedAt: doneAt });
        }

        // Naplánovanie ďalšej kontroly pre hráča
        if (state.isPlaying) {
            state.priority = 1;
            state.nextCheckAt = doneAt + intervals.activeMs;
        } else if (state.postMatchChecks.length > 0) {
            state.postMatchChecks = state.postMatchChecks.filter(ts => ts > doneAt + 15000);
            if (anyEloChanged || state.postMatchChecks.length === 0) {
                state.postMatchChecks = [];
                const bg = computeBackgroundSchedule(state, doneAt, intervals);
                state.priority = bg.priority;
                state.nextCheckAt = doneAt + bg.intervalMs;
            } else {
                state.priority = 1;
                state.nextCheckAt = state.postMatchChecks[0];
            }
        } else {
            const bg = computeBackgroundSchedule(state, doneAt, intervals);
            state.priority = bg.priority;
            state.nextCheckAt = doneAt + bg.intervalMs;
        }
    } catch (err) {
        console.error(`[RankUpdater] Chyba pri aktualizácii hráča ${userId}:`, err);
        state.nextCheckAt = Date.now() + 5 * 60 * 1000;
    } finally {
        workerBusy = false;
    }
}

function notifyPlayerDiscordCs2State(userId, isPlaying) {
    const state = playerStates.get(userId);
    if (!state) return;

    const settings = getRankUpdaterSettings();
    const nextPlaying = Boolean(isPlaying);
    if (state.discordPlaying === nextPlaying) return;

    state.discordPlaying = nextPlaying;
    reconcilePlayingTransition(userId, state, Date.now(), settings);
}

function syncLinkedPlayer(userId, entry) {
    const now = Date.now();
    const settings = getRankUpdaterSettings();
    const intervals = getIntervalsMs(settings);

    if (!entry) {
        playerStates.delete(userId);
        pendingTimestampPatches.delete(userId);
        return;
    }

    const existing = playerStates.get(userId);
    if (existing) {
        existing.steamId = entry.steamId;
        existing.lastCheckedAt = entry.lastCheckedAt || now;
        existing.lastEloChangedAt = entry.lastEloChangedAt || existing.lastEloChangedAt || now;
        existing.lastHistoryAt = getLatestHistoryTimestamp(entry) || existing.lastHistoryAt;
        return;
    }

    const state = {
        steamId: entry.steamId,
        steamPlaying: false,
        discordPlaying: false,
        isPlaying: false,
        postMatchChecks: [],
        nextCheckAt: now + intervals.backgroundMs,
        priority: 2,
        lastCheckedAt: entry.lastCheckedAt || now,
        lastCs2SeenAt: entry.lastCs2SeenAt || 0,
        lastEloChangedAt: entry.lastEloChangedAt || now,
        lastHistoryAt: getLatestHistoryTimestamp(entry) || now,
        lastPersistedSeenAt: entry.lastCs2SeenAt || 0
    };

    playerStates.set(userId, state);

    if (activeClient && settings.useDiscordPresence) {
        for (const guild of activeClient.guilds.cache.values()) {
            const presence = guild.presences.cache.get(userId);
            if (presence && isPlayingCs2Presence(presence)) {
                state.discordPlaying = true;
                reconcilePlayingTransition(userId, state, now, settings);
                break;
            }
        }
    }
}

function rescheduleRankUpdater() {
    const now = Date.now();
    const settings = getRankUpdaterSettings();
    const intervals = getIntervalsMs(settings);
    const users = loadUsers();
    syncPlayerStatesWithUsers(users, now, settings);

    if (activeClient && settings.useDiscordPresence) {
        scanGuildPresences(activeClient);
    }

    for (const [userId, state] of playerStates.entries()) {
        reconcilePlayingTransition(userId, state, now, settings);

        if (state.isPlaying) {
            state.priority = 1;
            const maxNext = now + intervals.activeMs;
            if (state.nextCheckAt > maxNext) {
                state.nextCheckAt = maxNext;
            }
        } else if (state.postMatchChecks.length > 0) {
            state.priority = 1;
            const maxFirst = now + intervals.postMatchDelayMs;
            if (state.nextCheckAt > maxFirst) {
                state.nextCheckAt = maxFirst;
                state.postMatchChecks = [maxFirst, maxFirst + BACKUP_POST_MATCH_EXTRA_MS];
            }
        } else {
            const bg = computeBackgroundSchedule(state, now, intervals);
            state.priority = bg.priority;
            const maxNext = now + bg.intervalMs;
            if (state.nextCheckAt > maxNext) {
                state.nextCheckAt = maxNext;
            }
        }
    }

    if (settings.useSteamApi && process.env.STEAM_API_KEY?.trim()) {
        runSteamPoll().catch(() => {});
    }
}

function getRankUpdaterStatus() {
    const now = Date.now();
    let playingCount = 0;
    let steamPlayingCount = 0;
    let discordPlayingCount = 0;
    let dueCount = 0;
    let postMatchCount = 0;

    for (const state of playerStates.values()) {
        if (state.isPlaying) playingCount++;
        if (state.steamPlaying) steamPlayingCount++;
        if (state.discordPlaying) discordPlayingCount++;
        if (state.postMatchChecks.length > 0) postMatchCount++;
        if (state.nextCheckAt <= now) dueCount++;
    }

    return {
        playingCount,
        steamPlayingCount,
        discordPlayingCount,
        trackedPlayersCount: playerStates.size,
        dueCount,
        postMatchCount,
        rateLimitedUntil: rateLimitUntil > now ? rateLimitUntil : 0,
        lastSteamPollAt,
        steamApiConfigured: Boolean(process.env.STEAM_API_KEY?.trim())
    };
}

function startRankUpdater(client) {
    activeClient = client;

    const now = Date.now();
    const settings = getRankUpdaterSettings();
    const users = loadUsers();
    syncPlayerStatesWithUsers(users, now, settings);
    scanGuildPresences(client);

    // Prvý Steam poll po 10 s od štartu, potom každé 2 minúty
    const initialSteamTimer = setTimeout(() => {
        runSteamPoll().catch(() => {});
    }, 10 * 1000);
    if (typeof initialSteamTimer.unref === 'function') {
        initialSteamTimer.unref();
    }

    if (steamPollTimer) clearInterval(steamPollTimer);
    steamPollTimer = setInterval(() => {
        runSteamPoll().catch(() => {});
    }, INTERVALS.RANK_STEAM_POLL_MS);

    if (workerTimer) clearInterval(workerTimer);
    workerTimer = setInterval(() => {
        processWorkerTick().catch(() => {});
    }, INTERVALS.RANK_WORKER_TICK_MS);

    return { steamPollTimer, workerTimer };
}

module.exports = {
    isPlayingCs2Presence,
    startRankUpdater,
    notifyPlayerDiscordCs2State,
    syncLinkedPlayer,
    rescheduleRankUpdater,
    getRankUpdaterStatus
};
