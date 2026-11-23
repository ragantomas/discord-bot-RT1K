const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    ChannelType,
    EmbedBuilder
} = require('discord.js');
const { TEMPVOICE_DEFAULTS } = require('../../config');
const {
    getGuildConfig,
    setGuildConfig,
    deleteGuildConfig,
    getAllTempRooms
} = require('../../storage/tempVoiceStore');

function addSharedConfigOptions(subcommand) {
    return subcommand
        .addStringOption(opt =>
            opt.setName('nazov_trigger')
                .setDescription('Názov spúšťacieho hlasového kanála')
                .setMaxLength(100)
                .setRequired(false)
        )
        .addStringOption(opt =>
            opt.setName('sablona_nazvu')
                .setDescription('Šablóna názvu novej roomky ({user}, {username})')
                .setMaxLength(100)
                .setRequired(false)
        )
        .addIntegerOption(opt =>
            opt.setName('bitrate')
                .setDescription('Bitrate novej roomky v kbps (8–384)')
                .setMinValue(8)
                .setMaxValue(384)
                .setRequired(false)
        )
        .addIntegerOption(opt =>
            opt.setName('limit')
                .setDescription('Predvolený limit hráčov (0–99, 0 = bez limitu)')
                .setMinValue(0)
                .setMaxValue(99)
                .setRequired(false)
        )
        .addChannelOption(opt =>
            opt.setName('kategoria')
                .setDescription('Kategória pre spúšťací kanál a dočasné miestnosti')
                .addChannelTypes(ChannelType.GuildCategory)
                .setRequired(false)
        );
}

