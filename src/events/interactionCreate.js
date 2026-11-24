const { Events } = require('discord.js');
const { handleTempVoiceInteraction } = require('../services/tempVoicePanel');
const { handleTicketInteraction } = require('../services/tickets');
const { isModerationCommandEnabled, hasModerationAccess } = require('../services/moderation');
const { loadSettings } = require('../storage/settingsStore');

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
            } else if (interaction.customId.startsWith('ticket:')) {
                try {
                    await handleTicketInteraction(interaction);
                } catch (err) {
                    console.error(`Chyba pri Ticket interakcii (${interaction.customId}):`, err);
                    await sendInteractionError(interaction, 'Pri spracovaní ticketu nastala neočakávaná chyba.');
                }
            }
            return;
        }

        if (!interaction.isChatInputCommand()) return;

        const command = interaction.client.commands.get(interaction.commandName);
        if (!command) return;

        if (command.adminOnly) {
            if (!isModerationCommandEnabled(command.modModuleKey)) {
                return interaction.reply({
                    content: 'Tento príkaz je vypnutý.',
                    ephemeral: true
                });
            }
            if (!hasModerationAccess(interaction.member)) {
                return interaction.reply({
                    content: 'Na tento príkaz nemáš oprávnenie.',
                    ephemeral: true
                });
            }
        } else {
            const { allowedChannelId, allowedChannelBypassRoleIds = [] } = loadSettings();
            if (allowedChannelId && interaction.channelId !== allowedChannelId) {
                const memberRoles = interaction.member?.roles;
                const hasBypassRole = Array.isArray(allowedChannelBypassRoleIds) && allowedChannelBypassRoleIds.length > 0 && (
                    memberRoles?.cache
                        ? allowedChannelBypassRoleIds.some(roleId => memberRoles.cache.has(roleId))
                        : Array.isArray(memberRoles) && allowedChannelBypassRoleIds.some(roleId => memberRoles.includes(roleId))
                );
                if (!hasBypassRole) {
                    return interaction.reply({
                        content: `Príkazy bota je možné používať iba v kanáli <#${allowedChannelId}>.`,
                        ephemeral: true
                    });
                }
            }
        }

        try {
            await command.execute(interaction);
        } catch (err) {
            console.error(`Chyba pri príkaze /${interaction.commandName}:`, err);
            await sendInteractionError(interaction, 'Pri vykonávaní príkazu nastala neočakávaná chyba.');
        }
    }
};
