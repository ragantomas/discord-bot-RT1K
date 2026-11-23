const { INTERVALS } = require('../config');
const { checkAndPostUpdates } = require('../services/patchBot');

function startPatchWatcher(client) {
    let isChecking = false;

    return setInterval(async () => {
        if (isChecking) return;
        isChecking = true;

        try {
            await checkAndPostUpdates(client);
        } catch (err) {
            console.error('Chyba pri automatickej kontrole CS2 updatov:', err);
        } finally {
            isChecking = false;
        }
    }, INTERVALS.PATCH_CHECK_MS);
}

module.exports = { startPatchWatcher };
