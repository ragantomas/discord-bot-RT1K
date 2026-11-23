const { Events } = require('discord.js');
const { getGuildConfig, getTempRoom } = require('../storage/tempVoiceStore');
const { createTempRoom, handleRoomLeave } = require('../services/tempVoice');

module.exports = {
    name: Events.VoiceStateUpdate,
    async execute(oldState, newState) {
        if (oldState.channelId === newState.channelId) return;

        // 1. Najprv skontroluj odchod zo starej TempVoice miestnosti
        if (oldState.channelId && oldState.channel && getTempRoom(oldState.channelId)) {
            await handleRoomLeave(oldState.channel, oldState.member).catch(err => {
                console.error('Chyba pri odchode z TempVoice miestnosti:', err);
            });
        }

        // 2. Potom skontroluj pripojenie do spúšťacieho VC
        if (newState.channelId && newState.member && !newState.member.user.bot) {
            const guildConfig = getGuildConfig(newState.guild.id);
            if (guildConfig?.triggerChannelId && guildConfig.triggerChannelId === newState.channelId) {
                await createTempRoom(newState.member, guildConfig).catch(err => {
                    console.error('Chyba pri vytváraní TempVoice miestnosti:', err);
                });
            }
        }
    }
};
