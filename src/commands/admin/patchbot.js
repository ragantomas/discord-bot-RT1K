const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    ChannelType,
    EmbedBuilder
} = require('discord.js');
const { PATCHBOT_DEFAULTS } = require('../../config');
const {
    getPatchGuildConfig,
    setPatchGuildConfig,
    deletePatchGuildConfig,
    mergePostedGids,
    markGidsPosted
} = require('../../storage/patchBotStore');
const { fetchCs2News } = require('../../services/steamNews');
const { MODE_LABELS, sendPatchToChannel } = require('../../services/patchBot');

function addModeOption(subcommand) {
    return subcommand.addStringOption(opt =>
        opt.setName('typ_sprav')
            .setDescription('Aké CS2 správy sa majú posielať')
            .addChoices(
                { name: 'Všetky oficiálne CS2 oznámenia (patche + blog posty)', value: 'all' },
                { name: 'Len Patch Notes (Release Notes)', value: 'patchnotes' }
            )
            .setRequired(false)
    );
}

function hasChannelSendPerms(guild, channel) {
    const me = guild.members.me;
    if (!me || !channel) return false;
    const perms = channel.permissionsFor(me);
    if (!perms) return false;

    return perms.has([
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.EmbedLinks
    ]);
}

function formatPingRole(guild, roleId) {
    if (!roleId) return '*Vypnutý*';
    if (roleId === guild.id) return '@everyone';
    return `<@&${roleId}>`;
}

