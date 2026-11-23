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
        const tvMatchesTrigger = (current.tempVoice?.setups || []).some(s => s.triggerChannelId === channel.id);
        const tvMatchesCategory = (current.tempVoice?.setups || []).some(s => s.categoryId === channel.id);
        const pbMatches = (current.patchBot?.channelIds || []).includes(channel.id);

        const needsUpdate =
            current.allowedChannelId === channel.id ||
            tvMatchesTrigger ||
            tvMatchesCategory ||
            pbMatches ||
            current.csStatus?.channelId === channel.id ||
            current.rankFeed?.channelId === channel.id ||
            current.adminLog?.channelId === channel.id;

        if (!needsUpdate) return;

        updateSettings(settings => {
            if (settings.allowedChannelId === channel.id) {
                settings.allowedChannelId = null;
                console.warn('Povolený kanál pre príkazy bota bol zmazaný a resetovaný na všetky kanály.');
            }

            if (Array.isArray(settings.tempVoice?.setups)) {
                for (const setup of settings.tempVoice.setups) {
                    if (setup.triggerChannelId === channel.id) {
                        setup.triggerChannelId = null;
                        setup.enabled = false;
                        console.warn(`Spúšťací TempVoice kanál (${setup.id}) bol zmazaný.`);
                    }
                    if (setup.categoryId === channel.id) {
                        setup.categoryId = null;
                        console.warn(`Kategória pre TempVoice (${setup.id}) bola zmazaná.`);
                    }
                }
            }

            if (Array.isArray(settings.patchBot?.channelIds) && settings.patchBot.channelIds.includes(channel.id)) {
                settings.patchBot.channelIds = settings.patchBot.channelIds.filter(id => id !== channel.id);
                if (settings.patchBot.channelIds.length === 0) {
                    settings.patchBot.enabled = false;
                }
                console.warn(`Kanál pre CS2 PatchBota (${channel.id}) bol zmazaný.`);
            }

            if (settings.csStatus.channelId === channel.id) {
                settings.csStatus.channelId = null;
                settings.csStatus.messageId = null;
                settings.csStatus.enabled = false;
                console.warn('Kanál pre CS2/Steam stav serverov bol zmazaný.');
            }

            if (settings.rankFeed.channelId === channel.id) {
                settings.rankFeed.channelId = null;
                settings.rankFeed.enabled = false;
                console.warn('Kanál pre Rank-Up / Derank oznámenia bol zmazaný.');
            }

            if (settings.adminLog.channelId === channel.id) {
                settings.adminLog.channelId = null;
                settings.adminLog.enabled = false;
                console.warn('Kanál pre Admin Log bol zmazaný.');
            }
        });
    }
};
