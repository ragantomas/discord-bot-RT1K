const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { banMember } = require('../../services/moderation');

module.exports = {
    adminOnly: true,
    modModuleKey: 'ban',
    data: new SlashCommandBuilder()
        .setName('ban')
        .setDescription('Zabanuje používateľa zo servera')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .setDMPermission(false)
        .addUserOption(opt =>
            opt.setName('pouzivatel').setDescription('Používateľ').setRequired(true)
        )
        .addStringOption(opt =>
            opt.setName('dovod').setDescription('Dôvod banu').setRequired(false).setMaxLength(400)
        )
        .addIntegerOption(opt =>
            opt.setName('zmazat_spravy')
                .setDescription('Zmazať nedávne správy')
                .setRequired(false)
                .addChoices(
                    { name: 'Nemazať', value: 0 },
                    { name: 'Posledná hodina', value: 3600 },
                    { name: 'Posledných 24 hodín', value: 86400 },
                    { name: 'Posledných 7 dní', value: 604800 }
                )
        ),

    async execute(interaction) {
        const targetUser = interaction.options.getUser('pouzivatel', true);
        const reason = interaction.options.getString('dovod') || 'Bez dôvodu';
        const deleteMessageSeconds = interaction.options.getInteger('zmazat_spravy') ?? 0;
        const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

        const res = await banMember({
            guild: interaction.guild,
            targetUser,
            targetMember,
            deleteMessageSeconds,
            reason,
            moderatorId: interaction.user.id,
            moderatorTag: interaction.user.tag,
            actorMember: interaction.member
        });

        if (!res.ok) {
            return interaction.reply({ content: res.error, ephemeral: true });
        }

        const embed = new EmbedBuilder()
            .setTitle('🔨 Používateľ dostal ban')
            .setColor(0xED4245)
            .addFields(
                { name: 'Používateľ', value: `<@${targetUser.id}>`, inline: true },
                { name: 'Dôvod', value: reason, inline: false }
            )
            .setTimestamp();

        return interaction.reply({ embeds: [embed] });
    }
};
