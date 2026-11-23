const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { loadUsers, saveUsers } = require('../../storage/usersStore');
const { fetchLeetifyProfile } = require('../../services/leetify');
const { getRankForElo } = require('../../services/ranks');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('stats')
        .setDescription('Zobrazí Leetify štatistiky hráča')
        .addUserOption(opt =>
            opt.setName('hrac').setDescription('Hráč na serveri (nechaj prázdne pre seba)').setRequired(false)
        ),

    async execute(interaction) {
        const users = loadUsers();
        const targetUser = interaction.options.getUser('hrac') || interaction.user;
        const entry = users[targetUser.id];

        if (!entry) {
            return interaction.reply({
                content: targetUser.id === interaction.user.id
                    ? 'Najprv si prepoj účet cez `/link`.'
                    : `<@${targetUser.id}> ešte nemá prepojený Steam účet.`,
                ephemeral: true
            });
        }

        await interaction.deferReply();

        const data = await fetchLeetifyProfile(entry.steamId);
        if (!data) {
            return interaction.editReply('Nepodarilo sa načítať štatistiky z Leetify.');
        }

        const premierElo = data?.ranks?.premier;
        const rankObj = getRankForElo(premierElo);
        const embedColor = rankObj ? rankObj.color : 0x808080;

        // Aktualizuje cached Elo pre leaderboard
        users[targetUser.id].elo = typeof premierElo === 'number' && premierElo >= 1000 ? premierElo : null;
        saveUsers(users);

        const leetifyRating = typeof data?.ranks?.leetify === 'number'
            ? `${data.ranks.leetify >= 0 ? '+' : ''}${data.ranks.leetify.toFixed(2)}`
            : 'N/A';

        const winrate = typeof data?.winrate === 'number'
            ? `${(data.winrate <= 1 ? data.winrate * 100 : data.winrate).toFixed(1)}%`
            : 'N/A';

        const r = data?.rating || {};
        const fmt = val => (typeof val === 'number' ? val.toFixed(1) : 'N/A');

        const embed = new EmbedBuilder()
            .setTitle(`📊 ${data.name || targetUser.username} — CS2 Stats`)
            .setURL(`https://leetify.com/app/profile/${entry.steamId}`)
            .setThumbnail(targetUser.displayAvatarURL())
            .setColor(embedColor)
            .addFields(
                { name: 'Premier Elo', value: typeof premierElo === 'number' ? `**${premierElo.toLocaleString('sk-SK')}**` : 'Unranked', inline: true },
                { name: 'Leetify Rating', value: `**${leetifyRating}**`, inline: true },
                { name: 'Winrate', value: `**${winrate}**`, inline: true },
                { name: '🎯 Aim', value: fmt(r.aim), inline: true },
                { name: '🧭 Positioning', value: fmt(r.positioning), inline: true },
                { name: '💣 Utility', value: fmt(r.utility), inline: true },
                { name: '🔥 Clutch', value: fmt(r.clutch), inline: true },
                { name: '⚡ Opening', value: fmt(r.opening), inline: true }
            )
            .setFooter({ text: 'Dáta z Leetify' });

        return interaction.editReply({ embeds: [embed] });
    }
};
