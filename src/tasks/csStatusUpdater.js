const { INTERVALS } = require('../config');
const { updateDueStatusMessages } = require('../services/csStatus');

function startCsStatusUpdater(client) {
    let isChecking = false;

    return setInterval(async () => {
        if (isChecking) return;
        isChecking = true;

        try {
            await updateDueStatusMessages(client);
        } catch (err) {
            console.error('Chyba pri aktualizácii CS2/Steam stavu serverov:', err);
        } finally {
            isChecking = false;
        }
    }, INTERVALS.CS_STATUS_TICK_MS);
}

module.exports = { startCsStatusUpdater };
