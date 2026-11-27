const { EmbedBuilder } = require('discord.js');
const { OWNER_ID } = require('../config');
const { getModerationSettings } = require('../storage/settingsStore');
const {
    addWarning,
    deleteWarning,
    clearUserWarnings
} = require('../storage/warningsStore');
const {
    recordModerationCase,
    setTempBan,
    deleteTempBan,
    getDueTempBans
} = require('../storage/moderationStore');
const { addActivityLog } = require('./activityLog');
const { logModerationAction, suppressNextAdminLogEvent } = require('./adminLog');

const MAX_TIMEOUT_MINUTES = 28 * 24 * 60; // 40320 minút (28 dní - limit Discord API)
const MAX_TEMPBAN_MINUTES = 365 * 24 * 60; // 365 dní

function parseDurationMinutes(raw) {
    const clean = String(raw || '').trim().toLowerCase();
    if (!clean) return null;
    const match = clean.match(/^(\d+)\s*(m|min|minut|minuty|minút|h|hod|hodin|hodiny|hodín|hr|hrs|d|den|deň|dni|dní|day|days)?$/i);
    if (!match) return null;
    const num = Number(match[1]);
    if (!Number.isFinite(num) || num <= 0) return null;
    const unit = (match[2] || 'm').toLowerCase();
    if (unit.startsWith('d')) return Math.round(num * 1440);
    if (unit.startsWith('h')) return Math.round(num * 60);
    return Math.round(num);
}

function isModerationCommandEnabled(modModuleKey) {
    const mod = getModerationSettings();
    if (!mod?.enabled) return false;
    if (!modModuleKey) return true;
    return mod.commands?.[modModuleKey] !== false;
}

function hasModerationAccess(member) {
    if (!member) return false;
    if (member.id === OWNER_ID || member.id === member.guild?.ownerId) return true;
    const mod = getModerationSettings();
    const roleIds = mod?.adminRoleIds || [];
    if (roleIds.length === 0) return false;
    return roleIds.some(roleId => member.roles?.cache?.has(roleId));
}

const pickLang = (lang, en, sk) => (lang === 'en' ? en : sk);

function canModerateTarget(guild, actorMember, targetMember, lang = 'sk') {
    if (!targetMember) return { ok: true };

    if (actorMember && actorMember.id === targetMember.id) {
        return { ok: false, error: pickLang(lang, 'You cannot perform this action on yourself.', 'Nemôžeš vykonať túto akciu sám na sebe.') };
    }
    if (targetMember.id === OWNER_ID || targetMember.id === guild.ownerId) {
        return { ok: false, error: pickLang(lang, 'Cannot moderate the server owner.', 'Nie je možné moderovať majiteľa servera.') };
    }

    const me = guild.members.me;
    const botId = me?.id || guild.client?.user?.id;
    if (botId && targetMember.id === botId) {
        return { ok: false, error: pickLang(lang, 'Cannot moderate the bot.', 'Nie je možné moderovať bota.') };
    }

    if (me && me.roles.highest.position <= targetMember.roles.highest.position) {
        return { ok: false, error: pickLang(lang, 'Bot role is too low to moderate this user.', 'Rola bota je príliš nízko na moderovanie tohto používateľa.') };
    }

    if (actorMember && actorMember.id !== OWNER_ID && actorMember.id !== guild.ownerId) {
        if (actorMember.roles.highest.position <= targetMember.roles.highest.position) {
            return { ok: false, error: pickLang(lang, 'Cannot moderate a user with an equal or higher role.', 'Nemôžeš moderovať používateľa s rovnakou alebo vyššou rolou.') };
        }
    }

    return { ok: true };
}

function formatDurationMinutes(minutes, lang = 'sk') {
    const m = Math.round(Number(minutes) || 0);
    if (m < 60) return `${m} min`;
    if (m % (24 * 60) === 0) {
        const d = m / (24 * 60);
        if (lang === 'en') return `${d} ${d === 1 ? 'day' : 'days'}`;
        return `${d} ${d === 1 ? 'deň' : (d < 5 ? 'dni' : 'dní')}`;
    }
    if (m % 60 === 0) {
        const h = m / 60;
        return lang === 'en' ? `${h} hr` : `${h} hod`;
    }
    const h = Math.floor(m / 60);
    const rem = m % 60;
    return lang === 'en' ? `${h}h ${rem}m` : `${h} hod ${rem} min`;
}

