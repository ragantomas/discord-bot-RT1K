const { SlashCommandBuilder } = require('discord.js');
const { loadUsers, saveUsers, appendEloHistory } = require('../../storage/usersStore');
const { resolveSteam64Id } = require('../../services/steam');
const { updateMemberRank } = require('../../services/ranks');
const { updateBotStatus } = require('../../services/botStatus');
const { addActivityLog } = require('../../services/activityLog');
const { syncLinkedPlayer } = require('../../tasks/rankUpdater');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('link')
        .setDescription('Prepojí tvoj Discord so Steamom a nastaví CS2 rank')
        .addStringOption(opt =>
            opt.setName('profil')
                .setDescription('Steam64 ID, Steam URL alebo Leetify link')
                .setRequired(true)
        ),

    async execute(interaction) {
        const input = interaction.options.getString('profil');
        await interaction.deferReply({ ephemeral: true });

        const steamId = await resolveSteam64Id(input);
        if (!steamId) {
            return interaction.editReply('Nepodarilo sa nájsť Steam64 ID. Zadaj platné 17-miestne ID, Steam link (aj `/id/...`) alebo Leetify link.');
        }

        const result = await updateMemberRank(interaction.member, steamId, null, { notifyChange: false });
        if (result.error) return interaction.editReply(result.error);

        const users = loadUsers();
        const now = Date.now();
        const newEntry = {
            steamId,
            elo: result.elo,
            eloHistory: [],
            lastCheckedAt: now,
            lastEloChangedAt: now
        };
        appendEloHistory(newEntry, result.elo, now);
        users[interaction.user.id] = newEntry;
        saveUsers(users);
        syncLinkedPlayer(interaction.user.id, newEntry);
        updateBotStatus(interaction.client);

        addActivityLog({
            level: 'success',
            category: 'elo',
            message: `Hráč ${interaction.member.displayName} si prepojil Steam účet (${typeof result.elo === 'number' ? result.elo.toLocaleString('sk-SK') : 'Unranked'}).`
        });

        if (result.elo === null) {
            return interaction.editReply('Účet prepojený! Aktuálne nemáš aktívny Premier rank – priradil som ti rolu **Unranked**.');
        }
        return interaction.editReply(`Účet prepojený! Tvoje aktuálne Elo: **${result.elo.toLocaleString('sk-SK')}**. Rola bola priradená.`);
    }
};
