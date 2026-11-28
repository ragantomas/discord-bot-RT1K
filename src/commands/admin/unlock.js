const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, EmbedBuilder, MessageFlags } = require('discord.js');
const { addActivityLog } = require('../../services/activityLog');
const { logModerationAction } = require('../../services/adminLog');

module.exports = {
    adminOnly: true,
    modModuleKey: 'lock',
    data: new SlashCommandBuilder()
        .setName('unlock')
        .setDescription('Odomkne textový kanál')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .setDMPermission(false)
        .addChannelOption(opt =>
            opt.setName('kanal')
                .setDescription('Kanál na odomknutie')
                .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
                .setRequired(false)
        )
        .addStringOption(opt =>
            opt.setName('dovod').setDescription('Dôvod odomknutia').setRequired(false).setMaxLength(400)
        ),

    async execute(interaction) {
        const channel = interaction.options.getChannel('kanal') || interaction.channel;
        const reason = interaction.options.getString('dovod') || 'Kanál bol odomknutý.';

        if (!channel || !channel.isTextBased() || !channel.permissionOverwrites) {
            return interaction.reply({ content: 'Tento kanál nie je možné odomknúť.', flags: MessageFlags.Ephemeral });
        }

        const me = interaction.guild.members.me;
        const perms = channel.permissionsFor(me);
        if (!perms?.has(PermissionFlagsBits.ManageChannels)) {
            return interaction.reply({ content: 'Bot nemá právo Manage Channels v tomto kanáli.', flags: MessageFlags.Ephemeral });
        }

        await channel.permissionOverwrites.edit(
            interaction.guild.roles.everyone,
            { SendMessages: null },
            { reason: `Odomkol ${interaction.user.tag}: ${reason}` }
        );

        await logModerationAction(interaction.guild, {
            eventKey: 'channelActions',
            title: '🔓 Kanál odomknutý',
            color: 0x57F287,
            moderatorText: `<@${interaction.user.id}>`,
            reason,
            extraFields: [{ name: 'Kanál', value: `<#${channel.id}>`, inline: true }]
        });

        addActivityLog({
            level: 'info',
            category: 'moderation',
            message: `Unlocked channel #${channel.name}.`,
            actor: interaction.user.tag
        });

        const embed = new EmbedBuilder()
            .setTitle('🔓 Kanál odomknutý')
            .setColor(0x57F287)
            .setDescription(reason)
            .setTimestamp();

        if (channel.id === interaction.channelId) {
            return interaction.reply({ embeds: [embed] });
        }

        await channel.send({ embeds: [embed] }).catch(() => null);
        return interaction.reply({ content: `Kanál <#${channel.id}> bol odomknutý.`, flags: MessageFlags.Ephemeral });
    }
};
