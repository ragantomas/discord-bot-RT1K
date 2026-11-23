const { OWNER_ID, DB_FILE, SETTINGS_FILE } = require('../config');
const { usersFileExists } = require('../storage/usersStore');
const { settingsFileExists } = require('../storage/settingsStore');

function getExistingBackupFiles() {
    const files = [];
    if (usersFileExists()) {
        files.push({ attachment: DB_FILE, name: 'users.json' });
    }
    if (settingsFileExists()) {
        files.push({ attachment: SETTINGS_FILE, name: 'settings.json' });
    }
    return files;
}

function hasAnyBackupFile() {
    return getExistingBackupFiles().length > 0;
}

async function sendBackupToUser(user, label = 'Manuálna záloha') {
    const files = getExistingBackupFiles();
    if (files.length === 0) return false;

    await user.send({
        content: `📦 ${label} — ${new Date().toLocaleString('sk-SK')}:`,
        files
    });
    return true;
}

async function sendBackupToOwner(client, label = 'Automatická denná záloha') {
    if (!hasAnyBackupFile()) return false;
    const owner = await client.users.fetch(OWNER_ID);
    return sendBackupToUser(owner, label);
}

module.exports = {
    hasAnyBackupFile,
    sendBackupToUser,
    sendBackupToOwner
};
