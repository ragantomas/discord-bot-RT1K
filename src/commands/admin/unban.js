const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { unbanUser } = require('../../services/moderation');

module.exports = {
    adminOnly: true,
    modModuleKey: 'ban',
    data: new SlashCommandBuilder()
        .setName('unban')
        .setDescription('Zruší ban používateľovi')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .setDMPermission(false)
        .addStringOption(opt =>
            opt.setName('user_id').setDescription('Discord ID používateľa').setRequired(true)
        )
        .addStringOption(opt =>
            opt.setName('dovod').setDescription('Dôvod unbanu').setRequired(false).setMaxLength(400)
        ),

    async execute(interaction) {
        const userId = interaction.options.getString('user_id', true);
        const reason = interaction.options.getString('dovod') || 'Bez dôvodu';

        const res = await unbanUser({
            guild: interaction.guild,
            userId,
            reason,
            moderatorId: interaction.user.id,
            moderatorTag: interaction.user.tag
        });

        if (!res.ok) {
            return interaction.reply({ content: res.error, ephemeral: true });
        }

        const embed = new EmbedBuilder()
            .setTitle('🕊️ Ban zrušený')
            .setColor(0x57F287)
            .addFields(
                { name: 'Používateľ', value: `${res.targetTag} (${userId.trim()})`, inline: true },
                { name: 'Dôvod', value: reason, inline: false }
            )
            .setTimestamp();

        return interaction.reply({ embeds: [embed] });
    }
};
