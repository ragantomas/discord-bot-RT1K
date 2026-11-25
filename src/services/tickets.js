const {
    ChannelType,
    PermissionFlagsBits,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    AttachmentBuilder,
    MessageFlags
} = require('discord.js');
const { OWNER_ID } = require('../config');
const {
    getTicketsSettings,
    updateTicketsSettings,
    getOpenTicket,
    setOpenTicket,
    deleteOpenTicket,
    getAllOpenTickets
} = require('../storage/settingsStore');
const { addActivityLog, addThrottledErrorLog } = require('./activityLog');
const { suppressNextAdminLogEvent } = require('./adminLog');

function hexToInt(hex, fallback = 0x5865F2) {
    if (typeof hex !== 'string') return fallback;
    const match = hex.trim().match(/^#?([0-9a-fA-F]{6})$/);
    if (!match) return fallback;
    return parseInt(match[1], 16);
}

function isTicketStaff(member, config) {
    if (!member) return false;
    if (member.id === OWNER_ID) return true;
    if (member.permissions?.has(PermissionFlagsBits.Administrator)) return true;
    if (member.permissions?.has(PermissionFlagsBits.ManageChannels)) return true;
    return (config.supportRoleIds || []).some(roleId => member.roles?.cache?.has(roleId));
}

function slugifyChannelPart(str) {
    const cleaned = String(str || 'hrac')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    return (cleaned || 'hrac').slice(0, 20);
}

function buildPanelPayload(config) {
    const embed = new EmbedBuilder()
        .setTitle((config.panelTitle || '🎫 Podpora a nahlásenia').slice(0, 256))
        .setDescription((config.panelDescription || 'Klikni na tlačidlo nižšie a otvorí sa ti súkromný ticket.').slice(0, 4096))
        .setColor(hexToInt(config.panelColor, 0x5865F2));

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('ticket:open')
            .setLabel((config.panelButtonLabel || 'Otvoriť ticket').slice(0, 80))
            .setEmoji('🎫')
            .setStyle(ButtonStyle.Primary)
    );

    return { embeds: [embed], components: [row] };
}

function buildTicketControlRow(claimedById = null) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('ticket:claim')
            .setLabel(claimedById ? 'Prevzatý' : 'Prevziať ticket')
            .setEmoji('🙋')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(Boolean(claimedById)),
        new ButtonBuilder()
            .setCustomId('ticket:close')
            .setLabel('Zatvoriť ticket')
            .setEmoji('🔒')
            .setStyle(ButtonStyle.Danger)
    );
}

async function sendOrUpdateTicketPanel(guild) {
    if (!guild) {
        return { ok: false, error: 'Discord server not found.' };
    }
    const config = getTicketsSettings();
    if (!config.panelChannelId) {
        return { ok: false, error: 'Select a Ticket panel channel and save settings first.' };
    }

    const channel = guild.channels.cache.get(config.panelChannelId)
        || await guild.channels.fetch(config.panelChannelId).catch(() => null);
    if (!channel || !channel.isTextBased()) {
        return { ok: false, error: 'Selected Ticket panel channel does not exist or is not a text channel.' };
    }

    const me = guild.members.me;
    const perms = me ? channel.permissionsFor(me) : null;
    if (perms && (!perms.has(PermissionFlagsBits.ViewChannel) || !perms.has(PermissionFlagsBits.SendMessages) || !perms.has(PermissionFlagsBits.EmbedLinks))) {
        return { ok: false, error: `Bot lacks View Channel, Send Messages, and Embed Links permissions in #${channel.name}.` };
    }

    const payload = buildPanelPayload(config);
    let msg = null;

    if (config.panelMessageId) {
        const existing = await channel.messages.fetch(config.panelMessageId).catch(() => null);
        if (existing) {
            await existing.edit(payload);
            msg = existing;
        }
    }

    if (!msg) {
        msg = await channel.send(payload);
        updateTicketsSettings({ panelMessageId: msg.id });
    }

    addActivityLog({
        level: 'info',
        category: 'tickets',
        message: `Ticket panel sent/updated in #${channel.name}.`
    });

    return { ok: true, messageId: msg.id };
}