async function sendModDm(user, { guildName, title, color = 0xF5A623, reason = null, extra = null }) {
    const mod = getModerationSettings();
    if (!mod?.dmUser || !user || user.bot) return false;

    const embed = new EmbedBuilder()
        .setTitle(title)
        .setColor(color)
        .addFields({ name: 'Server', value: guildName || 'Discord server', inline: true })
        .setTimestamp();

    if (reason) {
        embed.addFields({ name: 'Dôvod', value: String(reason).slice(0, 1024), inline: false });
    }
    if (extra) {
        embed.addFields({ name: 'Detail', value: String(extra).slice(0, 1024), inline: false });
    }

    return user.send({ embeds: [embed] }).then(() => true).catch(() => false);
}

async function issueWarning({ guild, targetUser, targetMember = null, moderatorId = null, moderatorTag = 'Neznámy', actorMember = null, reason, lang = 'sk' }) {
    const member = targetMember || (targetUser?.id ? guild.members.cache.get(targetUser.id) : null);
    if (member) {
        const check = canModerateTarget(guild, actorMember, member, lang);
        if (!check.ok) return check;
    }

    const cleanReason = String(reason || '').trim().slice(0, 500) || 'Bez dôvodu';
    const userId = targetUser?.id || member?.id;
    const targetTag = targetUser?.tag || member?.user?.tag || `ID ${userId}`;

    const { warning, total } = addWarning(userId, {
        reason: cleanReason,
        moderatorId,
        moderatorTag
    });

    const modCase = recordModerationCase({
        action: 'warn',
        userId,
        userTag: targetTag,
        moderatorId,
        moderatorTag,
        reason: cleanReason
    });

    await sendModDm(targetUser || member?.user, {
        guildName: guild.name,
        title: '⚠️ Dostal si varovanie',
        color: 0xF5A623,
        reason: cleanReason,
        extra: `Počet varovaní: ${total} · Case #${modCase.caseId}`
    });

    const modText = moderatorId ? `<@${moderatorId}>` : moderatorTag;
    await logModerationAction(guild, {
        eventKey: 'warnings',
        title: `⚠️ Varovanie #${warning.id} · Case #${modCase.caseId}`,
        color: 0xF5A623,
        targetUser: targetUser || member?.user,
        targetId: userId,
        moderatorText: modText,
        reason: cleanReason,
        extraFields: [{ name: 'Celkom varovaní', value: String(total), inline: true }]
    });

    addActivityLog({
        level: 'warn',
        category: 'moderation',
        message: `Case #${modCase.caseId} — Warn #${warning.id} for ${targetTag}: ${cleanReason}`,
        actor: moderatorTag,
        targetUserId: userId
    });

    let escalation = null;
    const mod = getModerationSettings();
    if (mod?.autoEscalation?.enabled && member) {
        const rule = (mod.autoEscalation.rules || []).find(r => r.threshold === total);
        if (rule) {
            const botCheck = canModerateTarget(guild, null, member, lang);
            if (botCheck.ok) {
                const autoReason = `Auto-eskalácia po ${total} varovaniach`;
                if (rule.action === 'timeout') {
                    const mins = Math.min(Math.max(Number(rule.durationMinutes) || 60, 1), MAX_TIMEOUT_MINUTES);
                    suppressNextAdminLogEvent(guild.id, 'timeout', member.id);
                    const ok = await member.timeout(mins * 60 * 1000, autoReason).then(() => true).catch(() => false);
                    if (ok) {
                        const escCase = recordModerationCase({
                            action: 'timeout',
                            userId: member.id,
                            userTag: targetTag,
                            moderatorTag: 'Auto-escalation',
                            reason: autoReason,
                            durationMinutes: mins,
                            expiresAt: Date.now() + mins * 60 * 1000
                        });
                        await sendModDm(member.user, {
                            guildName: guild.name,
                            title: '🔇 Automatický timeout',
                            color: 0xF5A623,
                            reason: autoReason,
                            extra: `Trvanie: ${formatDurationMinutes(mins)} · Case #${escCase.caseId}`
                        });
                        await logModerationAction(guild, {
                            eventKey: 'timeouts',
                            title: `🔇 Auto-eskalácia — Timeout · Case #${escCase.caseId}`,
                            color: 0xF5A623,
                            targetUser: member.user,
                            targetId: member.id,
                            moderatorText: 'Automatický systém',
                            reason: autoReason,
                            extraFields: [{ name: 'Trvanie', value: formatDurationMinutes(mins), inline: true }]
                        });
                        addActivityLog({
                            level: 'warn',
                            category: 'moderation',
                            message: `Case #${escCase.caseId} — Auto-timeout (${formatDurationMinutes(mins, 'en')}) for ${targetTag} after ${total} warnings.`,
                            actor: 'Auto-escalation',
                            targetUserId: member.id
                        });
                        escalation = { action: 'timeout', durationMinutes: mins, caseId: escCase.caseId };
                    }
                } else if (rule.action === 'kick' && member.kickable) {
                    await sendModDm(member.user, {
                        guildName: guild.name,
                        title: '👢 Automatický kick',
                        color: 0xED4245,
                        reason: autoReason
                    });
                    suppressNextAdminLogEvent(guild.id, 'memberLeave', member.id);
                    const ok = await member.kick(autoReason).then(() => true).catch(() => false);
                    if (ok) {
                        const escCase = recordModerationCase({
                            action: 'kick',
                            userId: member.id,
                            userTag: targetTag,
                            moderatorTag: 'Auto-escalation',
                            reason: autoReason
                        });
                        await logModerationAction(guild, {
                            eventKey: 'memberLeave',
                            title: `👢 Auto-eskalácia — Kick · Case #${escCase.caseId}`,
                            color: 0xED4245,
                            targetUser: member.user,
                            targetId: member.id,
                            moderatorText: 'Automatický systém',
                            reason: autoReason
                        });
                        addActivityLog({
                            level: 'warn',
                            category: 'moderation',
                            message: `Case #${escCase.caseId} — Auto-kick for ${targetTag} after ${total} warnings.`,
                            actor: 'Auto-escalation',
                            targetUserId: member.id
                        });
                        escalation = { action: 'kick', caseId: escCase.caseId };
                    }
                } else if (rule.action === 'ban' && member.bannable) {
                    await sendModDm(member.user, {
                        guildName: guild.name,
                        title: '🔨 Automatický ban',
                        color: 0xED4245,
                        reason: autoReason
                    });
                    suppressNextAdminLogEvent(guild.id, 'banAdd', member.id);
                    const ok = await guild.members.ban(member.id, { reason: autoReason }).then(() => true).catch(() => false);
                    if (ok) {
                        const escCase = recordModerationCase({
                            action: 'ban',
                            userId: member.id,
                            userTag: targetTag,
                            moderatorTag: 'Auto-escalation',
                            reason: autoReason
                        });
                        await logModerationAction(guild, {
                            eventKey: 'bans',
                            title: `🔨 Auto-eskalácia — Ban · Case #${escCase.caseId}`,
                            color: 0xED4245,
                            targetUser: member.user,
                            targetId: member.id,
                            moderatorText: 'Automatický systém',
                            reason: autoReason
                        });
                        addActivityLog({
                            level: 'warn',
                            category: 'moderation',
                            message: `Case #${escCase.caseId} — Auto-ban for ${targetTag} after ${total} warnings.`,
                            actor: 'Auto-escalation',
                            targetUserId: member.id
                        });
                        escalation = { action: 'ban', caseId: escCase.caseId };
                    }
                }
            }
        }
    }

    return { ok: true, warning, total, escalation, caseId: modCase.caseId };
}

