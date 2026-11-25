const { Events } = require('discord.js');
const { logChannelUpdate } = require('../services/adminLog');

module.exports = {
    name: Events.ChannelUpdate,
    async execute(oldChannel, newChannel) {
        await logChannelUpdate(oldChannel, newChannel).catch(console.error);
    }
};
