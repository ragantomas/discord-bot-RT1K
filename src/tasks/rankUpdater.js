const { INTERVALS } = require('../config');
const { updateAllMemberRanks } = require('../services/ranks');

function startRankUpdater(client) {
    // Automatický update všetkých hráčov každú 1 hodinu
    return setInterval(async () => {
        await updateAllMemberRanks(client).catch(err => {
            console.error('Chyba pri automatickej aktualizácii rankov:', err);
        });
    }, INTERVALS.RANK_UPDATE_MS);
}

module.exports = { startRankUpdater };
