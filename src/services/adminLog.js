const { EmbedBuilder, PermissionFlagsBits, AuditLogEvent, ChannelType } = require('discord.js');
const { getAdminLogSettings, getTempRoom, getOpenTicket } = require('../storage/settingsStore');
const { addActivityLog, addThrottledErrorLog } = require('./activityLog');

const SUPPRESS_TTL_MS = 15000;
const suppressedGatewayEvents = new Map();

function suppressNextAdminLogEvent(guildId, eventType, userId) {
    if (!guildId || !eventType || !userId) return;
    suppressedGatewayEvents.set(`${guildId}:${eventType}:${userId}`, Date.now() + SUPPRESS_TTL_MS);
    if (suppressedGatewayEvents.size > 200) {
        const now = Date.now();
        for (const [key, expiresAt] of suppressedGatewayEvents.entries()) {
            if (expiresAt <= now) suppressedGatewayEvents.delete(key);
        }
    }
}

function consumeSuppressedAdminLogEvent(guildId, eventType, userId) {
    if (!guildId || !eventType || !userId) return false;
    const key = `${guildId}:${eventType}:${userId}`;
    const expiresAt = suppressedGatewayEvents.get(key);
    if (!expiresAt) return false;
    suppressedGatewayEvents.delete(key);
    return expiresAt > Date.now();
}

function isAdminLogChannel(config, channelId) {
    if (!config || !channelId) return false;
    if (config.channelId === channelId) return true;
    return Object.values(config.eventChannels || {}).includes(channelId);
}

function isIgnoredChannel(config, channelId) {
    if (!channelId) return false;
    if (isAdminLogChannel(config, channelId)) return true;
    return Array.isArray(config?.ignoredChannelIds) && config.ignoredChannelIds.includes(channelId);
}

async function getAdminLogChannel(guild, eventKey = null) {
    const config = getAdminLogSettings();
    if (!config?.enabled || !guild) return null;

    const targetChannelId = (eventKey && config.eventChannels?.[eventKey]) || config.channelId;
    if (!targetChannelId) return null;

    const channel = guild.channels.cache.get(targetChannelId)
        || await guild.channels.fetch(targetChannelId).catch(() => null);
    if (!channel || !channel.isTextBased()) return null;
    return { channel, config };
}

async function sendAdminLogEmbed(channel, embed, contextLabel = 'event') {
    try {
        await channel.send({ embeds: [embed] });
        return true;
    } catch (err) {
        console.error(`[AdminLog] Chyba pri odosielaní (${contextLabel}):`, err);
        addThrottledErrorLog({
            key: `adminlog:send:${channel.id}`,
            category: 'adminlog',
            message: `Failed to send Admin Log (${contextLabel}) to #${channel.name || channel.id}: ${err?.message || err}`
        });
        return false;
    }
}

async function fetchRecentAuditEntry(guild, eventType, targetId) {
    if (!guild?.members?.me?.permissions.has(PermissionFlagsBits.ViewAuditLog)) {
        return null;
    }

    try {
        const logs = await guild.fetchAuditLogs({ type: eventType, limit: 5 });
        const now = Date.now();
        return logs.entries.find(
            entry => entry.targetId === targetId && (now - entry.createdTimestamp) < 12000
        ) || null;
    } catch {
        return null;
    }
}

async function logMemberJoin(member, inviteInfo = null) {
    if (!member?.guild || !member.user) return;
    const ctx = await getAdminLogChannel(member.guild, 'memberJoin');
    if (!ctx || !ctx.config.events?.memberJoin) return;

    const createdUnix = Math.floor(member.user.createdTimestamp / 1000);
    const embed = new EmbedBuilder()
        .setTitle('📥 Člen sa pripojil na server')
        .setColor(0x57F287)
        .setThumbnail(member.displayAvatarURL({ size: 128 }))
        .addFields(
            { name: 'Používateľ', value: `<@${member.id}> (${member.user.tag})`, inline: true },
            { name: 'Typ účtu', value: member.user.bot ? '🤖 Bot' : '👤 Používateľ', inline: true },
            { name: 'Vytvorený účet', value: `<t:${createdUnix}:R>`, inline: true }
        )
        .setFooter({ text: `ID: ${member.id} • Počet členov: ${member.guild.memberCount}` })
        .setTimestamp();

    if (inviteInfo?.code) {
        embed.addFields({
            name: 'Pozvánka',
            value: inviteInfo.inviterId
                ? `\`${inviteInfo.code}\` od <@${inviteInfo.inviterId}> (${inviteInfo.uses}×)`
                : `\`${inviteInfo.code}\` (${inviteInfo.uses}×)`,
            inline: false
        });
    }

    await sendAdminLogEmbed(ctx.channel, embed, 'memberJoin');
    const inviteSuffix = inviteInfo?.code
        ? ` via invite ${inviteInfo.code}${inviteInfo.inviterTag ? ` by ${inviteInfo.inviterTag}` : ''}`
        : '';
    addActivityLog({
        level: 'info',
        category: 'adminlog',
        message: `Joined ${member.user.tag} (${member.user.bot ? 'bot' : 'user'})${inviteSuffix}.`,
        targetUserId: member.id
    });
}

