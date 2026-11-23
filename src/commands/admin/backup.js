const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { hasAnyBackupFile, sendBackupToUser } = require('../../services/backup');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('backup')
        .setDescription('Pošle zálohu databázových súborov do DM (ADMIN)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    adminOnly: true,

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        if (!hasAnyBackupFile()) {
            return interaction.editReply('Zatiaľ neexistuje žiadny databázový súbor.');
        }

        try {
            await sendBackupToUser(interaction.user, 'Manuálna záloha');
            return interaction.editReply('✅ Záloha databázových súborov ti bola poslaná do DM.');
        } catch (err) {
            console.error(err);
            return interaction.editReply('❌ Nepodarilo sa ti poslať DM. Skontroluj, či máš povolené súkromné správy z tohto servera.');
        }
    }
};
