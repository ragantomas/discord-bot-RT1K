const { Events } = require('discord.js');
const { getTempVoiceSettings, getTempRoom } = require('../storage/settingsStore');
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

        // 2. Potom skontroluj pripojenie do niektorého spúšťacieho VC
        if (newState.channelId && newState.member && !newState.member.user.bot) {
            const tvConfig = getTempVoiceSettings();
            if (!tvConfig?.enabled) return;

            const matchingSetup = (tvConfig.setups || []).find(
                setup => setup.enabled && setup.triggerChannelId === newState.channelId
            );

            if (matchingSetup) {
                await createTempRoom(newState.member, matchingSetup).catch(err => {
                    console.error('Chyba pri vytváraní TempVoice miestnosti:', err);
                });
            }
        }
    }
};
