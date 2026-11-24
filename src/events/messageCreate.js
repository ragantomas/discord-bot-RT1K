const { Events } = require('discord.js');
const { recordMessageActivity } = require('../services/playerActivity');

module.exports = {
    name: Events.MessageCreate,
    execute(message) {
        if (!message?.guild || message.author?.bot) return;
        recordMessageActivity(message);
    }
};
