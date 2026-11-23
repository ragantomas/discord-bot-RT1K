const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    ChannelType,
    EmbedBuilder
} = require('discord.js');
const {
    getCsStatusGuildConfig,
    setCsStatusGuildConfig,
    deleteCsStatusGuildConfig
} = require('../../storage/csStatusStore');
const {
    updateGuildStatusMessage,
    getConfigIntervalSeconds,
    parseIntervalSeconds,
    formatInterval
} = require('../../services/csStatus');

function hasStatusChannelPerms(guild, channel) {
    const me = guild.members.me;
    if (!me || !channel) return false;
    const perms = channel.permissionsFor(me);
    if (!perms) return false;

    return perms.has([
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.EmbedLinks,
        PermissionFlagsBits.ReadMessageHistory
    ]);
}

function buildConfigSummaryFields(guild, config) {
    const messageLink = config.channelId && config.messageId
        ? `[Otvoriť správu](https://discord.com/channels/${guild.id}/${config.channelId}/${config.messageId})`
        : '*Zatiaľ nevytvorená*';

    const lastUpdated = config.lastUpdatedAt
        ? `<t:${Math.floor(config.lastUpdatedAt / 1000)}:R>`
        : '*Nikdy*';

    const modeText = process.env.STEAM_API_KEY?.trim()
        ? 'Plný CS2/EU režim (`STEAM_API_KEY`)'
        : 'Základný Steam + CS2 hráči režim';

    return [
        {
            name: '📢 Kanál',
            value: config.channelId ? `<#${config.channelId}>` : '*Nenastavený / zmazaný*',
            inline: true
        },
        {
            name: '⏱️ Interval',
            value: `Každých ${formatInterval(getConfigIntervalSeconds(config))}`,
            inline: true
        },
        {
            name: '📌 Embed správa',
            value: messageLink,
            inline: true
        },
        {
            name: '🕒 Posledná aktualizácia',
            value: lastUpdated,
            inline: true
        },
        {
            name: '🔌 Režim dát',
            value: modeText,
            inline: true
        }
    ];
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('csstatus')
        .setDescription('Nastavenie automatického stavu CS2 a Steam serverov (ADMIN)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand(sub =>
            sub.setName('setup')
                .setDescription('Vytvorí a bude automaticky aktualizovať embed so stavom CS2/Steam serverov (ADMIN)')
                .addChannelOption(opt =>
                    opt.setName('kanal')
                        .setDescription('Kanál pre automatický embed so stavom serverov')
                        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
                        .setRequired(true)
                )
                .addStringOption(opt =>
                    opt.setName('interval')
                        .setDescription('Interval aktualizácie od 30s do 60m (napr. 30s, 1m, 5m, 60m)')
                        .setMaxLength(10)
                        .setRequired(false)
                )
        )
        .addSubcommand(sub =>
            sub.setName('config')
                .setDescription('Upraví kanál alebo interval aktualizácie stavu serverov (ADMIN)')
                .addChannelOption(opt =>
                    opt.setName('kanal')
                        .setDescription('Nový kanál pre embed so stavom serverov')
                        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
                        .setRequired(false)
                )
                .addStringOption(opt =>
                    opt.setName('interval')
                        .setDescription('Interval aktualizácie od 30s do 60m (napr. 30s, 1m, 5m, 60m)')
                        .setMaxLength(10)
                        .setRequired(false)
                )
        )
        .addSubcommand(sub =>
            sub.setName('refresh')
                .setDescription('Okamžite obnoví embed so stavom CS2 a Steam serverov (ADMIN)')
        )
        .addSubcommand(sub =>
            sub.setName('info')
                .setDescription('Zobrazí aktuálne nastavenia modulu stavu serverov (ADMIN)')
        )
        .addSubcommand(sub =>
            sub.setName('disable')
                .setDescription('Vypne automatickú aktualizáciu stavu CS2 a Steam serverov (ADMIN)')
                .addBooleanOption(opt =>
                    opt.setName('zmazat_spravu')
                        .setDescription('Zmaže aj existujúcu embed správu z kanála')
                        .setRequired(false)
                )
        ),
    adminOnly: true,

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        const guild = interaction.guild;

        if (subcommand === 'setup') {
            const channel = interaction.options.getChannel('kanal');
            const intervalInput = interaction.options.getString('interval');

            if (!hasStatusChannelPerms(guild, channel)) {
                return interaction.reply({
                    content: `Nemám potrebné oprávnenia v kanáli <#${channel.id}>. Skontroluj práva **Zobraziť kanál**, **Posielať správy**, **Vkladať odkazy** a **Čítať históriu správ**.`,
                    ephemeral: true
                });
            }

            const existingConfig = getCsStatusGuildConfig(guild.id);
            let intervalSeconds = getConfigIntervalSeconds(existingConfig);

            if (intervalInput !== null) {
                const parsed = parseIntervalSeconds(intervalInput);
                if (!parsed.ok) {
                    return interaction.reply({ content: parsed.error, ephemeral: true });
                }
                intervalSeconds = parsed.seconds;
            }

            await interaction.deferReply({ ephemeral: true });

            const channelChanged = existingConfig?.channelId !== channel.id;

            setCsStatusGuildConfig(guild.id, {
                channelId: channel.id,
                messageId: channelChanged ? null : (existingConfig?.messageId || null),
                intervalSeconds,
                lastUpdatedAt: 0
            });

            const result = await updateGuildStatusMessage(interaction.client, guild.id, {
                forceNewMessage: channelChanged
            });

            if (!result.ok) {
                return interaction.editReply('❌ Nepodarilo sa odoslať embed so stavom serverov do zvoleného kanála.');
            }

            const finalConfig = getCsStatusGuildConfig(guild.id);
            const embed = new EmbedBuilder()
                .setTitle('✅ Stav CS2 a Steam serverov bol nastavený')
                .setColor(0x57F287)
                .addFields(buildConfigSummaryFields(guild, finalConfig))
                .setFooter({ text: 'Správa v kanáli sa bude automaticky upravovať namiesto posielania nových' });

            return interaction.editReply({ embeds: [embed] });
        }

        if (subcommand === 'config') {
            const existingConfig = getCsStatusGuildConfig(guild.id);
            if (!existingConfig) {
                return interaction.reply({
                    content: 'Stav CS2/Steam serverov ešte nie je nastavený. Najprv použi `/csstatus setup`.',
                    ephemeral: true
                });
            }

            const channelInput = interaction.options.getChannel('kanal');
            const intervalInput = interaction.options.getString('interval');

            if (channelInput === null && intervalInput === null) {
                return interaction.reply({
                    content: 'Zadaj aspoň jeden parameter (`kanal` alebo `interval`).',
                    ephemeral: true
                });
            }

            if (channelInput && !hasStatusChannelPerms(guild, channelInput)) {
                return interaction.reply({
                    content: `Nemám potrebné oprávnenia v kanáli <#${channelInput.id}>. Skontroluj práva **Zobraziť kanál**, **Posielať správy**, **Vkladať odkazy** a **Čítať históriu správ**.`,
                    ephemeral: true
                });
            }

            let intervalSeconds = getConfigIntervalSeconds(existingConfig);
            if (intervalInput !== null) {
                const parsed = parseIntervalSeconds(intervalInput);
                if (!parsed.ok) {
                    return interaction.reply({ content: parsed.error, ephemeral: true });
                }
                intervalSeconds = parsed.seconds;
            }

            await interaction.deferReply({ ephemeral: true });

            const channelChanged = Boolean(channelInput && channelInput.id !== existingConfig.channelId);
            const updatedConfig = {
                ...existingConfig,
                channelId: channelInput ? channelInput.id : existingConfig.channelId,
                messageId: channelChanged ? null : existingConfig.messageId,
                intervalSeconds
            };
            delete updatedConfig.intervalMinutes;

            setCsStatusGuildConfig(guild.id, updatedConfig);

            if (updatedConfig.channelId) {
                await updateGuildStatusMessage(interaction.client, guild.id, {
                    forceNewMessage: channelChanged
                }).catch(() => null);
            }

            const finalConfig = getCsStatusGuildConfig(guild.id);
            const embed = new EmbedBuilder()
                .setTitle('⚙️ Nastavenia stavu serverov aktualizované')
                .setColor(0x5865F2)
                .addFields(buildConfigSummaryFields(guild, finalConfig));

            return interaction.editReply({ embeds: [embed] });
        }

        if (subcommand === 'refresh') {
            const existingConfig = getCsStatusGuildConfig(guild.id);
            if (!existingConfig || !existingConfig.channelId) {
                return interaction.reply({
                    content: 'Stav serverov nie je nastavený alebo bol jeho kanál zmazaný. Použi `/csstatus setup`.',
                    ephemeral: true
                });
            }

            await interaction.deferReply({ ephemeral: true });

            const result = await updateGuildStatusMessage(interaction.client, guild.id);
            if (!result.ok) {
                return interaction.editReply('❌ Nepodarilo sa aktualizovať správu so stavom serverov (skontroluj kanál a oprávnenia bota).');
            }

            return interaction.editReply(`✅ Stav CS2 a Steam serverov bol aktualizovaný v <#${result.channelId}>.`);
        }

        if (subcommand === 'info') {
            const config = getCsStatusGuildConfig(guild.id);
            if (!config) {
                return interaction.reply({
                    content: 'Stav CS2/Steam serverov nie je na tomto serveri nastavený. Použi `/csstatus setup`.',
                    ephemeral: true
                });
            }

            const embed = new EmbedBuilder()
                .setTitle('🖥️ Stav CS2/Steam serverov — Nastavenia')
                .setColor(0x5865F2)
                .addFields(buildConfigSummaryFields(guild, config));

            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        if (subcommand === 'disable') {
            const config = getCsStatusGuildConfig(guild.id);
            if (!config) {
                return interaction.reply({
                    content: 'Automatický stav CS2/Steam serverov nie je na tomto serveri zapnutý.',
                    ephemeral: true
                });
            }

            await interaction.deferReply({ ephemeral: true });
            const shouldDeleteMsg = interaction.options.getBoolean('zmazat_spravu') ?? false;

            if (shouldDeleteMsg && config.channelId && config.messageId) {
                const channel = guild.channels.cache.get(config.channelId)
                    || await guild.channels.fetch(config.channelId).catch(() => null);
                if (channel && channel.isTextBased()) {
                    const msg = await channel.messages.fetch(config.messageId).catch(() => null);
                    if (msg) {
                        await msg.delete().catch(() => null);
                    }
                }
            }

            deleteCsStatusGuildConfig(guild.id);
            return interaction.editReply('🛑 Automatický stav CS2 a Steam serverov bol vypnutý.');
        }
    }
};
