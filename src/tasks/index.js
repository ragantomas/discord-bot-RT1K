const { startRankUpdater } = require('./rankUpdater');
const { startDailyBackup } = require('./dailyBackup');
const { startPatchWatcher } = require('./patchWatcher');

function startScheduledTasks(client) {
    startRankUpdater(client);
    startDailyBackup(client);
    startPatchWatcher(client);
}

module.exports = { startScheduledTasks };
