const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { loadUsers } = require('../../storage/usersStore');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('leaderboard')
        .setDescription('Zobrazí rebríček CS2 Premier hráčov na serveri'),

    async execute(interaction) {
        await interaction.deferReply();

        const users = loadUsers();
        const entries = Object.entries(users);
        if (entries.length === 0) {
            return interaction.editReply('Zatiaľ nemá nikto prepojený účet. Použi `/link`.');
        }

        // Zoradenie: najprv hráči s Elo od najvyššieho, potom Unranked
        const sorted = entries.sort(([, a], [, b]) => (b.elo ?? -1) - (a.elo ?? -1));

        const lines = sorted.slice(0, 20).map(([userId, data], i) => {
            const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `**${i + 1}.**`;
            const eloText = typeof data.elo === 'number'
                ? `**${data.elo.toLocaleString('sk-SK')}**`
                : '*Unranked*';
            return `${medal} <@${userId}> — ${eloText}`;
        });

        const embed = new EmbedBuilder()
            .setTitle('🏆 CS2 Premier Leaderboard')
            .setColor(0xF5A623)
            .setDescription(lines.join('\n'))
            .setFooter({ text: 'Aktualizuje sa každú hodinu alebo cez /update' });

        return interaction.editReply({ embeds: [embed] });
    }
};