function buildConfigSummaryFields(guild, config) {
    const maxKbps = Math.floor((guild.maximumBitrate || 96000) / 1000);
    const effectiveKbps = Math.min(config.bitrateKbps, maxKbps);

    return [
        {
            name: '🔊 Spúšťací VC',
            value: config.triggerChannelId ? `<#${config.triggerChannelId}>` : '*Nenastavený / zmazaný*',
            inline: true
        },
        {
            name: '📁 Kategória',
            value: config.categoryId ? `<#${config.categoryId}>` : '*Automaticky / žiadna*',
            inline: true
        },
        {
            name: '🏷️ Šablóna názvu',
            value: `\`${config.roomNameTemplate}\``,
            inline: true
        },
        {
            name: '🎧 Bitrate',
            value: effectiveKbps < config.bitrateKbps
                ? `${config.bitrateKbps} kbps *(server max: ${maxKbps} kbps)*`
                : `${config.bitrateKbps} kbps`,
            inline: true
        },
        {
            name: '👥 Predvolený limit',
            value: config.userLimit === 0 ? 'Bez limitu (0)' : `${config.userLimit} hráčov`,
            inline: true
        }
    ];
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('tempvoice')
        .setDescription('Nastavenie systému dočasných hlasových miestností (ADMIN)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand(sub =>
            addSharedConfigOptions(
                sub.setName('setup')
                    .setDescription('Nastaví alebo vytvorí spúšťací TempVoice kanál (ADMIN)')
            ).addChannelOption(opt =>
                opt.setName('trigger_kanal')
                    .setDescription('Existujúci VC ako spúšťací (ak nevyplníš, vytvorí sa nový)')
                    .addChannelTypes(ChannelType.GuildVoice)
                    .setRequired(false)
            )
        )
        .addSubcommand(sub =>
            addSharedConfigOptions(
                sub.setName('config')
                    .setDescription('Upraví nastavenia TempVoice bez znovuvytvorenia kanála (ADMIN)')
            )
        )
        .addSubcommand(sub =>
            sub.setName('info')
                .setDescription('Zobrazí aktuálne nastavenia TempVoice na serveri (ADMIN)')
        )
        .addSubcommand(sub =>
            sub.setName('disable')
                .setDescription('Vypne TempVoice na tomto serveri (ADMIN)')
                .addBooleanOption(opt =>
                    opt.setName('zmazat_kanal')
                        .setDescription('Zmaže aj spúšťací hlasový kanál')
                        .setRequired(false)
                )
        ),
    adminOnly: true,

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        const guild = interaction.guild;

        if (subcommand === 'setup') {
            await interaction.deferReply({ ephemeral: true });

            const existingConfig = getGuildConfig(guild.id);
            const triggerNameInput = interaction.options.getString('nazov_trigger');
            const roomTemplateInput = interaction.options.getString('sablona_nazvu');
            const bitrateInput = interaction.options.getInteger('bitrate');
            const limitInput = interaction.options.getInteger('limit');
            const categoryInput = interaction.options.getChannel('kategoria');
            const triggerChannelInput = interaction.options.getChannel('trigger_kanal');

            const triggerName = triggerNameInput || existingConfig?.triggerName || TEMPVOICE_DEFAULTS.triggerName;
            const roomNameTemplate = roomTemplateInput || existingConfig?.roomNameTemplate || TEMPVOICE_DEFAULTS.roomNameTemplate;
            const bitrateKbps = bitrateInput ?? existingConfig?.bitrateKbps ?? TEMPVOICE_DEFAULTS.bitrateKbps;
            const userLimit = limitInput ?? existingConfig?.userLimit ?? TEMPVOICE_DEFAULTS.userLimit;

            let triggerChannel = triggerChannelInput;
            let categoryId = categoryInput?.id ?? existingConfig?.categoryId ?? null;

            if (triggerChannel) {
                if (!categoryInput && triggerChannel.parentId) {
                    categoryId = triggerChannel.parentId;
                }
                if (triggerNameInput && triggerChannel.name !== triggerName) {
                    await triggerChannel.setName(triggerName).catch(() => null);
                }
                if (categoryInput && triggerChannel.parentId !== categoryInput.id) {
                    await triggerChannel.setParent(categoryInput.id, { lockPermissions: false }).catch(() => null);
                }
            } else {
                // Ak existuje predchádzajúci trigger kanál, skús ho použiť namiesto duplicitného vytvárania
                if (existingConfig?.triggerChannelId) {
                    triggerChannel = guild.channels.cache.get(existingConfig.triggerChannelId)
                        || await guild.channels.fetch(existingConfig.triggerChannelId).catch(() => null);
                }

                if (triggerChannel) {
                    if (triggerNameInput && triggerChannel.name !== triggerName) {
                        await triggerChannel.setName(triggerName).catch(() => null);
                    }
                    if (categoryInput && triggerChannel.parentId !== categoryInput.id) {
                        await triggerChannel.setParent(categoryInput.id, { lockPermissions: false }).catch(() => null);
                    }
                } else {
                    triggerChannel = await guild.channels.create({
                        name: triggerName,
                        type: ChannelType.GuildVoice,
                        parent: categoryId || undefined
                    });
                }
            }

            const newConfig = {
                triggerChannelId: triggerChannel.id,
                categoryId,
                triggerName,
                roomNameTemplate,
                bitrateKbps,
                userLimit
            };

            setGuildConfig(guild.id, newConfig);

            const embed = new EmbedBuilder()
                .setTitle('✅ TempVoice bol nastavený')
                .setColor(0x57F287)
                .addFields(buildConfigSummaryFields(guild, newConfig))
                .setFooter({ text: 'Pripojením do spúšťacieho VC sa automaticky vytvorí nová miestnosť' });

            return interaction.editReply({ embeds: [embed] });
        }

        if (subcommand === 'config') {
            const existingConfig = getGuildConfig(guild.id);
            if (!existingConfig) {
                return interaction.reply({
                    content: 'TempVoice na tomto serveri ešte nie je nastavený. Najprv použi `/tempvoice setup`.',
                    ephemeral: true
                });
            }

            const triggerNameInput = interaction.options.getString('nazov_trigger');
            const roomTemplateInput = interaction.options.getString('sablona_nazvu');
            const bitrateInput = interaction.options.getInteger('bitrate');
            const limitInput = interaction.options.getInteger('limit');
            const categoryInput = interaction.options.getChannel('kategoria');

            if (
                triggerNameInput === null &&
                roomTemplateInput === null &&
                bitrateInput === null &&
                limitInput === null &&
                categoryInput === null
            ) {
                return interaction.reply({
                    content: 'Zadaj aspoň jeden parameter, ktorý chceš upraviť.',
                    ephemeral: true
                });
            }

            await interaction.deferReply({ ephemeral: true });

            const updatedConfig = {
                ...existingConfig,
                triggerName: triggerNameInput ?? existingConfig.triggerName,
                roomNameTemplate: roomTemplateInput ?? existingConfig.roomNameTemplate,
                bitrateKbps: bitrateInput ?? existingConfig.bitrateKbps,
                userLimit: limitInput ?? existingConfig.userLimit,
                categoryId: categoryInput ? categoryInput.id : existingConfig.categoryId
            };

            if (existingConfig.triggerChannelId) {
                const triggerChannel = guild.channels.cache.get(existingConfig.triggerChannelId)
                    || await guild.channels.fetch(existingConfig.triggerChannelId).catch(() => null);

                if (triggerChannel) {
                    if (triggerNameInput !== null && triggerChannel.name !== updatedConfig.triggerName) {
                        await triggerChannel.setName(updatedConfig.triggerName).catch(() => null);
                    }
                    if (categoryInput && triggerChannel.parentId !== categoryInput.id) {
                        await triggerChannel.setParent(categoryInput.id, { lockPermissions: false }).catch(() => null);
                    }
                }
            }

            setGuildConfig(guild.id, updatedConfig);

            const embed = new EmbedBuilder()
                .setTitle('⚙️ Nastavenia TempVoice aktualizované')
                .setColor(0x5865F2)
                .addFields(buildConfigSummaryFields(guild, updatedConfig));

            return interaction.editReply({ embeds: [embed] });
        }

        if (subcommand === 'info') {
            const config = getGuildConfig(guild.id);
            if (!config) {
                return interaction.reply({
                    content: 'TempVoice nie je na tomto serveri nastavený. Použi `/tempvoice setup`.',
                    ephemeral: true
                });
            }

            const activeRoomsCount = Object.values(getAllTempRooms())
                .filter(room => room.guildId === guild.id)
                .length;

            const embed = new EmbedBuilder()
                .setTitle('🎙️ TempVoice — Aktuálne nastavenia')
                .setColor(0x5865F2)
                .addFields(
                    ...buildConfigSummaryFields(guild, config),
                    { name: '🟢 Aktívne miestnosti', value: `${activeRoomsCount}`, inline: true }
                );

            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        if (subcommand === 'disable') {
            const config = getGuildConfig(guild.id);
            if (!config) {
                return interaction.reply({
                    content: 'TempVoice nie je na tomto serveri zapnutý.',
                    ephemeral: true
                });
            }

            await interaction.deferReply({ ephemeral: true });
            const shouldDeleteChannel = interaction.options.getBoolean('zmazat_kanal') ?? false;

            if (shouldDeleteChannel && config.triggerChannelId) {
                const triggerChannel = guild.channels.cache.get(config.triggerChannelId)
                    || await guild.channels.fetch(config.triggerChannelId).catch(() => null);
                if (triggerChannel) {
                    await triggerChannel.delete('TempVoice vypnutý administrátorom').catch(() => null);
                }
            }

            deleteGuildConfig(guild.id);
            return interaction.editReply('🛑 TempVoice bol na tomto serveri vypnutý.');
        }
    }
};