async function fetchTranscriptLines(channel) {
    const col = await channel.messages.fetch({ limit: 100 }).catch(() => null);
    if (!col) return { lines: ['(Nepodarilo sa načítať správy)'], count: 0 };

    const sorted = [...col.values()]
        .filter(m => !m.flags?.has(MessageFlags.Loading))
        .sort((a, b) => a.createdTimestamp - b.createdTimestamp);
    const lines = sorted.map(m => {
        const ts = new Date(m.createdTimestamp).toLocaleString('sk-SK');
        const author = m.author?.tag || 'Neznámy';
        const textParts = [];
        const bodyText = (m.cleanContent || m.content || '').trim();
        if (bodyText) textParts.push(bodyText);
        if (m.embeds?.length) {
            const titles = m.embeds.map(e => e.title || e.description?.slice(0, 60)).filter(Boolean);
            if (titles.length) textParts.push(`[Embed: ${titles.join(' | ')}]`);
        }
        if (m.attachments?.size) {
            textParts.push(`[Prílohy: ${[...m.attachments.values()].map(a => a.url).join(', ')}]`);
        }
        if (m.stickers?.size) {
            textParts.push(`[Nálepky: ${[...m.stickers.values()].map(s => s.name).join(', ')}]`);
        }
        return `[${ts}] ${author}: ${textParts.join(' ') || '(prázdna správa)'}`;
    });

    return { lines, count: sorted.length };
}

async function closeTicketChannel(client, channelId, closedByLabel, interaction = null) {
    const ticket = getOpenTicket(channelId);
    if (!ticket) {
        return { ok: false, reason: 'not_found' };
    }

    const config = getTicketsSettings();
    const guild = client.guilds.cache.get(ticket.guildId)
        || await client.guilds.fetch(ticket.guildId).catch(() => null);
    const channel = guild
        ? (guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId).catch(() => null))
        : null;

    const numStr = String(ticket.number || 0).padStart(3, '0');
    let msgCount = 0;

    if (channel && channel.isTextBased()) {
        const transcript = await fetchTranscriptLines(channel);
        msgCount = transcript.count;

        if (config.logChannelId) {
            const logChannel = guild.channels.cache.get(config.logChannelId)
                || await guild.channels.fetch(config.logChannelId).catch(() => null);
            if (logChannel && logChannel.isTextBased()) {
                const headerLines = [
                    `=== TICKET #${numStr} TRANSCRIPT ===`,
                    `Predmet: ${ticket.subject || 'Bez predmetu'}`,
                    `Autor: ${ticket.userId}`,
                    `Vytvorený: ${new Date(ticket.createdAt || Date.now()).toLocaleString('sk-SK')}`,
                    `Zatvoril: ${closedByLabel}`,
                    `====================================`,
                    ''
                ];
                const fileText = [...headerLines, ...transcript.lines].join('\n');
                const attachment = new AttachmentBuilder(Buffer.from(fileText, 'utf8'), {
                    name: `transcript-ticket-${numStr}.txt`
                });

                const summaryEmbed = new EmbedBuilder()
                    .setTitle(`🔒 Ticket #${numStr} zatvorený`)
                    .setColor(0xED4245)
                    .addFields(
                        { name: 'Autor', value: `<@${ticket.userId}>`, inline: true },
                        { name: 'Zatvoril', value: String(closedByLabel || 'Systém'), inline: true },
                        { name: 'Prevzal', value: ticket.claimedById ? `<@${ticket.claimedById}>` : '*Nikto*', inline: true },
                        { name: 'Predmet', value: ticket.subject || '*Neuvedený*', inline: false },
                        { name: 'Správy v logu', value: String(msgCount), inline: true }
                    )
                    .setTimestamp();

                await logChannel.send({ embeds: [summaryEmbed], files: [attachment] }).catch(err => {
                    addThrottledErrorLog({
                        key: `tickets:transcript:${logChannel.id}`,
                        category: 'tickets',
                        message: `Failed to send ticket #${numStr} transcript to #${logChannel.name || logChannel.id}: ${err?.message || err}`
                    });
                    return null;
                });
            }
        }
    }

    deleteOpenTicket(channelId);
    addActivityLog({
        level: 'warn',
        category: 'tickets',
        message: `Ticket #${numStr} (${ticket.subject || 'no subject'}) closed (${closedByLabel}).`
    });

    if (interaction) {
        if (interaction.deferred || interaction.replied) {
            await interaction.editReply({ content: '🔒 Ticket sa zatvára o 2 sekundy...' }).catch(() => null);
        } else {
            await interaction.reply({ content: '🔒 Ticket sa zatvára o 2 sekundy...' }).catch(() => null);
        }
        if (channel) {
            setTimeout(() => {
                suppressNextAdminLogEvent(guild.id, 'channelDelete', channel.id);
                channel.delete(`Ticket #${numStr} zatvorený (${closedByLabel})`).catch(() => null);
            }, 2000);
        }
    } else if (channel) {
        suppressNextAdminLogEvent(guild.id, 'channelDelete', channel.id);
        await channel.delete(`Ticket #${numStr} zatvorený (${closedByLabel})`).catch(() => null);
    }

    return { ok: true, number: ticket.number };
}

