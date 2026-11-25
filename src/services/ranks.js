const { INTERVALS } = require('../config');
const { fetchLeetifyProfileDetailed } = require('./leetify');
const { loadUsers, saveUsers, appendEloHistory } = require('../storage/usersStore');
const { getRankSettings } = require('../storage/settingsStore');
const { notifyRankChange } = require('./rankFeed');
const { addThrottledErrorLog } = require('./activityLog');

let isBulkUpdating = false;

function getRankForElo(elo) {
    if (typeof elo !== 'number' || elo < 1000) return null;
    const { rankRoles } = getRankSettings();
    return rankRoles.find(r => elo >= r.min) ?? null;
}

async function removeRankRoles(member) {
    const { allRankRoleIds } = getRankSettings();
    const rolesToRemove = member.roles.cache.filter(r => allRankRoleIds.includes(r.id));
    if (rolesToRemove.size > 0) {
        await member.roles.remove(rolesToRemove).catch(console.error);
    }
}

async function resolveGuildMembers(client, userId) {
    const members = [];
    for (const guild of client.guilds.cache.values()) {
        let member = guild.members.cache.get(userId) || null;
        if (!member) {
            member = await guild.members.fetch(userId).catch(() => null);
        }
        if (member) {
            members.push(member);
        }
    }
    return members;
}

async function updateMemberRank(member, steam64Id, users = null, options = {}) {
    try {
        const previousElo = typeof options.previousElo === 'number'
            ? options.previousElo
            : (typeof users?.[member.id]?.elo === 'number' ? users[member.id].elo : null);

        const isEn = options.lang === 'en';
        const leetifyRes = options.prefetchedProfile
            ? { ok: true, status: 200, notFound: false, rateLimited: false, retryAfterMs: 0, data: options.prefetchedProfile }
            : await fetchLeetifyProfileDetailed(steam64Id);

        if (leetifyRes.rateLimited) {
            return {
                error: isEn
                    ? 'Leetify API is temporarily rate-limited, try again shortly.'
                    : 'Leetify API je dočasne preťažené, skús to o chvíľu.',
                rateLimited: true,
                retryAfterMs: leetifyRes.retryAfterMs || 0,
                notFound: false
            };
        }

        if (leetifyRes.notFound || !leetifyRes.ok || !leetifyRes.data) {
            return {
                error: leetifyRes.notFound
                    ? (isEn ? 'Profile not found on Leetify.' : 'Profil sa nenašiel na Leetify.')
                    : (isEn ? 'Failed to load profile from Leetify.' : 'Nepodarilo sa načítať profil z Leetify.'),
                rateLimited: false,
                retryAfterMs: 0,
                notFound: Boolean(leetifyRes.notFound)
            };
        }

        const data = leetifyRes.data;
        const { unrankedRoleId, allRankRoleIds } = getRankSettings();
        const premierElo = data?.ranks?.premier;

        let targetRoleId = unrankedRoleId;
        let isUnranked = true;

        const targetRole = getRankForElo(premierElo);
        if (targetRole) {
            targetRoleId = targetRole.roleId;
            isUnranked = false;
        }

        const rolesToRemove = member.roles.cache.filter(
            r => allRankRoleIds.includes(r.id) && r.id !== targetRoleId
        );

        if (rolesToRemove.size > 0) await member.roles.remove(rolesToRemove);
        if (targetRoleId && !member.roles.cache.has(targetRoleId)) {
            await member.roles.add(targetRoleId);
        }

        const finalElo = isUnranked ? null : Math.round(premierElo);
        const eloChanged = finalElo !== previousElo;
        const now = Date.now();
        let dirty = false;

        // Uloží aktuálne Elo pre /leaderboard a dashboard
        if (users && users[member.id]) {
            const entry = users[member.id];
            const prevHistoryLen = Array.isArray(entry.eloHistory) ? entry.eloHistory.length : 0;

            entry.elo = finalElo;
            entry.lastCheckedAt = now;
            if (eloChanged) {
                entry.lastEloChangedAt = now;
            }
            appendEloHistory(entry, finalElo, now);

            const historyChanged = entry.eloHistory.length !== prevHistoryLen;
            dirty = eloChanged || historyChanged || Boolean(options.markDirtyOnCheck);

            if (!options.deferSave) {
                saveUsers(users);
            }
        }

        let notified = false;
        if (options.notifyChange !== false && typeof previousElo === 'number' && typeof finalElo === 'number') {
            notified = await notifyRankChange(member, previousElo, finalElo).catch((err) => {
                console.error(err);
                return false;
            });
        }

        return {
            elo: finalElo,
            previousElo,
            eloChanged,
            dirty,
            notified,
            data,
            rateLimited: false,
            retryAfterMs: 0,
            notFound: false
        };
    } catch (err) {
        console.error(err);
        addThrottledErrorLog({
            key: `ranks:update:${member.guild.id}`,
            category: 'elo',
            message: `Failed to update CS2 rank for ${member.displayName}: ${err?.message || err}`,
            targetUserId: member.id
        });
        return {
            error: options.lang === 'en'
                ? 'Error communicating with Leetify or Discord.'
                : 'Chyba pri komunikácii s Leetify alebo Discordom.',
            rateLimited: false,
            retryAfterMs: 0,
            notFound: false
        };
    }
}

async function updateAllMemberRanks(client) {
    if (isBulkUpdating) {
        return { alreadyRunning: true, total: 0, updated: 0, failed: 0, rateLimited: false };
    }

    isBulkUpdating = true;
    const users = loadUsers();
    const entries = Object.entries(users);
    let updated = 0;
    let failed = 0;
    let dirtyCount = 0;
    let rateLimited = false;

    try {
        for (const [userId, entry] of entries) {
            const members = await resolveGuildMembers(client, userId);
            if (members.length === 0) {
                failed++;
                continue;
            }

            const previousElo = typeof entry.elo === 'number' ? entry.elo : null;
            let notified = false;
            let prefetchedProfile = null;
            let memberUpdated = false;

            for (const member of members) {
                const result = await updateMemberRank(member, entry.steamId, users, {
                    deferSave: true,
                    prefetchedProfile,
                    markDirtyOnCheck: true,
                    previousElo,
                    notifyChange: !notified
                });

                if (result.rateLimited) {
                    rateLimited = true;
                    break;
                }

                if (!result.error) {
                    memberUpdated = true;
                    if (result.notified) {
                        notified = true;
                    }
                    if (!prefetchedProfile && result.data) {
                        prefetchedProfile = result.data;
                    }
                    if (result.dirty) {
                        dirtyCount++;
                    }
                }
            }

            if (rateLimited) break;

            if (memberUpdated) {
                updated++;
            } else {
                failed++;
            }

            if (dirtyCount >= 50) {
                saveUsers(users);
                dirtyCount = 0;
            }

            await new Promise(r => setTimeout(r, INTERVALS.RANK_UPDATE_DELAY_MS));
        }

        if (dirtyCount > 0) {
            saveUsers(users);
        }

        return {
            alreadyRunning: false,
            total: entries.length,
            updated,
            failed,
            rateLimited
        };
    } finally {
        isBulkUpdating = false;
    }
}

module.exports = {
    getRankForElo,
    removeRankRoles,
    resolveGuildMembers,
    updateMemberRank,
    updateAllMemberRanks
};
