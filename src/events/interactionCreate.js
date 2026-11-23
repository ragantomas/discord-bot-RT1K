const { Events, PermissionFlagsBits } = require('discord.js');
const { handleTempVoiceInteraction } = require('../services/tempVoicePanel');
const { handleCsStatusInteraction } = require('../services/csStatus');

async function sendInteractionError(interaction, message) {
    const errorPayload = { content: message, ephemeral: true };

    if (interaction.deferred) {
        await interaction.editReply({ content: errorPayload.content }).catch(() => null);
    } else if (interaction.replied) {
        await interaction.followUp(errorPayload).catch(() => null);
    } else {
        await interaction.reply(errorPayload).catch(() => null);
    }
}

module.exports = {
    name: Events.InteractionCreate,
    async execute(interaction) {
        if (interaction.isButton() || interaction.isModalSubmit() || interaction.isUserSelectMenu()) {
            if (interaction.customId.startsWith('tv:')) {
                try {
                    await handleTempVoiceInteraction(interaction);
                } catch (err) {
                    console.error(`Chyba pri TempVoice interakcii (${interaction.customId}):`, err);
                    await sendInteractionError(interaction, 'Pri vykonávaní akcie nastala neočakávaná chyba.');
                }
            } else if (interaction.isButton() && interaction.customId.startsWith('csstatus:')) {
                try {
                    await handleCsStatusInteraction(interaction);
                } catch (err) {
                    console.error(`Chyba pri CS Status interakcii (${interaction.customId}):`, err);
                    await sendInteractionError(interaction, 'Pri obnovovaní stavu serverov nastala neočakávaná chyba.');
                }
            }
            return;
        }

        if (!interaction.isChatInputCommand()) return;

        const command = interaction.client.commands.get(interaction.commandName);
        if (!command) return;

        if (command.adminOnly && !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({
                content: 'Tento príkaz môže použiť len administrátor.',
                ephemeral: true
            });
        }

        try {
            await command.execute(interaction);
        } catch (err) {
            console.error(`Chyba pri príkaze /${interaction.commandName}:`, err);
            await sendInteractionError(interaction, 'Pri vykonávaní príkazu nastala neočakávaná chyba.');
        }
    }
};
