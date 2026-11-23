const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    EmbedBuilder
} = require('discord.js');
const {
    getJoinRolesGuildConfig,
    setJoinRolesGuildConfig,
    deleteJoinRolesGuildConfig
} = require('../../storage/joinRolesStore');
const { validateAssignableRole } = require('../../services/joinRoles');

function formatRoleStatus(guild, roleId) {
    if (!roleId) return '*Nenastavená*';
    const role = guild.roles.cache.get(roleId);
    if (!role) return '*Zmazaná rola*';
    if (!role.editable) return `<@&${roleId}> *(⚠️ pod rolou bota)*`;
    return `<@&${roleId}>`;
}

function buildConfigSummaryFields(guild, config) {
    return [
        {
            name: '⚡ Stav',
            value: config.enabled ? '🟢 Zapnuté' : '⏸️ Pozastavené',
            inline: true
        },
        {
            name: '👤 Rola pre hráčov',
            value: formatRoleStatus(guild, config.memberRoleId),
            inline: true
        },
        {
            name: '🤖 Rola pre botov',
            value: formatRoleStatus(guild, config.botRoleId),
            inline: true
        }
    ];
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('joinroles')
        .setDescription('Nastavenie automatických rolí pri pripojení na server (ADMIN)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand(sub =>
            sub.setName('setup')
                .setDescription('Nastaví automatické join role pre hráčov a/alebo botov (ADMIN)')
                .addRoleOption(opt =>
                    opt.setName('hrac_rola')
                        .setDescription('Rola priradená bežným používateľom pri pripojení')
                        .setRequired(false)
                )
                .addRoleOption(opt =>
                    opt.setName('bot_rola')
                        .setDescription('Rola priradená botom pri pripojení na server')
                        .setRequired(false)
                )
        )
        .addSubcommand(sub =>
            sub.setName('config')
                .setDescription('Upraví nastavenia Join Roles za behu (ADMIN)')
                .addRoleOption(opt =>
                    opt.setName('hrac_rola')
                        .setDescription('Nová rola pre bežných používateľov')
                        .setRequired(false)
                )
                .addRoleOption(opt =>
                    opt.setName('bot_rola')
                        .setDescription('Nová rola pre botov')
                        .setRequired(false)
                )
                .addBooleanOption(opt =>
                    opt.setName('vypnut_hrac_rolu')
                        .setDescription('Zruší automatickú rolu pre hráčov')
                        .setRequired(false)
                )
                .addBooleanOption(opt =>
                    opt.setName('vypnut_bot_rolu')
                        .setDescription('Zruší automatickú rolu pre botov')
                        .setRequired(false)
                )
                .addBooleanOption(opt =>
                    opt.setName('zapnute')
                        .setDescription('Zapne alebo pozastaví prideľovanie join rolí')
                        .setRequired(false)
                )
        )
        .addSubcommand(sub =>
            sub.setName('info')
                .setDescription('Zobrazí aktuálne nastavenia Join Roles na serveri (ADMIN)')
        )
        .addSubcommand(sub =>
            sub.setName('disable')
                .setDescription('Vypne Join Roles a zmaže konfiguráciu na tomto serveri (ADMIN)')
        ),
    adminOnly: true,

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        const guild = interaction.guild;

        if (subcommand === 'setup') {
            const memberRoleInput = interaction.options.getRole('hrac_rola');
            const botRoleInput = interaction.options.getRole('bot_rola');
            const existingConfig = getJoinRolesGuildConfig(guild.id);

            const memberRoleId = memberRoleInput ? memberRoleInput.id : (existingConfig?.memberRoleId ?? null);
            const botRoleId = botRoleInput ? botRoleInput.id : (existingConfig?.botRoleId ?? null);

            if (!memberRoleInput && !botRoleInput && !existingConfig) {
                return interaction.reply({
                    content: 'Vyber aspoň jednu rolu (`hrac_rola` alebo `bot_rola`).',
                    ephemeral: true
                });
            }

            if (memberRoleInput) {
                const check = validateAssignableRole(guild, memberRoleInput);
                if (!check.ok) {
                    return interaction.reply({ content: check.reason, ephemeral: true });
                }
            }

            if (botRoleInput) {
                const check = validateAssignableRole(guild, botRoleInput);
                if (!check.ok) {
                    return interaction.reply({ content: check.reason, ephemeral: true });
                }
            }

            const newConfig = {
                enabled: true,
                memberRoleId,
                botRoleId
            };

            setJoinRolesGuildConfig(guild.id, newConfig);

            const embed = new EmbedBuilder()
                .setTitle('✅ Join Roles boli nastavené')
                .setColor(0x57F287)
                .addFields(buildConfigSummaryFields(guild, newConfig))
                .setFooter({ text: 'Novým členom sa pridelí rola automaticky po vstupe na server' });

            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        if (subcommand === 'config') {
            const existingConfig = getJoinRolesGuildConfig(guild.id);
            if (!existingConfig) {
                return interaction.reply({
                    content: 'Join Roles na tomto serveri ešte nie sú nastavené. Najprv použi `/joinroles setup`.',
                    ephemeral: true
                });
            }

            const memberRoleInput = interaction.options.getRole('hrac_rola');
            const botRoleInput = interaction.options.getRole('bot_rola');
            const clearMemberRole = interaction.options.getBoolean('vypnut_hrac_rolu');
            const clearBotRole = interaction.options.getBoolean('vypnut_bot_rolu');
            const enabledInput = interaction.options.getBoolean('zapnute');

            if (
                memberRoleInput === null &&
                botRoleInput === null &&
                clearMemberRole === null &&
                clearBotRole === null &&
                enabledInput === null
            ) {
                return interaction.reply({
                    content: 'Zadaj aspoň jeden parameter, ktorý chceš upraviť.',
                    ephemeral: true
                });
            }

            if (memberRoleInput && clearMemberRole === true) {
                return interaction.reply({
                    content: 'Nemôžeš súčasne nastaviť `hrac_rola` aj `vypnut_hrac_rolu: True`. Vyber len jednu možnosť.',
                    ephemeral: true
                });
            }

            if (botRoleInput && clearBotRole === true) {
                return interaction.reply({
                    content: 'Nemôžeš súčasne nastaviť `bot_rola` aj `vypnut_bot_rolu: True`. Vyber len jednu možnosť.',
                    ephemeral: true
                });
            }

            if (memberRoleInput) {
                const check = validateAssignableRole(guild, memberRoleInput);
                if (!check.ok) {
                    return interaction.reply({ content: check.reason, ephemeral: true });
                }
            }

            if (botRoleInput) {
                const check = validateAssignableRole(guild, botRoleInput);
                if (!check.ok) {
                    return interaction.reply({ content: check.reason, ephemeral: true });
                }
            }

            let memberRoleId = existingConfig.memberRoleId ?? null;
            if (clearMemberRole === true) {
                memberRoleId = null;
            } else if (memberRoleInput) {
                memberRoleId = memberRoleInput.id;
            }

            let botRoleId = existingConfig.botRoleId ?? null;
            if (clearBotRole === true) {
                botRoleId = null;
            } else if (botRoleInput) {
                botRoleId = botRoleInput.id;
            }

            const updatedConfig = {
                ...existingConfig,
                enabled: enabledInput ?? existingConfig.enabled ?? true,
                memberRoleId,
                botRoleId
            };

            setJoinRolesGuildConfig(guild.id, updatedConfig);

            const embed = new EmbedBuilder()
                .setTitle('⚙️ Nastavenia Join Roles aktualizované')
                .setColor(0x5865F2)
                .addFields(buildConfigSummaryFields(guild, updatedConfig));

            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        if (subcommand === 'info') {
            const config = getJoinRolesGuildConfig(guild.id);
            if (!config) {
                return interaction.reply({
                    content: 'Join Roles nie sú na tomto serveri nastavené. Použi `/joinroles setup`.',
                    ephemeral: true
                });
            }

            const embed = new EmbedBuilder()
                .setTitle('🏷️ Join Roles — Aktuálne nastavenia')
                .setColor(0x5865F2)
                .addFields(buildConfigSummaryFields(guild, config));

            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        if (subcommand === 'disable') {
            const config = getJoinRolesGuildConfig(guild.id);
            if (!config) {
                return interaction.reply({
                    content: 'Join Roles nie sú na tomto serveri zapnuté.',
                    ephemeral: true
                });
            }

            deleteJoinRolesGuildConfig(guild.id);
            return interaction.reply({
                content: '🛑 Join Roles boli na tomto serveri vypnuté.',
                ephemeral: true
            });
        }
    }
};
