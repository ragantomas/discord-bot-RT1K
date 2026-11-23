const { startRankUpdater } = require('./rankUpdater');
const { startPatchWatcher } = require('./patchWatcher');
const { startCsStatusUpdater } = require('./csStatusUpdater');

function startScheduledTasks(client) {
    startRankUpdater(client);
    startPatchWatcher(client);
    startCsStatusUpdater(client);
}

module.exports = { startScheduledTasks };