async function logMemberLeave(member) {
    if (!member?.guild || !member.user) return;
    if (consumeSuppressedAdminLogEvent(member.guild.id, 'memberLeave', member.id)) return;
    const ctx = await getAdminLogChannel(member.guild, 'memberLeave');
    if (!ctx || !ctx.config.events?.memberLeave) return;

    const kickAudit = await fetchRecentAuditEntry(member.guild, AuditLogEvent.MemberKick, member.id);
    const isKick = Boolean(kickAudit);

    const roleMentions = member.roles?.cache
        ? [...member.roles.cache.values()]
            .filter(r => r.id !== member.guild.id)
            .slice(0, 10)
            .map(r => `<@&${r.id}>`)
        : [];

    const embed = new EmbedBuilder()
        .setTitle(isKick ? '👢 Člen bol vyhodený (Kick)' : '📤 Člen opustil server')
        .setColor(isKick ? 0xF5A623 : 0xED4245)
        .setThumbnail(member.user.displayAvatarURL({ size: 128 }))
        .addFields(
            { name: 'Používateľ', value: `<@${member.id}> (${member.user.tag})`, inline: true },
            { name: 'Roly', value: roleMentions.length > 0 ? roleMentions.join(', ') : '*Žiadne*', inline: false }
        )
        .setFooter({ text: `ID: ${member.id} • Počet členov: ${member.guild.memberCount}` })
        .setTimestamp();

    if (isKick && kickAudit.executor) {
        embed.addFields(
            { name: 'Moderátor', value: `<@${kickAudit.executor.id}>`, inline: true },
            { name: 'Dôvod', value: kickAudit.reason || '*Neuvedený*', inline: true }
        );
    }

    await sendAdminLogEmbed(ctx.channel, embed, 'memberLeave');
    addActivityLog({
        level: isKick ? 'warn' : 'info',
        category: 'adminlog',
        message: isKick ? `Kicked: ${member.user.tag}` : `Left ${member.user.tag}.`
    });
}

async function logBanAdd(ban) {
    if (!ban?.guild || !ban.user) return;
    if (consumeSuppressedAdminLogEvent(ban.guild.id, 'banAdd', ban.user.id)) return;
    const ctx = await getAdminLogChannel(ban.guild, 'bans');
    if (!ctx || !ctx.config.events?.bans) return;

    const audit = await fetchRecentAuditEntry(ban.guild, AuditLogEvent.MemberBanAdd, ban.user.id);
    const reason = audit?.reason || ban.reason || '*Neuvedený*';

    const embed = new EmbedBuilder()
        .setTitle('🔨 Používateľ dostal Ban')
        .setColor(0xED4245)
        .setThumbnail(ban.user.displayAvatarURL({ size: 128 }))
        .addFields(
            { name: 'Používateľ', value: `<@${ban.user.id}> (${ban.user.tag})`, inline: true },
            { name: 'Moderátor', value: audit?.executor ? `<@${audit.executor.id}>` : '*Neznámy (chýba View Audit Log)*', inline: true },
            { name: 'Dôvod', value: reason, inline: false }
        )
        .setFooter({ text: `ID: ${ban.user.id}` })
        .setTimestamp();

    await sendAdminLogEmbed(ctx.channel, embed, 'memberLeave');
    addActivityLog({
        level: 'warn',
        category: 'adminlog',
        message: `Banned ${ban.user.tag}.`
    });
}

