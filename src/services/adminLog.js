const { EmbedBuilder, PermissionFlagsBits, AuditLogEvent } = require('discord.js');
const { getAdminLogSettings } = require('../storage/settingsStore');
const { addActivityLog } = require('./activityLog');

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

async function getAdminLogChannel(guild) {
    const config = getAdminLogSettings();
    if (!config?.enabled || !config.channelId || !guild) return null;

    const channel = guild.channels.cache.get(config.channelId)
        || await guild.channels.fetch(config.channelId).catch(() => null);
    if (!channel || !channel.isTextBased()) return null;
    return { channel, config };
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

async function logMemberJoin(member) {
    if (!member?.guild || !member.user) return;
    const ctx = await getAdminLogChannel(member.guild);
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

    await ctx.channel.send({ embeds: [embed] }).catch(() => null);
    addActivityLog({
        level: 'info',
        category: 'adminlog',
        message: `Joined ${member.user.tag} (${member.user.bot ? 'bot' : 'user'}).`
    });
}

async function logMemberLeave(member) {
    if (!member?.guild || !member.user) return;
    if (consumeSuppressedAdminLogEvent(member.guild.id, 'memberLeave', member.id)) return;
    const ctx = await getAdminLogChannel(member.guild);
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

    await ctx.channel.send({ embeds: [embed] }).catch(() => null);
    addActivityLog({
        level: isKick ? 'warn' : 'info',
        category: 'adminlog',
        message: isKick ? `Kicked: ${member.user.tag}` : `Left ${member.user.tag}.`
    });
}

async function logBanAdd(ban) {
    if (!ban?.guild || !ban.user) return;
    if (consumeSuppressedAdminLogEvent(ban.guild.id, 'banAdd', ban.user.id)) return;
    const ctx = await getAdminLogChannel(ban.guild);
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

    await ctx.channel.send({ embeds: [embed] }).catch(() => null);
    addActivityLog({
        level: 'warn',
        category: 'adminlog',
        message: `Banned ${ban.user.tag}.`
    });
}

async function logBanRemove(ban) {
    if (!ban?.guild || !ban.user) return;
    if (consumeSuppressedAdminLogEvent(ban.guild.id, 'banRemove', ban.user.id)) return;
    const ctx = await getAdminLogChannel(ban.guild);
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

    await ctx.channel.send({ embeds: [embed] }).catch(() => null);
    addActivityLog({
        level: 'info',
        category: 'adminlog',
        message: `Unbanned ${ban.user.tag}.`
    });
}

async function logMemberUpdate(oldMember, newMember) {
    if (!newMember?.guild || !newMember.user) return;
    const ctx = await getAdminLogChannel(newMember.guild);
    if (!ctx) return;

    const events = ctx.config.events || {};

    // 1. Timeout zmeny
    const oldTimeout = oldMember.communicationDisabledUntilTimestamp || 0;
    const newTimeout = newMember.communicationDisabledUntilTimestamp || 0;

    if (oldTimeout !== newTimeout) {
        const suppressedTimeout = consumeSuppressedAdminLogEvent(newMember.guild.id, 'timeout', newMember.id);
        if (!suppressedTimeout && events.timeouts) {
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

            await ctx.channel.send({ embeds: [embed] }).catch(() => null);
            addActivityLog({
                level: isMuted ? 'warn' : 'info',
                category: 'adminlog',
                message: isMuted ? `Timed out ${newMember.user.tag}.` : `Removed timeout for ${newMember.user.tag}.`
            });
        }
    }

    // 2. Zmeny rolí
    if (events.roleChanges) {
        const oldRoles = oldMember.roles.cache;
        const newRoles = newMember.roles.cache;

        const added = newRoles.filter(r => !oldRoles.has(r.id) && r.id !== newMember.guild.id);
        const removed = oldRoles.filter(r => !newRoles.has(r.id) && r.id !== newMember.guild.id);

        if (added.size > 0 || removed.size > 0) {
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

            await ctx.channel.send({ embeds: [embed] }).catch(() => null);

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

async function logVoiceState(oldState, newState) {
    const member = newState.member || oldState.member;
    const guild = newState.guild || oldState.guild;
    if (!member || !guild || member.user?.bot) return;
    if (oldState.channelId === newState.channelId) return;

    const ctx = await getAdminLogChannel(guild);
    if (!ctx || !ctx.config.events?.voiceActivity) return;

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

    await ctx.channel.send({ embeds: [embed] }).catch(() => null);

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

    const ctx = await getAdminLogChannel(guild);
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

    await ctx.channel.send({ embeds: [embed] }).catch(() => null);
    return true;
}

module.exports = {
    logMemberJoin,
    logMemberLeave,
    logBanAdd,
    logBanRemove,
    logMemberUpdate,
    logVoiceState,
    sendTestAdminLogMessage,
    logModerationAction,
    suppressNextAdminLogEvent
};
