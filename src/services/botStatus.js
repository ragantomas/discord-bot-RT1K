const { ActivityType } = require('discord.js');
const { loadUsers } = require('../storage/usersStore');

function updateBotStatus(client) {
    if (!client.user) return;
    const count = Object.keys(loadUsers()).length;
    const text = count === 1 ? '1 CS2 hráča' : `${count} CS2 hráčov`;
    client.user.setActivity({
        name: 'custom',
        type: ActivityType.Custom,
        state: `Sleduje ${text}`
    });
}

module.exports = { updateBotStatus };
