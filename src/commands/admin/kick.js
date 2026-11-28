const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, MessageFlags } = require('discord.js');
const { kickMember } = require('../../services/moderation');

module.exports = {
    adminOnly: true,
    modModuleKey: 'kick',
    data: new SlashCommandBuilder()
        .setName('kick')
        .setDescription('Vyhodí hráča zo servera')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .setDMPermission(false)
        .addUserOption(opt =>
            opt.setName('hrac').setDescription('Hráč na serveri').setRequired(true)
        )
        .addStringOption(opt =>
            opt.setName('dovod').setDescription('Dôvod vyhodenia').setRequired(false).setMaxLength(400)
        ),

    async execute(interaction) {
        const targetUser = interaction.options.getUser('hrac', true);
        const reason = interaction.options.getString('dovod') || 'Bez dôvodu';
        const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

        if (!targetMember) {
            return interaction.reply({ content: 'Hráč sa nenachádza na serveri.', flags: MessageFlags.Ephemeral });
        }

        const res = await kickMember({
            guild: interaction.guild,
            targetMember,
            reason,
            moderatorId: interaction.user.id,
            moderatorTag: interaction.user.tag,
            actorMember: interaction.member
        });

        if (!res.ok) {
            return interaction.reply({ content: res.error, flags: MessageFlags.Ephemeral });
        }

        const embed = new EmbedBuilder()
            .setTitle('👢 Hráč bol vyhodený')
            .setColor(0xF5A623)
            .addFields(
                { name: 'Hráč', value: `<@${targetUser.id}>`, inline: true },
                { name: 'Dôvod', value: reason, inline: false }
            )
            .setTimestamp();

        return interaction.reply({ embeds: [embed] });
    }
};