async function findExistingUserOpenTicket(guild, userId) {
    const allOpen = getAllOpenTickets();
    for (const [channelId, ticket] of Object.entries(allOpen)) {
        if (!ticket || ticket.guildId !== guild.id || ticket.userId !== userId) continue;
        const ch = guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId).catch(() => null);
        if (ch) return ch;
        deleteOpenTicket(channelId);
    }
    return null;
}

async function handleTicketInteraction(interaction) {
    const config = getTicketsSettings();
    const guild = interaction.guild;
    if (!guild) return;

    if (interaction.isButton() && interaction.customId === 'ticket:open') {
        if (!config.enabled) {
            return interaction.reply({ content: 'Ticket systém je momentálne vypnutý.', ephemeral: true });
        }

        const existingChannel = await findExistingUserOpenTicket(guild, interaction.user.id);
        if (existingChannel) {
            return interaction.reply({
                content: `Už máš otvorený ticket: <#${existingChannel.id}>`,
                ephemeral: true
            });
        }

        const modal = new ModalBuilder()
            .setCustomId('ticket:create_modal')
            .setTitle('Nový ticket');

        const subjectInput = new TextInputBuilder()
            .setCustomId('ticket_subject')
            .setLabel('Predmet / dôvod ticketu')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(100)
            .setPlaceholder('Napr. Nahlásenie hráča, problém s rankom...');

        const detailsInput = new TextInputBuilder()
            .setCustomId('ticket_details')
            .setLabel('Podrobnosti (voliteľné)')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(false)
            .setMaxLength(1000)
            .setPlaceholder('Popíš situáciu, prilož Steam link alebo čas...');

        modal.addComponents(
            new ActionRowBuilder().addComponents(subjectInput),
            new ActionRowBuilder().addComponents(detailsInput)
        );

        return interaction.showModal(modal);
    }

    if (interaction.isModalSubmit() && interaction.customId === 'ticket:create_modal') {
        await interaction.deferReply({ ephemeral: true });

        if (!config.enabled) {
            return interaction.editReply('Ticket systém je momentálne vypnutý.');
        }

        const existingChannel = await findExistingUserOpenTicket(guild, interaction.user.id);
        if (existingChannel) {
            return interaction.editReply(`Už máš otvorený ticket: <#${existingChannel.id}>`);
        }

        const subject = interaction.fields.getTextInputValue('ticket_subject').trim();
        const details = interaction.fields.getTextInputValue('ticket_details').trim();

        let parentId = undefined;
        if (config.categoryId) {
            const cat = guild.channels.cache.get(config.categoryId)
                || await guild.channels.fetch(config.categoryId).catch(() => null);
            if (cat && cat.type === ChannelType.GuildCategory) {
                parentId = cat.id;
            }
        }

        const nextNumber = (Number(config.ticketCounter) || 0) + 1;
        const numStr = String(nextNumber).padStart(3, '0');
        const channelName = `ticket-${numStr}-${slugifyChannelPart(interaction.user.username)}`;

        const permissionOverwrites = [
            {
                id: guild.roles.everyone.id,
                deny: [PermissionFlagsBits.ViewChannel]
            },
            {
                id: guild.members.me.id,
                allow: [
                    PermissionFlagsBits.ViewChannel,
                    PermissionFlagsBits.SendMessages,
                    PermissionFlagsBits.ReadMessageHistory,
                    PermissionFlagsBits.ManageChannels,
                    PermissionFlagsBits.EmbedLinks,
                    PermissionFlagsBits.AttachFiles
                ]
            },
            {
                id: interaction.user.id,
                allow: [
                    PermissionFlagsBits.ViewChannel,
                    PermissionFlagsBits.SendMessages,
                    PermissionFlagsBits.ReadMessageHistory,
                    PermissionFlagsBits.AttachFiles
                ]
            }
        ];

        const validSupportRoleIds = [];
        for (const roleId of config.supportRoleIds || []) {
            const r = guild.roles.cache.get(roleId) || await guild.roles.fetch(roleId).catch(() => null);
            if (r && r.id !== guild.id) {
                validSupportRoleIds.push(r.id);
                permissionOverwrites.push({
                    id: r.id,
                    allow: [
                        PermissionFlagsBits.ViewChannel,
                        PermissionFlagsBits.SendMessages,
                        PermissionFlagsBits.ReadMessageHistory,
                        PermissionFlagsBits.AttachFiles
                    ]
                });
            }
        }

        let createdChannel;
        try {
            createdChannel = await guild.channels.create({
                name: channelName,
                type: ChannelType.GuildText,
                parent: parentId,
                permissionOverwrites
            });
            suppressNextAdminLogEvent(guild.id, 'channelCreate', createdChannel.id);
        } catch (err) {
            console.error('Chyba pri vytváraní ticket kanála:', err);
            addThrottledErrorLog({
                key: `tickets:create:${guild.id}`,
                category: 'tickets',
                message: `Failed to create ticket channel: ${err?.message || err}`,
                targetUserId: interaction.user.id
            });
            return interaction.editReply('Nepodarilo sa vytvoriť súkromný ticket kanál (skontroluj oprávnenie Manage Channels).');
        }

        updateTicketsSettings({ ticketCounter: nextNumber });
        setOpenTicket(createdChannel.id, {
            guildId: guild.id,
            channelId: createdChannel.id,
            number: nextNumber,
            userId: interaction.user.id,
            subject,
            claimedById: null,
            createdAt: Date.now()
        });

        const mentionParts = [`<@${interaction.user.id}>`, ...validSupportRoleIds.map(id => `<@&${id}>`)];
        const introEmbed = new EmbedBuilder()
            .setTitle(`🎫 Ticket #${numStr} — ${subject}`.slice(0, 256))
            .setDescription(details || '*Bez ďalších podrobností.*')
            .setColor(hexToInt(config.panelColor, 0x5865F2))
            .addFields(
                { name: 'Autor', value: `<@${interaction.user.id}>`, inline: true },
                { name: 'Stav', value: '🟢 Otvorený', inline: true }
            )
            .setTimestamp();

        await createdChannel.send({
            content: mentionParts.join(' '),
            embeds: [introEmbed],
            components: [buildTicketControlRow(null)]
        }).catch(err => {
            addThrottledErrorLog({
                key: `tickets:intro:${createdChannel.id}`,
                category: 'tickets',
                message: `Failed to send ticket #${numStr} intro message: ${err?.message || err}`
            });
            return null;
        });

        addActivityLog({
            level: 'info',
            category: 'tickets',
            message: `Created ticket #${numStr} (${subject}) by ${interaction.user.tag}.`
        });

        return interaction.editReply(`Tvoj ticket bol vytvorený: <#${createdChannel.id}>`);
    }

    if (interaction.isButton() && interaction.customId === 'ticket:claim') {
        const ticket = getOpenTicket(interaction.channelId);
        if (!ticket) {
            return interaction.reply({ content: 'Tento kanál nie je evidovaný ako aktívny ticket.', ephemeral: true });
        }
        if (!isTicketStaff(interaction.member, config)) {
            return interaction.reply({ content: 'Prevziať ticket môže iba support tím alebo administrátor.', ephemeral: true });
        }

        ticket.claimedById = interaction.user.id;
        setOpenTicket(interaction.channelId, ticket);

        await interaction.update({ components: [buildTicketControlRow(interaction.user.id)] }).catch(() => null);
        await interaction.channel.send({
            embeds: [
                new EmbedBuilder()
                    .setColor(0x57F287)
                    .setDescription(`🙋 Ticket prevzal <@${interaction.user.id}>.`)
            ]
        }).catch(() => null);

        addActivityLog({
            level: 'info',
            category: 'tickets',
            message: `Ticket #${String(ticket.number || 0).padStart(3, '0')} claimed by ${interaction.user.tag}.`
        });
        return;
    }

    if (interaction.isButton() && interaction.customId === 'ticket:close') {
        const ticket = getOpenTicket(interaction.channelId);
        if (!ticket) {
            return interaction.reply({ content: 'Tento kanál nie je evidovaný ako aktívny ticket.', ephemeral: true });
        }
        if (interaction.user.id !== ticket.userId && !isTicketStaff(interaction.member, config)) {
            return interaction.reply({ content: 'Ticket môže zatvoriť iba jeho autor alebo support tím.', ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: true });
        return closeTicketChannel(interaction.client, interaction.channelId, interaction.user.tag, interaction);
    }
}

module.exports = {
    isTicketStaff,
    sendOrUpdateTicketPanel,
    closeTicketChannel,
    handleTicketInteraction
};
