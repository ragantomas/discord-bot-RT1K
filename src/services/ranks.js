const { INTERVALS } = require('../config');
const { fetchLeetifyProfile } = require('./leetify');
const { loadUsers, saveUsers } = require('../storage/usersStore');
const { getRankSettings } = require('../storage/settingsStore');

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

async function updateMemberRank(member, steam64Id, users = null) {
    try {
        const data = await fetchLeetifyProfile(steam64Id);
        if (!data) return { error: 'Profil sa nenašiel na Leetify.' };

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

        const finalElo = isUnranked ? null : premierElo;

        // Uloží aktuálne Elo pre /leaderboard a dashboard
        if (users && users[member.id]) {
            users[member.id].elo = finalElo;
            saveUsers(users);
        }

        return { elo: finalElo, data };
    } catch (err) {
        console.error(err);
        return { error: 'Chyba pri komunikácii s Leetify alebo Discordom.' };
    }
}

async function updateAllMemberRanks(client) {
    if (isBulkUpdating) {
        return { alreadyRunning: true, total: 0, updated: 0, failed: 0 };
    }

    isBulkUpdating = true;
    const users = loadUsers();
    const entries = Object.entries(users);
    let updated = 0;
    let failed = 0;

    try {
        for (const [userId, entry] of entries) {
            let memberUpdated = false;
            for (const guild of client.guilds.cache.values()) {
                const member = await guild.members.fetch(userId).catch(() => null);
                if (member) {
                    const result = await updateMemberRank(member, entry.steamId, users);
                    if (!result.error) {
                        memberUpdated = true;
                    }
                }
            }
            if (memberUpdated) {
                updated++;
            } else {
                failed++;
            }
            await new Promise(r => setTimeout(r, INTERVALS.RANK_UPDATE_DELAY_MS));
        }

        return {
            alreadyRunning: false,
            total: entries.length,
            updated,
            failed
        };
    } finally {
        isBulkUpdating = false;
    }
}

module.exports = {
    getRankForElo,
    removeRankRoles,
    updateMemberRank,
    updateAllMemberRanks
};
