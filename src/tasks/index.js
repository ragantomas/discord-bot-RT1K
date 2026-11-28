const { startRankUpdater } = require('./rankUpdater');
const { startPatchWatcher } = require('./patchWatcher');
const { startCsStatusUpdater } = require('./csStatusUpdater');
const { startBotStatusUpdater } = require('./botStatusUpdater');
const { startTempBanWatcher } = require('./tempBanWatcher');
const { startMemoryMonitor } = require('../services/botLogger');

function startScheduledTasks(client) {
    startRankUpdater(client);
    startPatchWatcher(client);
    startCsStatusUpdater(client);
    startBotStatusUpdater(client);
    startTempBanWatcher(client);
    startMemoryMonitor(client);
}

module.exports = { startScheduledTasks };
