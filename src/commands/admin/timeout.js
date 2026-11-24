const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { applyTimeout, removeTimeout } = require('../../services/moderation');

module.exports = {
    adminOnly: true,
    modModuleKey: 'timeout',
    data: new SlashCommandBuilder()
        .setName('timeout')
        .setDescription('Udelí alebo zruší timeout hráčovi')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .setDMPermission(false)
        .addUserOption(opt =>
            opt.setName('hrac').setDescription('Hráč na serveri').setRequired(true)
        )
        .addIntegerOption(opt =>
            opt.setName('minuty').setDescription('Dĺžka v minútach, 0 = zrušiť').setRequired(true).setMinValue(0).setMaxValue(40320)
        )
        .addStringOption(opt =>
            opt.setName('dovod').setDescription('Dôvod timeoutu').setRequired(false).setMaxLength(400)
        ),

    async execute(interaction) {
        const targetUser = interaction.options.getUser('hrac', true);
        const minutes = interaction.options.getInteger('minuty', true);
        const reason = interaction.options.getString('dovod') || 'Bez dôvodu';
        const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

        if (!targetMember) {
            return interaction.reply({ content: 'Hráč sa nenachádza na serveri.', ephemeral: true });
        }

        if (minutes === 0) {
            const res = await removeTimeout({
                guild: interaction.guild,
                targetMember,
                reason,
                moderatorId: interaction.user.id,
                moderatorTag: interaction.user.tag,
                actorMember: interaction.member
            });
            if (!res.ok) {
                return interaction.reply({ content: res.error, ephemeral: true });
            }
            return interaction.reply({ content: `Timeout pre <@${targetUser.id}> bol zrušený.` });
        }

        const res = await applyTimeout({
            guild: interaction.guild,
            targetMember,
            durationMinutes: minutes,
            reason,
            moderatorId: interaction.user.id,
            moderatorTag: interaction.user.tag,
            actorMember: interaction.member
        });

        if (!res.ok) {
            return interaction.reply({ content: res.error, ephemeral: true });
        }

        const embed = new EmbedBuilder()
            .setTitle('🔇 Timeout udelený')
            .setColor(0xF5A623)
            .addFields(
                { name: 'Hráč', value: `<@${targetUser.id}>`, inline: true },
                { name: 'Trvanie', value: res.durationLabel, inline: true },
                { name: 'Dôvod', value: reason, inline: false }
            )
            .setTimestamp();

        return interaction.reply({ embeds: [embed] });
    }
};
