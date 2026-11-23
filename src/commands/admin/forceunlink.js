const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { loadUsers, saveUsers } = require('../../storage/usersStore');
const { removeRankRoles } = require('../../services/ranks');
const { updateBotStatus } = require('../../services/botStatus');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('forceunlink')
        .setDescription('Odpojí Steam účet inému hráčovi a odoberie mu rank rolu (ADMIN)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addUserOption(opt =>
            opt.setName('hrac').setDescription('Hráč na serveri').setRequired(true)
        ),
    adminOnly: true,

    async execute(interaction) {
        const users = loadUsers();
        const targetUser = interaction.options.getUser('hrac');
        if (!users[targetUser.id]) {
            return interaction.reply({ content: `<@${targetUser.id}> nemá prepojený žiadny Steam účet.`, ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: true });
        delete users[targetUser.id];
        saveUsers(users);
        updateBotStatus(interaction.client);

        const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
        if (targetMember) {
            await removeRankRoles(targetMember);
        }

        return interaction.editReply(`Steam účet hráča <@${targetUser.id}> bol odpojený a rank rola bola odobraná.`);
    }
};
