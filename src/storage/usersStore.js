const fs = require('fs');
const { DB_FILE } = require('../config');

function loadUsers() {
    if (!fs.existsSync(DB_FILE)) return {};
    const raw = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    // Automatická konverzia zo starého formátu ("id": "7656...") na objekt
    for (const [id, val] of Object.entries(raw)) {
        if (typeof val === 'string') {
            raw[id] = { steamId: val, elo: null };
        }
    }
    return raw;
}

function saveUsers(users) {
    fs.writeFileSync(DB_FILE, JSON.stringify(users, null, 2));
}

function usersFileExists() {
    return fs.existsSync(DB_FILE);
}

module.exports = {
    loadUsers,
    saveUsers,
    usersFileExists
};
