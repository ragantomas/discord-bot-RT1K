const { Events } = require('discord.js');
const { logRoleUpdate } = require('../services/adminLog');

module.exports = {
    name: Events.GuildRoleUpdate,
    async execute(oldRole, newRole) {
        await logRoleUpdate(oldRole, newRole).catch(console.error);
    }
};
