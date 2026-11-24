const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { issueWarning } = require('../../services/moderation');

module.exports = {
    adminOnly: true,
    modModuleKey: 'warn',
    data: new SlashCommandBuilder()
        .setName('warn')
        .setDescription('Udelí varovanie hráčovi')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .setDMPermission(false)
        .addUserOption(opt =>
            opt.setName('hrac').setDescription('Hráč na serveri').setRequired(true)
        )
        .addStringOption(opt =>
            opt.setName('dovod').setDescription('Dôvod varovania').setRequired(true).setMaxLength(400)
        ),

    async execute(interaction) {
        const targetUser = interaction.options.getUser('hrac', true);
        const reason = interaction.options.getString('dovod', true);
        const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

        if (targetUser.bot) {
            return interaction.reply({ content: 'Bota nie je možné varovať.', ephemeral: true });
        }

        const res = await issueWarning({
            guild: interaction.guild,
            targetUser,
            targetMember,
            moderatorId: interaction.user.id,
            moderatorTag: interaction.user.tag,
            actorMember: interaction.member,
            reason
        });

        if (!res.ok) {
            return interaction.reply({ content: res.error, ephemeral: true });
        }

        const embed = new EmbedBuilder()
            .setTitle(`⚠️ Varovanie #${res.warning.id}`)
            .setColor(0xF5A623)
            .addFields(
                { name: 'Hráč', value: `<@${targetUser.id}>`, inline: true },
                { name: 'Celkom', value: String(res.total), inline: true },
                { name: 'Dôvod', value: res.warning.reason, inline: false }
            )
            .setTimestamp();

        if (res.escalation) {
            const escText = res.escalation.action === 'timeout'
                ? `Automatický timeout (${res.escalation.durationMinutes} min)`
                : res.escalation.action === 'kick'
                    ? 'Automatický kick'
                    : 'Automatický ban';
            embed.addFields({ name: 'Auto-eskalácia', value: escText, inline: false });
        }

        return interaction.reply({ embeds: [embed] });
    }
};
