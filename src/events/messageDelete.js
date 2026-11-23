const { Events } = require('discord.js');
const {
    getAnnouncementsHistory,
    removeAnnouncementHistory
} = require('../storage/settingsStore');

module.exports = {
    name: Events.MessageDelete,
    execute(message) {
        if (!message?.id) return;

        const existsInHistory = getAnnouncementsHistory().some(
            item => item.messageId === message.id
        );
        if (!existsInHistory) return;

        removeAnnouncementHistory(message.channelId, message.id);
    }
};