async function removeWarning({ guild, targetUserId, targetLabel = null, warningId, moderatorId = null, moderatorTag = 'Neznámy', lang = 'sk' }) {
    const res = deleteWarning(targetUserId, warningId);
    if (!res.removed) {
        return { ok: false, error: pickLang(lang, `Warning #${warningId} not found.`, `Varovanie #${warningId} sa nenašlo.`) };
    }

    const label = targetLabel || `ID ${targetUserId}`;
    await logModerationAction(guild, {
        eventKey: 'warnings',
        title: `🗑️ Odstránené varovanie #${res.removed.id}`,
        color: 0x57F287,
        targetId: targetUserId,
        moderatorText: moderatorId ? `<@${moderatorId}>` : moderatorTag,
        reason: res.removed.reason,
        extraFields: [{ name: 'Zostáva varovaní', value: String(res.remaining), inline: true }]
    });

    addActivityLog({
        level: 'info',
        category: 'moderation',
        message: `Removed warning #${res.removed.id} for ${label}.`,
        actor: moderatorTag,
        targetUserId
    });

    return { ok: true, removed: res.removed, remaining: res.remaining };
}

async function clearAllWarnings({ guild, targetUserId, targetLabel = null, moderatorId = null, moderatorTag = 'Neznámy', lang = 'sk' }) {
    const removedCount = clearUserWarnings(targetUserId);
    if (removedCount === 0) {
        return { ok: false, error: pickLang(lang, 'User has no warnings.', 'Používateľ nemá žiadne varovania.') };
    }

    const label = targetLabel || `ID ${targetUserId}`;
    await logModerationAction(guild, {
        eventKey: 'warnings',
        title: '🧹 Vymazané všetky varovania',
        color: 0x57F287,
        targetId: targetUserId,
        moderatorText: moderatorId ? `<@${moderatorId}>` : moderatorTag,
        extraFields: [{ name: 'Počet vymazaných', value: String(removedCount), inline: true }]
    });

    addActivityLog({
        level: 'info',
        category: 'moderation',
        message: `Cleared all warnings (${removedCount}) for ${label}.`,
        actor: moderatorTag,
        targetUserId
    });

    return { ok: true, removedCount };
}

