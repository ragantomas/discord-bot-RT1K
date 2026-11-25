const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { addActivityLog } = require('../../services/activityLog');
const { logModerationAction } = require('../../services/adminLog');

module.exports = {
    adminOnly: true,
    modModuleKey: 'clear',
    data: new SlashCommandBuilder()
        .setName('clear')
        .setDescription('Hromadne zmaže správy v kanáli')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .setDMPermission(false)
        .addIntegerOption(opt =>
            opt.setName('pocet').setDescription('Počet správ na zmazanie').setRequired(true).setMinValue(1).setMaxValue(100)
        )
        .addUserOption(opt =>
            opt.setName('pouzivatel').setDescription('Zmazať správy len od tohto člena').setRequired(false)
        )
        .addBooleanOption(opt =>
            opt.setName('ignorovat_pripnute').setDescription('Nechať pripnuté správy').setRequired(false)
        ),

    async execute(interaction) {
        const count = interaction.options.getInteger('pocet', true);
        const filterUser = interaction.options.getUser('pouzivatel');
        const ignorePinned = interaction.options.getBoolean('ignorovat_pripnute') ?? true;
        const channel = interaction.channel;

        if (!channel || !channel.isTextBased() || typeof channel.bulkDelete !== 'function') {
            return interaction.reply({ content: 'Tento kanál nepodporuje hromadné mazanie.', ephemeral: true });
        }

        const me = interaction.guild.members.me;
        const perms = channel.permissionsFor(me);
        if (!perms?.has([PermissionFlagsBits.ManageMessages, PermissionFlagsBits.ReadMessageHistory])) {
            return interaction.reply({ content: 'Bot nemá právo Manage Messages alebo Read Message History.', ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: true });

        const fetchLimit = filterUser ? 100 : count;
        const fetched = await channel.messages.fetch({ limit: fetchLimit }).catch(() => null);
        if (!fetched) {
            return interaction.editReply('Nepodarilo sa načítať správy v kanáli.');
        }

        const fourteenDaysAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;
        const candidates = [];
        for (const msg of fetched.values()) {
            if (msg.createdTimestamp <= fourteenDaysAgo) continue;
            if (ignorePinned && msg.pinned) continue;
            if (filterUser && msg.author?.id !== filterUser.id) continue;
            candidates.push(msg);
            if (candidates.length >= count) break;
        }

        if (candidates.length === 0) {
            return interaction.editReply('Nenašli sa žiadne správy mladšie ako 14 dní na zmazanie.');
        }

        const deleted = await channel.bulkDelete(candidates, true);
        const deletedCount = deleted.size;

        await logModerationAction(interaction.guild, {
            eventKey: 'channelActions',
            title: '🧹 Zmazané správy',
            color: 0x5865F2,
            moderatorText: `<@${interaction.user.id}>`,
            extraFields: [
                { name: 'Kanál', value: `<#${channel.id}>`, inline: true },
                { name: 'Počet', value: String(deletedCount), inline: true },
                ...(filterUser ? [{ name: 'Filter', value: `<@${filterUser.id}>`, inline: true }] : [])
            ]
        });

        addActivityLog({
            level: 'info',
            category: 'moderation',
            message: `Deleted ${deletedCount} messages in #${channel.name}.`,
            actor: interaction.user.tag
        });

        return interaction.editReply(`Zmazaných **${deletedCount}** správ.`);
    }
};
