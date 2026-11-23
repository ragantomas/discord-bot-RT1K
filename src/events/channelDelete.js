const { Events } = require('discord.js');
const {
    getGuildConfig,
    setGuildConfig,
    getTempRoom,
    deleteTempRoom
} = require('../storage/tempVoiceStore');
const {
    getPatchGuildConfig,
    setPatchGuildConfig
} = require('../storage/patchBotStore');

module.exports = {
    name: Events.ChannelDelete,
    execute(channel) {
        if (getTempRoom(channel.id)) {
            deleteTempRoom(channel.id);
        }

        if (channel.guildId) {
            const guildConfig = getGuildConfig(channel.guildId);
            if (guildConfig?.triggerChannelId === channel.id) {
                guildConfig.triggerChannelId = null;
                setGuildConfig(channel.guildId, guildConfig);
                console.warn(`Spúšťací TempVoice kanál na serveri ${channel.guildId} bol zmazaný.`);
            }

            const patchConfig = getPatchGuildConfig(channel.guildId);
            if (patchConfig?.channelId === channel.id) {
                patchConfig.channelId = null;
                setPatchGuildConfig(channel.guildId, patchConfig);
                console.warn(`Kanál pre CS2 PatchBota na serveri ${channel.guildId} bol zmazaný.`);
            }
        }
    }
};