async function applyTimeout({ guild, targetMember, durationMinutes, reason = 'Bez dôvodu', moderatorId = null, moderatorTag = 'Neznámy', actorMember = null, lang = 'sk' }) {
    if (!targetMember) {
        return { ok: false, error: pickLang(lang, 'User not found on the server.', 'Používateľ sa nenašiel na serveri.') };
    }
    const mins = Math.round(Number(durationMinutes));
    if (!Number.isFinite(mins) || mins < 1 || mins > MAX_TIMEOUT_MINUTES) {
        return { ok: false, error: pickLang(lang, 'Timeout duration must be between 1 and 40320 minutes.', 'Trvanie timeoutu musí byť 1 až 40320 minút.') };
    }

    const check = canModerateTarget(guild, actorMember, targetMember, lang);
    if (!check.ok) return check;
    if (!targetMember.moderatable) {
        return { ok: false, error: pickLang(lang, 'Bot lacks permission to time out this user.', 'Bot nemá oprávnenie udeliť timeout tomuto používateľovi.') };
    }

    const cleanReason = String(reason || '').trim().slice(0, 500) || 'Bez dôvodu';
    suppressNextAdminLogEvent(guild.id, 'timeout', targetMember.id);
    await targetMember.timeout(mins * 60 * 1000, cleanReason);

    const modCase = recordModerationCase({
        action: 'timeout',
        userId: targetMember.id,
        userTag: targetMember.user.tag,
        moderatorId,
        moderatorTag,
        reason: cleanReason,
        durationMinutes: mins,
        expiresAt: Date.now() + mins * 60 * 1000
    });

    const durLabel = formatDurationMinutes(mins);
    await sendModDm(targetMember.user, {
        guildName: guild.name,
        title: '🔇 Dostal si timeout',
        color: 0xF5A623,
        reason: cleanReason,
        extra: `Trvanie: ${durLabel} · Case #${modCase.caseId}`
    });

    await logModerationAction(guild, {
        eventKey: 'timeouts',
        title: `🔇 Timeout · Case #${modCase.caseId}`,
        color: 0xF5A623,
        targetUser: targetMember.user,
        targetId: targetMember.id,
        moderatorText: moderatorId ? `<@${moderatorId}>` : moderatorTag,
        reason: cleanReason,
        extraFields: [{ name: 'Trvanie', value: durLabel, inline: true }]
    });

    addActivityLog({
        level: 'warn',
        category: 'moderation',
        message: `Case #${modCase.caseId} — Timeout ${formatDurationMinutes(mins, 'en')} for ${targetMember.user.tag}: ${cleanReason}`,
        actor: moderatorTag,
        targetUserId: targetMember.id
    });

    return { ok: true, durationLabel: lang === 'en' ? formatDurationMinutes(mins, 'en') : durLabel, caseId: modCase.caseId };
}

