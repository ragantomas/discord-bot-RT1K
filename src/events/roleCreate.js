const { Events } = require('discord.js');
const { logRoleCreate } = require('../services/adminLog');

module.exports = {
    name: Events.GuildRoleCreate,
    async execute(role) {
        await logRoleCreate(role).catch(console.error);
    }
};
