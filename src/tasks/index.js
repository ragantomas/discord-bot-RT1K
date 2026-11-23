const { startRankUpdater } = require('./rankUpdater');
const { startPatchWatcher } = require('./patchWatcher');
const { startCsStatusUpdater } = require('./csStatusUpdater');
const { startBotStatusUpdater } = require('./botStatusUpdater');

function startScheduledTasks(client) {
    startRankUpdater(client);
    startPatchWatcher(client);
    startCsStatusUpdater(client);
    startBotStatusUpdater(client);
}

module.exports = { startScheduledTasks };
