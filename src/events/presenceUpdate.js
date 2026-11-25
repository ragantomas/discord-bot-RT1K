const { Events } = require('discord.js');
const { isPlayingCs2Presence, notifyPlayerDiscordCs2State } = require('../tasks/rankUpdater');

module.exports = {
    name: Events.PresenceUpdate,
    execute(oldPresence, newPresence) {
        const userId = newPresence?.userId || oldPresence?.userId;
        if (!userId) return;
        if (newPresence?.user?.bot || oldPresence?.user?.bot) return;

        const wasPlaying = isPlayingCs2Presence(oldPresence);
        const isPlaying = isPlayingCs2Presence(newPresence);
        if (wasPlaying === isPlaying) return;

        notifyPlayerDiscordCs2State(userId, isPlaying);
    }
};
