const { Events } = require('discord.js');
const {
    loadSettings,
    updateSettings,
    getTempRoom,
    deleteTempRoom
} = require('../storage/settingsStore');

module.exports = {
    name: Events.ChannelDelete,
    execute(channel) {
        if (getTempRoom(channel.id)) {
            deleteTempRoom(channel.id);
        }

        if (!channel.guildId) return;

        const current = loadSettings();
        const needsUpdate =
            current.allowedChannelId === channel.id ||
            current.tempVoice?.triggerChannelId === channel.id ||
            current.tempVoice?.categoryId === channel.id ||
            current.patchBot?.channelId === channel.id ||
            current.csStatus?.channelId === channel.id;

        if (!needsUpdate) return;

        updateSettings(settings => {
            if (settings.allowedChannelId === channel.id) {
                settings.allowedChannelId = null;
                console.warn('Povolený kanál pre príkazy bota bol zmazaný a resetovaný na všetky kanály.');
            }
            if (settings.tempVoice.triggerChannelId === channel.id) {
                settings.tempVoice.triggerChannelId = null;
                settings.tempVoice.enabled = false;
                console.warn('Spúšťací TempVoice kanál bol zmazaný.');
            }
            if (settings.tempVoice.categoryId === channel.id) {
                settings.tempVoice.categoryId = null;
                console.warn('Kategória pre TempVoice bola zmazaná.');
            }
            if (settings.patchBot.channelId === channel.id) {
                settings.patchBot.channelId = null;
                settings.patchBot.enabled = false;
                console.warn('Kanál pre CS2 PatchBota bol zmazaný.');
            }
            if (settings.csStatus.channelId === channel.id) {
                settings.csStatus.channelId = null;
                settings.csStatus.messageId = null;
                settings.csStatus.enabled = false;
                console.warn('Kanál pre CS2/Steam stav serverov bol zmazaný.');
            }
        });
    }
};