async function logBanRemove(ban) {
    if (!ban?.guild || !ban.user) return;
    if (consumeSuppressedAdminLogEvent(ban.guild.id, 'banRemove', ban.user.id)) return;
    const ctx = await getAdminLogChannel(ban.guild, 'bans');
    if (!ctx || !ctx.config.events?.bans) return;

    const audit = await fetchRecentAuditEntry(ban.guild, AuditLogEvent.MemberBanRemove, ban.user.id);

    const embed = new EmbedBuilder()
        .setTitle('🕊️ Používateľovi bol zrušený Ban')
        .setColor(0x57F287)
        .setThumbnail(ban.user.displayAvatarURL({ size: 128 }))
        .addFields(
            { name: 'Používateľ', value: `<@${ban.user.id}> (${ban.user.tag})`, inline: true },
            { name: 'Moderátor', value: audit?.executor ? `<@${audit.executor.id}>` : '*Neznámy*', inline: true }
        )
        .setFooter({ text: `ID: ${ban.user.id}` })
        .setTimestamp();

    await sendAdminLogEmbed(ctx.channel, embed, 'memberLeave');
    addActivityLog({
        level: 'info',
        category: 'adminlog',
        message: `Unbanned ${ban.user.tag}.`
    });
}

async function logMemberUpdate(oldMember, newMember) {
    if (!newMember?.guild || !newMember.user) return;
    const baseConfig = getAdminLogSettings();
    if (!baseConfig?.enabled) return;
    const events = baseConfig.events || {};

    // 1. Timeout zmeny
    const oldTimeout = oldMember.communicationDisabledUntilTimestamp || 0;
    const newTimeout = newMember.communicationDisabledUntilTimestamp || 0;

    if (oldTimeout !== newTimeout) {
        const suppressedTimeout = consumeSuppressedAdminLogEvent(newMember.guild.id, 'timeout', newMember.id);
        if (!suppressedTimeout && events.timeouts) {
            const timeoutCtx = await getAdminLogChannel(newMember.guild, 'timeouts');
            if (timeoutCtx) {
                const audit = await fetchRecentAuditEntry(newMember.guild, AuditLogEvent.MemberUpdate, newMember.id);
                const now = Date.now();
                const isMuted = newTimeout > now;

                const embed = new EmbedBuilder()
                    .setTitle(isMuted ? '🔇 Používateľ dostal Timeout' : '🔊 Timeout bol zrušený')
                    .setColor(isMuted ? 0xF5A623 : 0x57F287)
                    .setThumbnail(newMember.displayAvatarURL({ size: 128 }))
                    .addFields(
                        { name: 'Používateľ', value: `<@${newMember.id}> (${newMember.user.tag})`, inline: true },
                        { name: 'Moderátor', value: audit?.executor ? `<@${audit.executor.id}>` : '*Neznámy*', inline: true }
                    )
                    .setFooter({ text: `ID: ${newMember.id}` })
                    .setTimestamp();

                if (isMuted) {
                    embed.addFields(
                        { name: 'Vyprší', value: `<t:${Math.floor(newTimeout / 1000)}:R>`, inline: true },
                        { name: 'Dôvod', value: audit?.reason || '*Neuvedený*', inline: false }
                    );
                }

                await sendAdminLogEmbed(timeoutCtx.channel, embed, 'timeouts');
                addActivityLog({
                    level: isMuted ? 'warn' : 'info',
                    category: 'adminlog',
                    message: isMuted ? `Timed out ${newMember.user.tag}.` : `Removed timeout for ${newMember.user.tag}.`
                });
            }
        }
    }

    // 2. Zmeny rolí
    if (events.roleChanges) {
        const oldRoles = oldMember.roles.cache;
        const newRoles = newMember.roles.cache;

        const added = newRoles.filter(r => !oldRoles.has(r.id) && r.id !== newMember.guild.id);
        const removed = oldRoles.filter(r => !newRoles.has(r.id) && r.id !== newMember.guild.id);

        if (added.size > 0 || removed.size > 0) {
            const roleCtx = await getAdminLogChannel(newMember.guild, 'roleChanges');
            if (roleCtx) {
                const lines = [];
                if (added.size > 0) {
                    lines.push(`**Pridané:** ${added.map(r => `<@&${r.id}>`).join(', ')}`);
                }
                if (removed.size > 0) {
                    lines.push(`**Odobrané:** ${removed.map(r => `<@&${r.id}>`).join(', ')}`);
                }

                const embed = new EmbedBuilder()
                    .setTitle('🏷️ Zmena rolí člena')
                    .setColor(0x5865F2)
                    .setThumbnail(newMember.displayAvatarURL({ size: 128 }))
                    .setDescription(`<@${newMember.id}> (${newMember.user.tag})\n${lines.join('\n')}`)
                    .setFooter({ text: `ID: ${newMember.id}` })
                    .setTimestamp();

                await sendAdminLogEmbed(roleCtx.channel, embed, 'roleChanges');

                const summaryParts = [];
                if (added.size > 0) summaryParts.push(`added: ${added.map(r => `@${r.name}`).join(', ')}`);
                if (removed.size > 0) summaryParts.push(`removed: ${removed.map(r => `@${r.name}`).join(', ')}`);
                addActivityLog({
                    level: 'info',
                    category: 'adminlog',
                    message: `Role changes for ${newMember.user.tag} (${summaryParts.join('; ')}).`
                });
            }
        }
    }

    // 3. Zmena prezývky
    if (events.nicknameChanges && !oldMember.partial && oldMember.nickname !== newMember.nickname) {
        const nickCtx = await getAdminLogChannel(newMember.guild, 'nicknameChanges');
        if (nickCtx) {
            const audit = await fetchRecentAuditEntry(newMember.guild, AuditLogEvent.MemberUpdate, newMember.id);
            const embed = new EmbedBuilder()
                .setTitle('🏷️ Zmena prezývky')
                .setColor(0x5865F2)
                .setThumbnail(newMember.displayAvatarURL({ size: 128 }))
                .addFields(
                    { name: 'Používateľ', value: `<@${newMember.id}> (${newMember.user.tag})`, inline: true }
                )
                .setFooter({ text: `ID: ${newMember.id}` })
                .setTimestamp();

            if (audit?.executor && audit.executor.id !== newMember.id) {
                embed.addFields({ name: 'Zmenil', value: `<@${audit.executor.id}>`, inline: true });
            }
            embed.addFields(
                { name: 'Predtým', value: oldMember.nickname || '*Predvolené meno*', inline: false },
                { name: 'Potom', value: newMember.nickname || '*Predvolené meno*', inline: false }
            );

            await sendAdminLogEmbed(nickCtx.channel, embed, 'nicknameChanges');
            addActivityLog({
                level: 'info',
                category: 'adminlog',
                message: `Nickname changed for ${newMember.user.tag}: "${oldMember.nickname || newMember.user.username}" → "${newMember.nickname || newMember.user.username}".`,
                targetUserId: newMember.id
            });
        }
    }
}

