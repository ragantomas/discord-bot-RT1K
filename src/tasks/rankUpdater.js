const { INTERVALS } = require('../config');
const { loadUsers } = require('../storage/usersStore');
const { updateMemberRank } = require('../services/ranks');

function startRankUpdater(client) {
    // Automatický update všetkých hráčov každú 1 hodinu
    return setInterval(async () => {
        const users = loadUsers();
        for (const [userId, entry] of Object.entries(users)) {
            for (const guild of client.guilds.cache.values()) {
                const member = await guild.members.fetch(userId).catch(() => null);
                if (member) await updateMemberRank(member, entry.steamId, users);
            }
            await new Promise(r => setTimeout(r, INTERVALS.RANK_UPDATE_DELAY_MS));
        }
    }, INTERVALS.RANK_UPDATE_MS);
}

module.exports = { startRankUpdater };
