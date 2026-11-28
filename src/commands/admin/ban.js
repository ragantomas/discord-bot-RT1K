const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, MessageFlags } = require('discord.js');
const { banMember, parseDurationMinutes, MAX_TEMPBAN_MINUTES } = require('../../services/moderation');

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
        .addStringOption(opt =>
            opt.setName('trvanie').setDescription('Dočasný ban (napr. 30m, 6h, 7d — prázdne = trvalý)').setRequired(false).setMaxLength(32)
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
        const rawDuration = interaction.options.getString('trvanie');
        const deleteMessageSeconds = interaction.options.getInteger('zmazat_spravy') ?? 0;

        let durationMinutes = null;
        if (rawDuration) {
            durationMinutes = parseDurationMinutes(rawDuration);
            if (!durationMinutes || durationMinutes > MAX_TEMPBAN_MINUTES) {
                return interaction.reply({
                    content: 'Neplatné trvanie banu. Použi formát napr. `30m`, `6h` alebo `7d` (max 365 dní).',
                    flags: MessageFlags.Ephemeral
                });
            }
        }

        const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

        const res = await banMember({
            guild: interaction.guild,
            targetUser,
            targetMember,
            deleteMessageSeconds,
            durationMinutes,
            reason,
            moderatorId: interaction.user.id,
            moderatorTag: interaction.user.tag,
            actorMember: interaction.member
        });

        if (!res.ok) {
            return interaction.reply({ content: res.error, flags: MessageFlags.Ephemeral });
        }

        const embed = new EmbedBuilder()
            .setTitle(`${res.expiresAt ? '⏳ Používateľ dostal dočasný ban' : '🔨 Používateľ dostal ban'} · Case #${res.caseId}`)
            .setColor(0xED4245)
            .addFields(
                { name: 'Používateľ', value: `<@${targetUser.id}>`, inline: true },
                ...(res.durationLabel ? [{ name: 'Trvanie', value: res.durationLabel, inline: true }] : []),
                ...(res.expiresAt ? [{ name: 'Vyprší', value: `<t:${Math.floor(res.expiresAt / 1000)}:R>`, inline: true }] : []),
                { name: 'Dôvod', value: reason, inline: false }
            )
            .setTimestamp();

        return interaction.reply({ embeds: [embed] });
    }
};
