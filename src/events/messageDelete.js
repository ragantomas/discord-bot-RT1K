const { Events } = require('discord.js');
const {
    getAnnouncementsHistory,
    removeAnnouncementHistory
} = require('../storage/settingsStore');
const { logMessageDelete } = require('../services/adminLog');

module.exports = {
    name: Events.MessageDelete,
    async execute(message) {
        if (!message?.id) return;

        const existsInHistory = getAnnouncementsHistory().some(
            item => item.messageId === message.id
        );
        if (existsInHistory) {
            removeAnnouncementHistory(message.channelId, message.id);
        }

        await logMessageDelete(message).catch(console.error);
    }
};
