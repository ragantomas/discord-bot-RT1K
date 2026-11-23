const { INTERVALS } = require('../config');
const { sendBackupToOwner } = require('../services/backup');

function startDailyBackup(client) {
    // Automatický denný backup users.json do DM (každých 24 hodín)
    return setInterval(async () => {
        try {
            await sendBackupToOwner(client, 'Automatická denná záloha');
        } catch (err) {
            console.error('Chyba pri automatickom backupe:', err);
        }
    }, INTERVALS.DAILY_BACKUP_MS);
}

module.exports = { startDailyBackup };
