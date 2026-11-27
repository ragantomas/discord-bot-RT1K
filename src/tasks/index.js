const { startRankUpdater } = require('./rankUpdater');
const { startPatchWatcher } = require('./patchWatcher');
const { startCsStatusUpdater } = require('./csStatusUpdater');
const { startBotStatusUpdater } = require('./botStatusUpdater');
const { startTempBanWatcher } = require('./tempBanWatcher');

function startScheduledTasks(client) {
    startRankUpdater(client);
    startPatchWatcher(client);
    startCsStatusUpdater(client);
    startBotStatusUpdater(client);
    startTempBanWatcher(client);
}

module.exports = { startScheduledTasks };