async function removeTimeout({ guild, targetMember, reason = 'Zrušený timeout', moderatorId = null, moderatorTag = 'Neznámy', actorMember = null, lang = 'sk' }) {
    if (!targetMember) {
        return { ok: false, error: pickLang(lang, 'User not found on the server.', 'Používateľ sa nenašiel na serveri.') };
    }
    const check = canModerateTarget(guild, actorMember, targetMember, lang);
    if (!check.ok) return check;
    if (!targetMember.moderatable) {
        return { ok: false, error: pickLang(lang, 'Bot lacks permission to modify timeout for this user.', 'Bot nemá oprávnenie upraviť timeout tohto používateľa.') };
    }

    const cleanReason = String(reason || '').trim().slice(0, 500) || 'Zrušený timeout';
    suppressNextAdminLogEvent(guild.id, 'timeout', targetMember.id);
    await targetMember.timeout(null, cleanReason);

    const modCase = recordModerationCase({
        action: 'timeout_remove',
        userId: targetMember.id,
        userTag: targetMember.user.tag,
        moderatorId,
        moderatorTag,
        reason: cleanReason
    });

    await logModerationAction(guild, {
        eventKey: 'timeouts',
        title: `🔊 Timeout zrušený · Case #${modCase.caseId}`,
        color: 0x57F287,
        targetUser: targetMember.user,
        targetId: targetMember.id,
        moderatorText: moderatorId ? `<@${moderatorId}>` : moderatorTag,
        reason: cleanReason
    });

    addActivityLog({
        level: 'info',
        category: 'moderation',
        message: `Case #${modCase.caseId} — Removed timeout for ${targetMember.user.tag}.`,
        actor: moderatorTag,
        targetUserId: targetMember.id
    });

    return { ok: true, caseId: modCase.caseId };
}

async function kickMember({ guild, targetMember, reason = 'Bez dôvodu', moderatorId = null, moderatorTag = 'Neznámy', actorMember = null, lang = 'sk' }) {
    if (!targetMember) {
        return { ok: false, error: pickLang(lang, 'User not found on the server.', 'Používateľ sa nenašiel na serveri.') };
    }
    const check = canModerateTarget(guild, actorMember, targetMember, lang);
    if (!check.ok) return check;
    if (!targetMember.kickable) {
        return { ok: false, error: pickLang(lang, 'Bot lacks permission to kick this user.', 'Bot nemá oprávnenie vyhodiť tohto používateľa.') };
    }

    const cleanReason = String(reason || '').trim().slice(0, 500) || 'Bez dôvodu';
    const targetUser = targetMember.user;

    await sendModDm(targetUser, {
        guildName: guild.name,
        title: '👢 Bol si vyhodený zo servera',
        color: 0xF5A623,
        reason: cleanReason
    });

    suppressNextAdminLogEvent(guild.id, 'memberLeave', targetUser.id);
    await targetMember.kick(cleanReason);

    const modCase = recordModerationCase({
        action: 'kick',
        userId: targetUser.id,
        userTag: targetUser.tag,
        moderatorId,
        moderatorTag,
        reason: cleanReason
    });

    await logModerationAction(guild, {
        eventKey: 'memberLeave',
        title: `👢 Kick · Case #${modCase.caseId}`,
        color: 0xF5A623,
        targetUser,
        targetId: targetUser.id,
        moderatorText: moderatorId ? `<@${moderatorId}>` : moderatorTag,
        reason: cleanReason
    });

    addActivityLog({
        level: 'warn',
        category: 'moderation',
        message: `Case #${modCase.caseId} — Kicked ${targetUser.tag}: ${cleanReason}`,
        actor: moderatorTag,
        targetUserId: targetUser.id
    });

    return { ok: true, targetTag: targetUser.tag, caseId: modCase.caseId };
}

