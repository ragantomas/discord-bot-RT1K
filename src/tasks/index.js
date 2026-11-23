const { startRankUpdater } = require('./rankUpdater');
const { startDailyBackup } = require('./dailyBackup');

function startScheduledTasks(client) {
    startRankUpdater(client);
    startDailyBackup(client);
}

module.exports = { startScheduledTasks };
