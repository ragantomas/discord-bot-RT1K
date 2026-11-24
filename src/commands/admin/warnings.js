const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { getUserWarnings } = require('../../storage/warningsStore');

module.exports = {
    adminOnly: true,
    modModuleKey: 'warn',
    data: new SlashCommandBuilder()
        .setName('warnings')
        .setDescription('Zobrazí varovania hráča')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .setDMPermission(false)
        .addUserOption(opt =>
            opt.setName('hrac').setDescription('Hráč na serveri').setRequired(true)
        ),

    async execute(interaction) {
        const targetUser = interaction.options.getUser('hrac', true);
        const list = getUserWarnings(targetUser.id);

        if (list.length === 0) {
            return interaction.reply({
                content: `<@${targetUser.id}> nemá žiadne varovania.`,
                ephemeral: true
            });
        }

        const lines = list.slice(-15).reverse().map(w => {
            const ts = Math.floor(w.createdAt / 1000);
            return `**#${w.id}** • <t:${ts}:d> • ${w.moderatorTag}\n${w.reason}`;
        });

        const embed = new EmbedBuilder()
            .setTitle(`⚠️ Varovania — ${targetUser.username}`)
            .setColor(0xF5A623)
            .setThumbnail(targetUser.displayAvatarURL({ size: 128 }))
            .setDescription(lines.join('\n\n').slice(0, 4000))
            .setFooter({ text: `Celkom: ${list.length}` })
            .setTimestamp();

        return interaction.reply({ embeds: [embed], ephemeral: true });
    }
};