async function logVoiceState(oldState, newState) {
    const member = newState.member || oldState.member;
    const guild = newState.guild || oldState.guild;
    if (!member || !guild || member.user?.bot) return;
    if (oldState.channelId === newState.channelId) return;

    const ctx = await getAdminLogChannel(guild, 'voiceActivity');
    if (!ctx || !ctx.config.events?.voiceActivity) return;
    if (isIgnoredChannel(ctx.config, newState.channelId || oldState.channelId) && (!oldState.channelId || isIgnoredChannel(ctx.config, oldState.channelId))) {
        return;
    }

    let title = '🎙️ Hlasová aktivita';
    let color = 0x5865F2;
    let desc = '';

    if (!oldState.channelId && newState.channelId) {
        title = '🔊 Pripojenie do voice kanála';
        color = 0x57F287;
        desc = `<@${member.id}> sa pripojil do <#${newState.channelId}>`;
    } else if (oldState.channelId && !newState.channelId) {
        title = '🔇 Odpojenie z voice kanála';
        color = 0xED4245;
        desc = `<@${member.id}> sa odpojil z <#${oldState.channelId}>`;
    } else {
        title = '🔀 Presun medzi voice kanálmi';
        color = 0xF5A623;
        desc = `<@${member.id}>: <#${oldState.channelId}> → <#${newState.channelId}>`;
    }

    const embed = new EmbedBuilder()
        .setTitle(title)
        .setColor(color)
        .setDescription(desc)
        .setFooter({ text: `ID: ${member.id}` })
        .setTimestamp();

    await sendAdminLogEmbed(ctx.channel, embed, 'memberLeave');

    let logMessage = '';
    if (!oldState.channelId && newState.channelId) {
        logMessage = `${member.user.tag} joined VC "${newState.channel?.name || newState.channelId}".`;
    } else if (oldState.channelId && !newState.channelId) {
        logMessage = `${member.user.tag} left VC "${oldState.channel?.name || oldState.channelId}".`;
    } else {
        logMessage = `${member.user.tag} moved from VC "${oldState.channel?.name || oldState.channelId}" to "${newState.channel?.name || newState.channelId}".`;
    }
    addActivityLog({
        level: 'info',
        category: 'adminlog',
        message: logMessage
    });
}

