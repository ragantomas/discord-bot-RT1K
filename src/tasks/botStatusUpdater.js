const { updateBotStatus } = require('../services/botStatus');

const BOT_STATUS_TICK_MS = 60 * 1000;

function startBotStatusUpdater(client) {
    return setInterval(() => {
        try {
            updateBotStatus(client);
        } catch (err) {
            console.error('Chyba pri aktualizácii statusu bota:', err);
        }
    }, BOT_STATUS_TICK_MS);
}

module.exports = { startBotStatusUpdater };
