const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { loadUsers, saveUsers } = require('../../storage/usersStore');
const { removeRankRoles } = require('../../services/ranks');
const { updateBotStatus } = require('../../services/botStatus');
const { syncLinkedPlayer } = require('../../tasks/rankUpdater');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('unlink')
        .setDescription('Odpojí tvoj Steam účet a odoberie CS2 rank rolu'),

    async execute(interaction) {
        const users = loadUsers();
        if (!users[interaction.user.id]) {
            return interaction.reply({ content: 'Nemáš prepojený žiadny Steam účet.', flags: MessageFlags.Ephemeral });
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        delete users[interaction.user.id];
        saveUsers(users);
        syncLinkedPlayer(interaction.user.id, null);
        updateBotStatus(interaction.client);

        await removeRankRoles(interaction.member);

        return interaction.editReply('Tvoj Steam účet bol odpojený a rank rola bola odobraná.');
    }
};
