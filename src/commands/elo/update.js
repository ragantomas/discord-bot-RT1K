const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { loadUsers } = require('../../storage/usersStore');
const { updateMemberRank } = require('../../services/ranks');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('update')
        .setDescription('Manuálne aktualizuje tvoj CS2 Premier rank'),

    async execute(interaction) {
        const users = loadUsers();
        const entry = users[interaction.user.id];
        if (!entry) {
            return interaction.reply({ content: 'Najprv si prepoj účet cez `/link`.', flags: MessageFlags.Ephemeral });
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const result = await updateMemberRank(interaction.member, entry.steamId, users);
        if (result.error) return interaction.editReply(result.error);
        if (result.elo === null) {
            return interaction.editReply('Aktuálne nemáš aktívny Premier rank – priradil som ti rolu **Unranked**.');
        }
        return interaction.editReply(`Rank aktualizovaný! Tvoje aktuálne Elo: **${result.elo.toLocaleString('sk-SK')}**.`);
    }
};
