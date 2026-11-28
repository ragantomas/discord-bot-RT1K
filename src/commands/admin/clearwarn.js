const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { removeWarning, clearAllWarnings } = require('../../services/moderation');

module.exports = {
    adminOnly: true,
    modModuleKey: 'warn',
    data: new SlashCommandBuilder()
        .setName('clearwarn')
        .setDescription('Zmaže jedno alebo všetky varovania hráča')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .setDMPermission(false)
        .addUserOption(opt =>
            opt.setName('hrac').setDescription('Hráč na serveri').setRequired(true)
        )
        .addIntegerOption(opt =>
            opt.setName('id').setDescription('ID varovania').setRequired(false).setMinValue(1)
        ),

    async execute(interaction) {
        const targetUser = interaction.options.getUser('hrac', true);
        const warningId = interaction.options.getInteger('id');

        if (warningId !== null) {
            const res = await removeWarning({
                guild: interaction.guild,
                targetUserId: targetUser.id,
                targetLabel: targetUser.tag,
                warningId,
                moderatorId: interaction.user.id,
                moderatorTag: interaction.user.tag
            });
            if (!res.ok) {
                return interaction.reply({ content: res.error, flags: MessageFlags.Ephemeral });
            }
            return interaction.reply({
                content: `Varovanie **#${warningId}** pre <@${targetUser.id}> bolo zmazané. Zostáva: ${res.remaining}.`,
                flags: MessageFlags.Ephemeral
            });
        }

        const res = await clearAllWarnings({
            guild: interaction.guild,
            targetUserId: targetUser.id,
            targetLabel: targetUser.tag,
            moderatorId: interaction.user.id,
            moderatorTag: interaction.user.tag
        });
        if (!res.ok) {
            return interaction.reply({ content: res.error, flags: MessageFlags.Ephemeral });
        }

        return interaction.reply({
            content: `Vymazané všetky varovania pre <@${targetUser.id}> (${res.removedCount}).`,
            flags: MessageFlags.Ephemeral
        });
    }
};
