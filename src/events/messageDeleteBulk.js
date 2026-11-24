const { Events } = require('discord.js');
const {
    getAnnouncementsHistory,
    removeAnnouncementsByIds
} = require('../storage/settingsStore');

module.exports = {
    name: Events.MessageBulkDelete,
    execute(messages) {
        if (!messages || typeof messages.keys !== 'function') return;

        const ids = [...messages.keys()];
        if (ids.length === 0) return;

        const history = getAnnouncementsHistory();
        if (history.length === 0) return;

        const idSet = new Set(ids);
        if (history.some(item => idSet.has(item.messageId))) {
            removeAnnouncementsByIds(ids);
        }
    }
};
