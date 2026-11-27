const { processExpiredTempBans } = require('../services/moderation');

const CHECK_INTERVAL_MS = 30 * 1000;

function startTempBanWatcher(client) {
    let isChecking = false;

    const runCheck = async () => {
        if (isChecking) return;
        isChecking = true;
        try {
            await processExpiredTempBans(client);
        } catch (err) {
            console.error('Chyba pri kontrole dočasných banov:', err);
        } finally {
            isChecking = false;
        }
    };

    const initialTimer = setTimeout(() => {
        void runCheck();
    }, 10000);
    if (typeof initialTimer.unref === 'function') {
        initialTimer.unref();
    }

    const timer = setInterval(() => {
        void runCheck();
    }, CHECK_INTERVAL_MS);
    if (typeof timer.unref === 'function') {
        timer.unref();
    }

    return timer;
}

module.exports = { startTempBanWatcher };
