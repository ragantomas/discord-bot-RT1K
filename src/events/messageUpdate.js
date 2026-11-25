const { Events } = require('discord.js');
const { logMessageUpdate } = require('../services/adminLog');

module.exports = {
    name: Events.MessageUpdate,
    async execute(oldMessage, newMessage) {
        await logMessageUpdate(oldMessage, newMessage).catch(console.error);
    }
};