async function banMember({ guild, targetUser = null, targetMember = null, deleteMessageSeconds = 0, durationMinutes = null, reason = 'Bez dôvodu', moderatorId = null, moderatorTag = 'Neznámy', actorMember = null, lang = 'sk' }) {
    const member = targetMember || (targetUser?.id ? guild.members.cache.get(targetUser.id) : null);
    const userId = targetUser?.id || member?.id;
    if (!userId) {
        return { ok: false, error: pickLang(lang, 'User not specified.', 'Používateľ nebol zadaný.') };
    }

    if (userId === OWNER_ID || userId === guild.ownerId) {
        return { ok: false, error: pickLang(lang, 'Cannot ban the server owner.', 'Nie je možné zabanovať majiteľa servera.') };
    }
    const botId = guild.members.me?.id || guild.client?.user?.id;
    if (botId && userId === botId) {
        return { ok: false, error: pickLang(lang, 'Cannot ban the bot.', 'Nie je možné zabanovať bota.') };
    }
    if (actorMember && actorMember.id === userId) {
        return { ok: false, error: pickLang(lang, 'You cannot ban yourself.', 'Nemôžeš zabanovať sám seba.') };
    }

    let tempMins = null;
    if (durationMinutes !== null && durationMinutes !== undefined && durationMinutes !== '') {
        const parsed = Math.round(Number(durationMinutes));
        if (!Number.isFinite(parsed) || parsed < 1 || parsed > MAX_TEMPBAN_MINUTES) {
            return {
                ok: false,
                error: pickLang(lang, 'Tempban duration must be between 1 minute and 365 days.', 'Trvanie dočasného banu musí byť 1 minúta až 365 dní.')
            };
        }
        tempMins = parsed;
    }

    if (member) {
        const check = canModerateTarget(guild, actorMember, member, lang);
        if (!check.ok) return check;
        if (!member.bannable) {
            return { ok: false, error: pickLang(lang, 'Bot lacks permission to ban this user.', 'Bot nemá oprávnenie zabanovať tohto používateľa.') };
        }
    }

    const isTemp = Boolean(tempMins);
    const expiresAt = isTemp ? Date.now() + tempMins * 60 * 1000 : null;
    const durLabelSk = isTemp ? formatDurationMinutes(tempMins, 'sk') : null;
    const durLabelEn = isTemp ? formatDurationMinutes(tempMins, 'en') : null;
    const cleanReason = String(reason || '').trim().slice(0, 500) || 'Bez dôvodu';
    const userObj = targetUser || member?.user || null;
    const targetTag = userObj?.tag || `ID ${userId}`;

    if (userObj) {
        await sendModDm(userObj, {
            guildName: guild.name,
            title: isTemp ? '🔨 Dostal si dočasný ban' : '🔨 Bol si zabanovaný',
            color: 0xED4245,
            reason: cleanReason,
            extra: isTemp ? `Trvanie: ${durLabelSk}` : null
        });
    }

    const delSec = Math.min(Math.max(Math.round(Number(deleteMessageSeconds) || 0), 0), 604800);
    suppressNextAdminLogEvent(guild.id, 'banAdd', userId);
    await guild.members.ban(userId, { deleteMessageSeconds: delSec, reason: cleanReason });

    const modCase = recordModerationCase({
        action: isTemp ? 'tempban' : 'ban',
        userId,
        userTag: targetTag,
        moderatorId,
        moderatorTag,
        reason: cleanReason,
        durationMinutes: tempMins,
        expiresAt
    });

    if (isTemp) {
        setTempBan(userId, {
            guildId: guild.id,
            userId,
            userTag: targetTag,
            caseId: modCase.caseId,
            reason: cleanReason,
            expiresAt,
            createdAt: Date.now()
        });
    } else {
        deleteTempBan(userId);
    }

    const extraFields = isTemp
        ? [
            { name: 'Trvanie', value: durLabelSk, inline: true },
            { name: 'Vyprší', value: `<t:${Math.floor(expiresAt / 1000)}:R>`, inline: true }
        ]
        : [];

    await logModerationAction(guild, {
        eventKey: 'bans',
        title: `${isTemp ? '⏳ Tempban' : '🔨 Ban'} · Case #${modCase.caseId}`,
        color: 0xED4245,
        targetUser: userObj,
        targetId: userId,
        moderatorText: moderatorId ? `<@${moderatorId}>` : moderatorTag,
        reason: cleanReason,
        extraFields
    });

    addActivityLog({
        level: 'warn',
        category: 'moderation',
        message: isTemp
            ? `Case #${modCase.caseId} — Tempban (${durLabelEn}) for ${targetTag}: ${cleanReason}`
            : `Case #${modCase.caseId} — Banned ${targetTag}: ${cleanReason}`,
        actor: moderatorTag,
        targetUserId: userId
    });

    return {
        ok: true,
        targetTag,
        caseId: modCase.caseId,
        expiresAt,
        durationLabel: isTemp ? (lang === 'en' ? durLabelEn : durLabelSk) : null
    };
}