async function sendTestAdminLogMessage(guild) {
    const config = getAdminLogSettings();
    if (!config?.channelId) {
        return { ok: false, error: 'Select an Admin Log channel first.' };
    }

    const channel = guild.channels.cache.get(config.channelId)
        || await guild.channels.fetch(config.channelId).catch(() => null);
    if (!channel || !channel.isTextBased()) {
        return { ok: false, error: 'Configured channel was not found or is not a text channel.' };
    }

    const hasAuditPerm = Boolean(guild.members.me?.permissions.has(PermissionFlagsBits.ViewAuditLog));
    const embed = new EmbedBuilder()
        .setTitle('🛡️ Admin Log — Testovacia správa')
        .setColor(0x5865F2)
        .setDescription('Admin Log je správne prepojený s týmto kanálom.')
        .addFields({
            name: 'Právo View Audit Log',
            value: hasAuditPerm
                ? '🟢 Povolené (zobrazuje aj moderátora pri banoch/kickoch/timeoutoch)'
                : '🟡 Chýba (základné logy fungujú, ale bez mena moderátora)',
            inline: false
        })
        .setTimestamp();

    await channel.send({ embeds: [embed] });
    return { ok: true };
}

async function logModerationAction(guild, {
    eventKey = null,
    title,
    color = 0xF5A623,
    targetUser = null,
    targetId = null,
    moderatorText = 'Neznámy',
    reason = null,
    extraFields = []
} = {}) {
    if (!guild) return false;

    const ctx = await getAdminLogChannel(guild, eventKey);
    if (!ctx) return false;
    if (eventKey && !ctx.config.events?.[eventKey]) return false;

    const cleanTargetId = targetUser?.id || targetId;
    const embed = new EmbedBuilder()
        .setTitle(title || '🛡️ Moderácia')
        .setColor(color)
        .setTimestamp();

    if (targetUser && typeof targetUser.displayAvatarURL === 'function') {
        embed.setThumbnail(targetUser.displayAvatarURL({ size: 128 }));
    }

    if (cleanTargetId) {
        const tag = targetUser?.tag ? ` (${targetUser.tag})` : '';
        embed.addFields({ name: 'Používateľ', value: `<@${cleanTargetId}>${tag}`, inline: true });
        embed.setFooter({ text: `ID: ${cleanTargetId}` });
    }

    embed.addFields({ name: 'Moderátor', value: String(moderatorText || 'Neznámy'), inline: true });

    if (reason) {
        embed.addFields({ name: 'Dôvod', value: String(reason).slice(0, 1024), inline: false });
    }

    if (Array.isArray(extraFields) && extraFields.length > 0) {
        embed.addFields(...extraFields.slice(0, 10));
    }

    await sendAdminLogEmbed(ctx.channel, embed, 'memberLeave');
    return true;
}

