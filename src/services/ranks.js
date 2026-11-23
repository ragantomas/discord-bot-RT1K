const { RANK_ROLES, UNRANKED_ROLE_ID, ALL_RANK_ROLE_IDS } = require('../config');
const { fetchLeetifyProfile } = require('./leetify');
const { saveUsers } = require('../storage/usersStore');

function getRankForElo(elo) {
    if (typeof elo !== 'number' || elo < 1000) return null;
    return RANK_ROLES.find(r => elo >= r.min) ?? null;
}

async function removeRankRoles(member) {
    const rolesToRemove = member.roles.cache.filter(r => ALL_RANK_ROLE_IDS.includes(r.id));
    if (rolesToRemove.size > 0) {
        await member.roles.remove(rolesToRemove).catch(console.error);
    }
}

async function updateMemberRank(member, steam64Id, users = null) {
    try {
        const data = await fetchLeetifyProfile(steam64Id);
        if (!data) return { error: 'Profil sa nenašiel na Leetify.' };

        const premierElo = data?.ranks?.premier;

        let targetRoleId = UNRANKED_ROLE_ID;
        let isUnranked = true;

        const targetRole = getRankForElo(premierElo);
        if (targetRole) {
            targetRoleId = targetRole.roleId;
            isUnranked = false;
        }

        const rolesToRemove = member.roles.cache.filter(
            r => ALL_RANK_ROLE_IDS.includes(r.id) && r.id !== targetRoleId
        );

        if (rolesToRemove.size > 0) await member.roles.remove(rolesToRemove);
        if (!member.roles.cache.has(targetRoleId)) await member.roles.add(targetRoleId);

        const finalElo = isUnranked ? null : premierElo;

        // Uloží aktuálne Elo pre /leaderboard
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

module.exports = {
    getRankForElo,
    removeRankRoles,
    updateMemberRank
};