async function unbanUser({ guild, userId, reason = 'Bez dôvodu', moderatorId = null, moderatorTag = 'Neznámy', lang = 'sk' }) {
    const cleanId = String(userId || '').trim();
    if (!/^\d{15,22}$/.test(cleanId)) {
        return { ok: false, error: pickLang(lang, 'Enter a valid Discord User ID.', 'Zadaj platné Discord User ID.') };
    }

    deleteTempBan(cleanId);

    const banInfo = await guild.bans.fetch(cleanId).catch(() => null);
    if (!banInfo) {
        return { ok: false, error: pickLang(lang, 'This user is not banned.', 'Tento používateľ nie je zabanovaný.') };
    }

    const cleanReason = String(reason || '').trim().slice(0, 500) || 'Bez dôvodu';
    suppressNextAdminLogEvent(guild.id, 'banRemove', cleanId);
    await guild.members.unban(cleanId, cleanReason);

    const modCase = recordModerationCase({
        action: 'unban',
        userId: cleanId,
        userTag: banInfo.user?.tag || `ID ${cleanId}`,
        moderatorId,
        moderatorTag,
        reason: cleanReason
    });

    await logModerationAction(guild, {
        eventKey: 'bans',
        title: `🕊️ Unban · Case #${modCase.caseId}`,
        color: 0x57F287,
        targetUser: banInfo.user,
        targetId: cleanId,
        moderatorText: moderatorId ? `<@${moderatorId}>` : moderatorTag,
        reason: cleanReason
    });

    addActivityLog({
        level: 'info',
        category: 'moderation',
        message: `Case #${modCase.caseId} — Unbanned ${banInfo.user?.tag || cleanId}: ${cleanReason}`,
        actor: moderatorTag,
        targetUserId: cleanId
    });

    return { ok: true, targetTag: banInfo.user?.tag || cleanId, caseId: modCase.caseId };
}

async function processExpiredTempBans(client) {
    const due = getDueTempBans(Date.now());
    if (due.length === 0) return;

    for (const tb of due) {
        const guild = (tb.guildId && (client.guilds.cache.get(tb.guildId) || await client.guilds.fetch(tb.guildId).catch(() => null)))
            || client.guilds.cache.first();
        if (!guild) continue;

        const existingBan = await guild.bans.fetch(tb.userId).catch(() => null);
        if (!existingBan) {
            deleteTempBan(tb.userId);
            continue;
        }

        await unbanUser({
            guild,
            userId: tb.userId,
            reason: tb.caseId ? `Vypršal dočasný ban (Case #${tb.caseId})` : 'Vypršal dočasný ban',
            moderatorTag: 'Auto-Unban'
        }).catch(err => {
            console.error(`Chyba pri automatickom unbane ${tb.userId}:`, err);
        });
    }
}

module.exports = {
    MAX_TIMEOUT_MINUTES,
    MAX_TEMPBAN_MINUTES,
    parseDurationMinutes,
    isModerationCommandEnabled,
    hasModerationAccess,
    canModerateTarget,
    formatDurationMinutes,
    issueWarning,
    removeWarning,
    clearAllWarnings,
    applyTimeout,
    removeTimeout,
    kickMember,
    banMember,
    unbanUser,
    processExpiredTempBans
};
