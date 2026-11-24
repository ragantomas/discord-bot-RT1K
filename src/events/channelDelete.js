const { Events } = require('discord.js');
const {
    loadSettings,
    updateSettings,
    getTempRoom,
    deleteTempRoom,
    getOpenTicket,
    deleteOpenTicket
} = require('../storage/settingsStore');

module.exports = {
    name: Events.ChannelDelete,
    execute(channel) {
        if (getTempRoom(channel.id)) {
            deleteTempRoom(channel.id);
        }
        if (getOpenTicket(channel.id)) {
            deleteOpenTicket(channel.id);
        }

        if (!channel.guildId) return;

        const current = loadSettings();
        const tvMatchesTrigger = (current.tempVoice?.setups || []).some(s => s.triggerChannelId === channel.id);
        const tvMatchesCategory = (current.tempVoice?.setups || []).some(s => s.categoryId === channel.id);
        const pbMatches = (current.patchBot?.channelIds || []).includes(channel.id);
        const annMatches = (current.announcementsHistory || []).some(item => item.channelId === channel.id);

        const needsUpdate =
            current.allowedChannelId === channel.id ||
            tvMatchesTrigger ||
            tvMatchesCategory ||
            pbMatches ||
            annMatches ||
            current.csStatus?.channelId === channel.id ||
            current.rankFeed?.channelId === channel.id ||
            current.adminLog?.channelId === channel.id ||
            current.welcome?.channelId === channel.id ||
            current.welcome?.goodbyeChannelId === channel.id ||
            current.tickets?.categoryId === channel.id ||
            current.tickets?.logChannelId === channel.id ||
            current.tickets?.panelChannelId === channel.id;

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

            if (settings.welcome?.channelId === channel.id) {
                settings.welcome.channelId = null;
                settings.welcome.channelEnabled = false;
                console.warn('Kanál pre uvítacie správy bol zmazaný.');
            }

            if (settings.welcome?.goodbyeChannelId === channel.id) {
                settings.welcome.goodbyeChannelId = null;
                settings.welcome.goodbyeEnabled = false;
                console.warn('Kanál pre rozlúčkové správy bol zmazaný.');
            }

            if (settings.tickets?.categoryId === channel.id) {
                settings.tickets.categoryId = null;
                console.warn('Kategória pre tickety bola zmazaná.');
            }

            if (settings.tickets?.logChannelId === channel.id) {
                settings.tickets.logChannelId = null;
                console.warn('Kanál pre transcript logy ticketov bol zmazaný.');
            }

            if (settings.tickets?.panelChannelId === channel.id) {
                settings.tickets.panelChannelId = null;
                settings.tickets.panelMessageId = null;
                console.warn('Kanál pre Ticket panel bol zmazaný.');
            }

            if (Array.isArray(settings.announcementsHistory) && settings.announcementsHistory.some(item => item.channelId === channel.id)) {
                settings.announcementsHistory = settings.announcementsHistory.filter(item => item.channelId !== channel.id);
            }
        });
    }
};