function truncateText(text, max = 1000) {
    const clean = String(text || '').trim();
    if (!clean) return '*Bez textu*';
    return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

async function logMessageDelete(message) {
    if (!message?.guild) return;
    if (message.author?.bot) return;
    if (message.partial && !message.author && !message.content && !message.attachments?.size) return;

    const ctx = await getAdminLogChannel(message.guild, 'messageDelete');
    if (!ctx || !ctx.config.events?.messageDelete) return;
    if (isIgnoredChannel(ctx.config, message.channelId)) return;

    let deletedByField = null;
    if (message.author?.id && message.guild.members?.me?.permissions.has(PermissionFlagsBits.ViewAuditLog)) {
        try {
            const logs = await message.guild.fetchAuditLogs({ type: AuditLogEvent.MessageDelete, limit: 5 });
            const now = Date.now();
            const audit = logs.entries.find(
                entry =>
                    entry.targetId === message.author.id &&
                    entry.extra?.channel?.id === message.channelId &&
                    (now - entry.createdTimestamp) < 8000
            );
            if (audit?.executor && audit.executor.id !== message.author.id) {
                deletedByField = { name: 'Zmazal', value: `<@${audit.executor.id}>`, inline: true };
            }
        } catch {
            // Ignore audit log fetch failure
        }
    }

    const embed = new EmbedBuilder()
        .setTitle('🗑️ Zmazaná správa')
        .setColor(0xED4245)
        .addFields(
            {
                name: 'Autor',
                value: message.author ? `<@${message.author.id}> (${message.author.tag})` : '*Neznámy*',
                inline: true
            },
            { name: 'Kanál', value: `<#${message.channelId}>`, inline: true }
        )
        .setFooter({
            text: message.author ? `ID: ${message.author.id} • Správa: ${message.id}` : `Správa: ${message.id}`
        })
        .setTimestamp();

    if (message.author && typeof message.author.displayAvatarURL === 'function') {
        embed.setThumbnail(message.author.displayAvatarURL({ size: 128 }));
    }
    if (deletedByField) {
        embed.addFields(deletedByField);
    }
    embed.addFields({ name: 'Obsah', value: truncateText(message.content, 1000), inline: false });

    if (message.attachments?.size > 0) {
        const attachmentLines = [...message.attachments.values()]
            .slice(0, 5)
            .map(att => `[${att.name || 'súbor'}](${att.url})`)
            .join('\n');
        embed.addFields({ name: 'Prílohy', value: truncateText(attachmentLines, 1000), inline: false });
    }

    await sendAdminLogEmbed(ctx.channel, embed, 'memberLeave');

    const channelName = message.channel?.name || message.channelId;
    const authorTag = message.author?.tag || 'unknown user';
    addActivityLog({
        level: 'info',
        category: 'adminlog',
        message: `Deleted message by ${authorTag} in #${channelName}.`,
        targetUserId: message.author?.id || null
    });
}

async function logMessageBulkDelete(messages, channel) {
    if (!channel?.guild || !messages?.size) return;
    if (consumeSuppressedAdminLogEvent(channel.guild.id, 'messageBulkDelete', channel.id)) return;

    const ctx = await getAdminLogChannel(channel.guild, 'messageDelete');
    if (!ctx || !ctx.config.events?.messageDelete) return;
    if (isIgnoredChannel(ctx.config, channel.id)) return;

    const embed = new EmbedBuilder()
        .setTitle('🧹 Hromadné zmazanie správ')
        .setColor(0xED4245)
        .addFields(
            { name: 'Kanál', value: `<#${channel.id}>`, inline: true },
            { name: 'Počet', value: String(messages.size), inline: true }
        )
        .setTimestamp();

    await sendAdminLogEmbed(ctx.channel, embed, 'memberLeave');

    addActivityLog({
        level: 'info',
        category: 'adminlog',
        message: `Bulk deleted ${messages.size} messages in #${channel.name || channel.id}.`
    });
}

async function logMessageUpdate(oldMessage, newMessage) {
    if (!newMessage?.guild || newMessage.author?.bot) return;
    if (oldMessage?.partial || typeof oldMessage?.content !== 'string' || typeof newMessage.content !== 'string') {
        return;
    }
    if (oldMessage.content === newMessage.content) return;

    const ctx = await getAdminLogChannel(newMessage.guild, 'messageEdit');
    if (!ctx || !ctx.config.events?.messageEdit) return;
    if (isIgnoredChannel(ctx.config, newMessage.channelId)) return;

    const embed = new EmbedBuilder()
        .setTitle('✏️ Upravená správa')
        .setColor(0xF5A623)
        .addFields(
            {
                name: 'Autor',
                value: newMessage.author ? `<@${newMessage.author.id}> (${newMessage.author.tag})` : '*Neznámy*',
                inline: true
            },
            { name: 'Kanál', value: `<#${newMessage.channelId}>`, inline: true },
            { name: 'Predtým', value: truncateText(oldMessage.content, 1000), inline: false },
            { name: 'Potom', value: truncateText(newMessage.content, 1000), inline: false }
        )
        .setFooter({
            text: newMessage.author ? `ID: ${newMessage.author.id} • Správa: ${newMessage.id}` : `Správa: ${newMessage.id}`
        })
        .setTimestamp();

    if (newMessage.url) {
        embed.setDescription(`[Prejsť na správu](${newMessage.url})`);
    }
    if (newMessage.author && typeof newMessage.author.displayAvatarURL === 'function') {
        embed.setThumbnail(newMessage.author.displayAvatarURL({ size: 128 }));
    }

    await sendAdminLogEmbed(ctx.channel, embed, 'messageEdit');

    const channelName = newMessage.channel?.name || newMessage.channelId;
    const authorTag = newMessage.author?.tag || 'unknown user';
    addActivityLog({
        level: 'info',
        category: 'adminlog',
        message: `Edited message by ${authorTag} in #${channelName}.`,
        targetUserId: newMessage.author?.id || null
    });
}

function formatChannelTypeSk(type) {
    switch (type) {
        case ChannelType.GuildText:
            return 'Textový';
        case ChannelType.GuildVoice:
            return 'Hlasový';
        case ChannelType.GuildCategory:
            return 'Kategória';
        case ChannelType.GuildAnnouncement:
            return 'Oznamovací';
        case ChannelType.GuildForum:
            return 'Fórum';
        case ChannelType.GuildStageVoice:
            return 'Stage';
        default:
            return 'Kanál';
    }
}

async function logChannelCreate(channel) {
    if (!channel?.guild) return;
    await new Promise(r => setTimeout(r, 350));
    if (consumeSuppressedAdminLogEvent(channel.guild.id, 'channelCreate', channel.id)) return;
    if (getTempRoom(channel.id) || getOpenTicket(channel.id)) return;

    const ctx = await getAdminLogChannel(channel.guild, 'serverChanges');
    if (!ctx || !ctx.config.events?.serverChanges) return;

    const audit = await fetchRecentAuditEntry(channel.guild, AuditLogEvent.ChannelCreate, channel.id);
    const embed = new EmbedBuilder()
        .setTitle('➕ Vytvorený kanál')
        .setColor(0x57F287)
        .addFields(
            { name: 'Kanál', value: `<#${channel.id}> (${channel.name})`, inline: true },
            { name: 'Typ', value: formatChannelTypeSk(channel.type), inline: true }
        )
        .setFooter({ text: `ID: ${channel.id}` })
        .setTimestamp();

    if (audit?.executor) {
        embed.addFields({ name: 'Moderátor', value: `<@${audit.executor.id}>`, inline: true });
    }

    await sendAdminLogEmbed(ctx.channel, embed, 'channelCreate');
    addActivityLog({
        level: 'info',
        category: 'adminlog',
        message: `Created channel #${channel.name}.`
    });
}

async function logChannelDelete(channel) {
    if (!channel?.guild) return;
    if (consumeSuppressedAdminLogEvent(channel.guild.id, 'channelDelete', channel.id)) return;

    const ctx = await getAdminLogChannel(channel.guild, 'serverChanges');
    if (!ctx || !ctx.config.events?.serverChanges || isAdminLogChannel(ctx.config, channel.id)) return;

    const audit = await fetchRecentAuditEntry(channel.guild, AuditLogEvent.ChannelDelete, channel.id);
    const embed = new EmbedBuilder()
        .setTitle('🗑️ Zmazaný kanál')
        .setColor(0xED4245)
        .addFields(
            { name: 'Názov', value: `#${channel.name}`, inline: true },
            { name: 'Typ', value: formatChannelTypeSk(channel.type), inline: true }
        )
        .setFooter({ text: `ID: ${channel.id}` })
        .setTimestamp();

    if (audit?.executor) {
        embed.addFields({ name: 'Moderátor', value: `<@${audit.executor.id}>`, inline: true });
    }

    await sendAdminLogEmbed(ctx.channel, embed, 'channelDelete');
    addActivityLog({
        level: 'warn',
        category: 'adminlog',
        message: `Deleted channel #${channel.name}.`
    });
}

async function logChannelUpdate(oldChannel, newChannel) {
    if (!newChannel?.guild || !oldChannel?.name || oldChannel.name === newChannel.name) return;
    if (getTempRoom(newChannel.id) || getOpenTicket(newChannel.id)) return;

    const ctx = await getAdminLogChannel(newChannel.guild, 'serverChanges');
    if (!ctx || !ctx.config.events?.serverChanges) return;

    const audit = await fetchRecentAuditEntry(newChannel.guild, AuditLogEvent.ChannelUpdate, newChannel.id);
    const embed = new EmbedBuilder()
        .setTitle('✏️ Premenovaný kanál')
        .setColor(0xF5A623)
        .addFields(
            { name: 'Kanál', value: `<#${newChannel.id}>`, inline: true },
            { name: 'Predtým', value: oldChannel.name, inline: true },
            { name: 'Potom', value: newChannel.name, inline: true }
        )
        .setFooter({ text: `ID: ${newChannel.id}` })
        .setTimestamp();

    if (audit?.executor) {
        embed.addFields({ name: 'Moderátor', value: `<@${audit.executor.id}>`, inline: true });
    }

    await sendAdminLogEmbed(ctx.channel, embed, 'channelUpdate');
    addActivityLog({
        level: 'info',
        category: 'adminlog',
        message: `Renamed channel "${oldChannel.name}" → "${newChannel.name}".`
    });
}

async function logRoleCreate(role) {
    if (!role?.guild || role.id === role.guild.id) return;
    const ctx = await getAdminLogChannel(role.guild, 'serverChanges');
    if (!ctx || !ctx.config.events?.serverChanges) return;

    const audit = await fetchRecentAuditEntry(role.guild, AuditLogEvent.RoleCreate, role.id);
    const embed = new EmbedBuilder()
        .setTitle('➕ Vytvorená rola')
        .setColor(0x57F287)
        .addFields({ name: 'Rola', value: `<@&${role.id}> (${role.name})`, inline: true })
        .setFooter({ text: `ID: ${role.id}` })
        .setTimestamp();

    if (audit?.executor) {
        embed.addFields({ name: 'Moderátor', value: `<@${audit.executor.id}>`, inline: true });
    }

    await sendAdminLogEmbed(ctx.channel, embed, 'roleCreate');
    addActivityLog({
        level: 'info',
        category: 'adminlog',
        message: `Created role @${role.name}.`
    });
}

async function logRoleDelete(role) {
    if (!role?.guild || role.id === role.guild.id) return;
    const ctx = await getAdminLogChannel(role.guild, 'serverChanges');
    if (!ctx || !ctx.config.events?.serverChanges) return;

    const audit = await fetchRecentAuditEntry(role.guild, AuditLogEvent.RoleDelete, role.id);
    const embed = new EmbedBuilder()
        .setTitle('🗑️ Zmazaná rola')
        .setColor(0xED4245)
        .addFields({ name: 'Názov', value: `@${role.name}`, inline: true })
        .setFooter({ text: `ID: ${role.id}` })
        .setTimestamp();

    if (audit?.executor) {
        embed.addFields({ name: 'Moderátor', value: `<@${audit.executor.id}>`, inline: true });
    }

    await sendAdminLogEmbed(ctx.channel, embed, 'roleDelete');
    addActivityLog({
        level: 'warn',
        category: 'adminlog',
        message: `Deleted role @${role.name}.`
    });
}

async function logRoleUpdate(oldRole, newRole) {
    if (!newRole?.guild || newRole.id === newRole.guild.id || oldRole.name === newRole.name) return;
    const ctx = await getAdminLogChannel(newRole.guild, 'serverChanges');
    if (!ctx || !ctx.config.events?.serverChanges) return;

    const audit = await fetchRecentAuditEntry(newRole.guild, AuditLogEvent.RoleUpdate, newRole.id);
    const embed = new EmbedBuilder()
        .setTitle('✏️ Premenovaná rola')
        .setColor(0xF5A623)
        .addFields(
            { name: 'Rola', value: `<@&${newRole.id}>`, inline: true },
            { name: 'Predtým', value: oldRole.name, inline: true },
            { name: 'Potom', value: newRole.name, inline: true }
        )
        .setFooter({ text: `ID: ${newRole.id}` })
        .setTimestamp();

    if (audit?.executor) {
        embed.addFields({ name: 'Moderátor', value: `<@${audit.executor.id}>`, inline: true });
    }

    await sendAdminLogEmbed(ctx.channel, embed, 'roleUpdate');
    addActivityLog({
        level: 'info',
        category: 'adminlog',
        message: `Renamed role "@${oldRole.name}" → "@${newRole.name}".`
    });
}

module.exports = {
    logMemberJoin,
    logMemberLeave,
    logBanAdd,
    logBanRemove,
    logMemberUpdate,
    logVoiceState,
    logMessageDelete,
    logMessageBulkDelete,
    logMessageUpdate,
    logChannelCreate,
    logChannelDelete,
    logChannelUpdate,
    logRoleCreate,
    logRoleDelete,
    logRoleUpdate,
    sendTestAdminLogMessage,
    logModerationAction,
    suppressNextAdminLogEvent
};
