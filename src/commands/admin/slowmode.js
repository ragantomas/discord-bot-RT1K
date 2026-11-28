const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags } = require('discord.js');
const { addActivityLog } = require('../../services/activityLog');
const { logModerationAction } = require('../../services/adminLog');

module.exports = {
    adminOnly: true,
    modModuleKey: 'slowmode',
    data: new SlashCommandBuilder()
        .setName('slowmode')
        .setDescription('Nastaví slowmode v kanáli')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .setDMPermission(false)
        .addIntegerOption(opt =>
            opt.setName('sekundy').setDescription('Oneskorenie v sekundách, 0 = vypnúť').setRequired(true).setMinValue(0).setMaxValue(21600)
        )
        .addChannelOption(opt =>
            opt.setName('kanal')
                .setDescription('Textový kanál')
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(false)
        ),

    async execute(interaction) {
        const seconds = interaction.options.getInteger('sekundy', true);
        const channel = interaction.options.getChannel('kanal') || interaction.channel;

        if (!channel || typeof channel.setRateLimitPerUser !== 'function') {
            return interaction.reply({ content: 'Tento kanál nepodporuje slowmode.', flags: MessageFlags.Ephemeral });
        }

        const me = interaction.guild.members.me;
        const perms = channel.permissionsFor(me);
        if (!perms?.has(PermissionFlagsBits.ManageChannels)) {
            return interaction.reply({ content: 'Bot nemá právo Manage Channels v tomto kanáli.', flags: MessageFlags.Ephemeral });
        }

        await channel.setRateLimitPerUser(seconds, `Nastavil ${interaction.user.tag}`);

        await logModerationAction(interaction.guild, {
            eventKey: 'channelActions',
            title: '⏱️ Slowmode upravený',
            color: 0x5865F2,
            moderatorText: `<@${interaction.user.id}>`,
            extraFields: [
                { name: 'Kanál', value: `<#${channel.id}>`, inline: true },
                { name: 'Interval', value: seconds === 0 ? 'Vypnutý' : `${seconds} s`, inline: true }
            ]
        });

        addActivityLog({
            level: 'info',
            category: 'moderation',
            message: seconds === 0
                ? `Disabled slowmode in #${channel.name}.`
                : `Set slowmode in #${channel.name} to ${seconds}s.`,
            actor: interaction.user.tag
        });

        return interaction.reply({
            content: seconds === 0
                ? `Slowmode v <#${channel.id}> bol vypnutý.`
                : `Slowmode v <#${channel.id}> bol nastavený na **${seconds} s**.`
        });
    }
};
