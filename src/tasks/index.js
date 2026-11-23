const { startRankUpdater } = require('./rankUpdater');
const { startDailyBackup } = require('./dailyBackup');
const { startPatchWatcher } = require('./patchWatcher');
const { startCsStatusUpdater } = require('./csStatusUpdater');

function startScheduledTasks(client) {
    startRankUpdater(client);
    startDailyBackup(client);
    startPatchWatcher(client);
    startCsStatusUpdater(client);
}

module.exports = { startScheduledTasks };
