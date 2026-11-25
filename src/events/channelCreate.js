const { Events } = require('discord.js');
const { logChannelCreate } = require('../services/adminLog');

module.exports = {
    name: Events.ChannelCreate,
    async execute(channel) {
        await logChannelCreate(channel).catch(console.error);
    }
};
