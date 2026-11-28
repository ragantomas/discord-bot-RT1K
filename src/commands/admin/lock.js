const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, EmbedBuilder, MessageFlags } = require('discord.js');
const { addActivityLog } = require('../../services/activityLog');
const { logModerationAction } = require('../../services/adminLog');

module.exports = {
    adminOnly: true,
    modModuleKey: 'lock',
    data: new SlashCommandBuilder()
        .setName('lock')
        .setDescription('Zamkne textový kanál pre posielanie správ')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .setDMPermission(false)
        .addChannelOption(opt =>
            opt.setName('kanal')
                .setDescription('Kanál na zamknutie')
                .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
                .setRequired(false)
        )
        .addStringOption(opt =>
            opt.setName('dovod').setDescription('Dôvod zamknutia').setRequired(false).setMaxLength(400)
        ),

    async execute(interaction) {
        const channel = interaction.options.getChannel('kanal') || interaction.channel;
        const reason = interaction.options.getString('dovod') || 'Kanál bol zamknutý.';

        if (!channel || !channel.isTextBased() || !channel.permissionOverwrites) {
            return interaction.reply({ content: 'Tento kanál nie je možné zamknúť.', flags: MessageFlags.Ephemeral });
        }

        const me = interaction.guild.members.me;
        const perms = channel.permissionsFor(me);
        if (!perms?.has(PermissionFlagsBits.ManageChannels)) {
            return interaction.reply({ content: 'Bot nemá právo Manage Channels v tomto kanáli.', flags: MessageFlags.Ephemeral });
        }

        await channel.permissionOverwrites.edit(
            interaction.guild.roles.everyone,
            { SendMessages: false },
            { reason: `Zamkol ${interaction.user.tag}: ${reason}` }
        );

        await logModerationAction(interaction.guild, {
            eventKey: 'channelActions',
            title: '🔒 Kanál zamknutý',
            color: 0xED4245,
            moderatorText: `<@${interaction.user.id}>`,
            reason,
            extraFields: [{ name: 'Kanál', value: `<#${channel.id}>`, inline: true }]
        });

        addActivityLog({
            level: 'warn',
            category: 'moderation',
            message: `Locked channel #${channel.name}.`,
            actor: interaction.user.tag
        });

        const embed = new EmbedBuilder()
            .setTitle('🔒 Kanál zamknutý')
            .setColor(0xED4245)
            .setDescription(reason)
            .setTimestamp();

        if (channel.id === interaction.channelId) {
            return interaction.reply({ embeds: [embed] });
        }

        await channel.send({ embeds: [embed] }).catch(() => null);
        return interaction.reply({ content: `Kanál <#${channel.id}> bol zamknutý.`, flags: MessageFlags.Ephemeral });
    }
};