function buildConfigSummaryFields(guild, config) {
    return [
        {
            name: '📢 Kanál',
            value: config.channelId ? `<#${config.channelId}>` : '*Nenastavený / zmazaný*',
            inline: true
        },
        {
            name: '📰 Typ správ',
            value: MODE_LABELS[config.mode] || MODE_LABELS.all,
            inline: true
        },
        {
            name: '🔔 Ping rola',
            value: formatPingRole(guild, config.roleId),
            inline: true
        },
        {
            name: '⏱️ Interval kontroly',
            value: 'Každých 5 minút',
            inline: true
        }
    ];
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('patchbot')
        .setDescription('Nastavenie automatických CS2 update / patch správ (ADMIN)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand(sub =>
            addModeOption(
                sub.setName('setup')
                    .setDescription('Nastaví kanál pre automatické CS2 updaty (ADMIN)')
                    .addChannelOption(opt =>
                        opt.setName('kanal')
                            .setDescription('Textový alebo oznámený kanál pre CS2 updaty')
                            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
                            .setRequired(true)
                    )
            ).addRoleOption(opt =>
                opt.setName('rola')
                    .setDescription('Rola na označenie pri novom update (voliteľné)')
                    .setRequired(false)
            )
        )
        .addSubcommand(sub =>
            addModeOption(
                sub.setName('config')
                    .setDescription('Upraví nastavenia PatchBota za behu (ADMIN)')
                    .addChannelOption(opt =>
                        opt.setName('kanal')
                            .setDescription('Nový kanál pre CS2 updaty')
                            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
                            .setRequired(false)
                    )
            )
                .addRoleOption(opt =>
                    opt.setName('rola')
                        .setDescription('Rola na ping pri novom update')
                        .setRequired(false)
                )
                .addBooleanOption(opt =>
                    opt.setName('vypnut_ping')
                        .setDescription('Vypne označovanie role pri novom update')
                        .setRequired(false)
                )
        )
        .addSubcommand(sub =>
            sub.setName('info')
                .setDescription('Zobrazí aktuálne nastavenia PatchBota na serveri (ADMIN)')
        )
        .addSubcommand(sub =>
            sub.setName('latest')
                .setDescription('Okamžite pošle najnovší CS2 update do nastaveného kanála (ADMIN)')
                .addBooleanOption(opt =>
                    opt.setName('s_pingom')
                        .setDescription('Či sa má pri tomto teste označiť aj nastavená rola (predvolene Nie)')
                        .setRequired(false)
                )
        )
        .addSubcommand(sub =>
            sub.setName('disable')
                .setDescription('Vypne automatické CS2 updaty na tomto serveri (ADMIN)')
        ),
    adminOnly: true,

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        const guild = interaction.guild;

        if (subcommand === 'setup') {
            const channel = interaction.options.getChannel('kanal');
            const modeInput = interaction.options.getString('typ_sprav');
            const roleInput = interaction.options.getRole('rola');

            if (!hasChannelSendPerms(guild, channel)) {
                return interaction.reply({
                    content: `Nemám potrebné oprávnenia v kanáli <#${channel.id}>. Uisti sa, že tam mám práva **Zobraziť kanál**, **Posielať správy** a **Vkladať odkazy (Embed Links)**.`,
                    ephemeral: true
                });
            }

            await interaction.deferReply({ ephemeral: true });

            const existingConfig = getPatchGuildConfig(guild.id);
            const mode = modeInput || existingConfig?.mode || PATCHBOT_DEFAULTS.mode;
            const roleId = roleInput ? roleInput.id : (existingConfig?.roleId ?? PATCHBOT_DEFAULTS.roleId);

            const latestNews = await fetchCs2News({ mode, count: 10 });
            const latestGids = Array.isArray(latestNews)
                ? latestNews.map(item => item?.gid).filter(Boolean).map(String)
                : [];

            const newConfig = {
                channelId: channel.id,
                roleId,
                mode,
                postedGids: mergePostedGids(existingConfig?.postedGids, latestGids),
                lastPostedTitle: existingConfig?.lastPostedTitle || null,
                lastPostedAt: existingConfig?.lastPostedAt || null
            };

            setPatchGuildConfig(guild.id, newConfig);

            const embed = new EmbedBuilder()
                .setTitle('✅ CS2 PatchBot bol nastavený')
                .setColor(0x57F287)
                .addFields(buildConfigSummaryFields(guild, newConfig))
                .setFooter({ text: 'Na otestovanie vzhľadu použi /patchbot latest' });

            return interaction.editReply({ embeds: [embed] });
        }

        if (subcommand === 'config') {
            const existingConfig = getPatchGuildConfig(guild.id);
            if (!existingConfig) {
                return interaction.reply({
                    content: 'PatchBot na tomto serveri ešte nie je nastavený. Najprv použi `/patchbot setup`.',
                    ephemeral: true
                });
            }

            const channelInput = interaction.options.getChannel('kanal');
            const modeInput = interaction.options.getString('typ_sprav');
            const roleInput = interaction.options.getRole('rola');
            const disablePing = interaction.options.getBoolean('vypnut_ping');

            if (
                channelInput === null &&
                modeInput === null &&
                roleInput === null &&
                disablePing === null
            ) {
                return interaction.reply({
                    content: 'Zadaj aspoň jeden parameter, ktorý chceš upraviť.',
                    ephemeral: true
                });
            }

            if (roleInput && disablePing === true) {
                return interaction.reply({
                    content: 'Nemôžeš súčasne nastaviť `rola` aj `vypnut_ping: True`. Vyber len jednu možnosť.',
                    ephemeral: true
                });
            }

            if (channelInput && !hasChannelSendPerms(guild, channelInput)) {
                return interaction.reply({
                    content: `Nemám potrebné oprávnenia v kanáli <#${channelInput.id}>. Uisti sa, že tam mám práva **Zobraziť kanál**, **Posielať správy** a **Vkladať odkazy (Embed Links)**.`,
                    ephemeral: true
                });
            }

            await interaction.deferReply({ ephemeral: true });

            let roleId = existingConfig.roleId ?? null;
            if (disablePing === true) {
                roleId = null;
            } else if (roleInput) {
                roleId = roleInput.id;
            }

            const nextMode = modeInput ?? existingConfig.mode ?? PATCHBOT_DEFAULTS.mode;
            let postedGids = existingConfig.postedGids || [];

            if (modeInput && modeInput !== existingConfig.mode) {
                const latestNews = await fetchCs2News({ mode: nextMode, count: 10 });
                const latestGids = Array.isArray(latestNews)
                    ? latestNews.map(item => item?.gid).filter(Boolean).map(String)
                    : [];
                postedGids = mergePostedGids(postedGids, latestGids);
            }

            const updatedConfig = {
                ...existingConfig,
                channelId: channelInput ? channelInput.id : existingConfig.channelId,
                roleId,
                mode: nextMode,
                postedGids
            };

            setPatchGuildConfig(guild.id, updatedConfig);

            const embed = new EmbedBuilder()
                .setTitle('⚙️ Nastavenia CS2 PatchBota aktualizované')
                .setColor(0x5865F2)
                .addFields(buildConfigSummaryFields(guild, updatedConfig));

            return interaction.editReply({ embeds: [embed] });
        }

        if (subcommand === 'info') {
            const config = getPatchGuildConfig(guild.id);
            if (!config) {
                return interaction.reply({
                    content: 'PatchBot nie je na tomto serveri nastavený. Použi `/patchbot setup`.',
                    ephemeral: true
                });
            }

            const lastPostedValue = config.lastPostedTitle
                ? `${config.lastPostedTitle}${config.lastPostedAt ? ` (<t:${config.lastPostedAt}:R>)` : ''}`
                : '*Zatiaľ žiadny*';

            const embed = new EmbedBuilder()
                .setTitle('📰 CS2 PatchBot — Aktuálne nastavenia')
                .setColor(0x5865F2)
                .addFields(
                    ...buildConfigSummaryFields(guild, config),
                    { name: '🕒 Posledný odoslaný update', value: lastPostedValue, inline: false }
                );

            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        if (subcommand === 'latest') {
            const config = getPatchGuildConfig(guild.id);
            if (!config) {
                return interaction.reply({
                    content: 'PatchBot nie je na tomto serveri nastavený. Najprv použi `/patchbot setup`.',
                    ephemeral: true
                });
            }

            if (!config.channelId) {
                return interaction.reply({
                    content: 'Nastavený kanál pre PatchBota bol zmazaný. Nastav nový cez `/patchbot config` alebo `/patchbot setup`.',
                    ephemeral: true
                });
            }

            const targetChannel = guild.channels.cache.get(config.channelId)
                || await guild.channels.fetch(config.channelId).catch(() => null);

            if (!targetChannel || !targetChannel.isTextBased()) {
                return interaction.reply({
                    content: 'Cieľový kanál sa nenašiel. Nastav nový cez `/patchbot config`.',
                    ephemeral: true
                });
            }

            if (!hasChannelSendPerms(guild, targetChannel)) {
                return interaction.reply({
                    content: `Nemám potrebné oprávnenia v kanáli <#${targetChannel.id}> (**Zobraziť kanál**, **Posielať správy**, **Vkladať odkazy**).`,
                    ephemeral: true
                });
            }

            await interaction.deferReply({ ephemeral: true });

            const items = await fetchCs2News({ mode: config.mode || PATCHBOT_DEFAULTS.mode, count: 1 });
            if (items === null) {
                return interaction.editReply('❌ Nepodarilo sa spojiť so Steam News API. Skús to znova o chvíľu.');
            }
            if (items.length === 0) {
                return interaction.editReply('Steam momentálne nevrátil žiadne novinky pre zvolený režim.');
            }

            const latestItem = items[0];
            const withPing = interaction.options.getBoolean('s_pingom') ?? false;

            await sendPatchToChannel(targetChannel, latestItem, withPing ? config.roleId : null);
            if (latestItem.gid) {
                markGidsPosted(guild.id, [String(latestItem.gid)], latestItem);
            }

            return interaction.editReply(`✅ Najnovší CS2 príspevok (**${latestItem.title}**) bol odoslaný do <#${targetChannel.id}>.`);
        }

        if (subcommand === 'disable') {
            const config = getPatchGuildConfig(guild.id);
            if (!config) {
                return interaction.reply({
                    content: 'PatchBot nie je na tomto serveri zapnutý.',
                    ephemeral: true
                });
            }

            deletePatchGuildConfig(guild.id);
            return interaction.reply({
                content: '🛑 CS2 PatchBot bol na tomto serveri vypnutý.',
                ephemeral: true
            });
        }
    }
};
