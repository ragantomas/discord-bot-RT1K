const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { loadUsers, saveUsers } = require('../../storage/usersStore');
const { resolveSteam64Id } = require('../../services/steam');
const { updateMemberRank } = require('../../services/ranks');
const { updateBotStatus } = require('../../services/botStatus');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('forcelink')
        .setDescription('Prepojí Steam účet inému hráčovi (ADMIN)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addUserOption(opt =>
            opt.setName('hrac').setDescription('Hráč na serveri').setRequired(true)
        )
        .addStringOption(opt =>
            opt.setName('profil')
                .setDescription('Steam64 ID, Steam URL alebo Leetify link')
                .setRequired(true)
        ),
    adminOnly: true,

    async execute(interaction) {
        const targetUser = interaction.options.getUser('hrac');
        const input = interaction.options.getString('profil');
        await interaction.deferReply({ ephemeral: true });

        const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
        if (!targetMember) {
            return interaction.editReply('Tento hráč sa nenašiel na serveri.');
        }

        const steamId = await resolveSteam64Id(input);
        if (!steamId) {
            return interaction.editReply('Nepodarilo sa nájsť Steam64 ID. Zadaj platné 17-miestne ID, Steam link (aj `/id/...`) alebo Leetify link.');
        }

        const result = await updateMemberRank(targetMember, steamId);
        if (result.error) return interaction.editReply(result.error);

        const users = loadUsers();
        users[targetUser.id] = { steamId, elo: result.elo };
        saveUsers(users);
        updateBotStatus(interaction.client);

        if (result.elo === null) {
            return interaction.editReply(`Účet pre <@${targetUser.id}> bol prepojený (priradená rola **Unranked**).`);
        }
        return interaction.editReply(`Účet pre <@${targetUser.id}> bol prepojený! Aktuálne Elo: **${result.elo.toLocaleString('sk-SK')}**.`);
    }
};
