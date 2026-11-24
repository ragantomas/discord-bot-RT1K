const { EmbedBuilder } = require('discord.js');
const { OWNER_ID } = require('../config');
const { getModerationSettings } = require('../storage/settingsStore');
const {
    addWarning,
    deleteWarning,
    clearUserWarnings
} = require('../storage/warningsStore');
const { addActivityLog } = require('./activityLog');
const { logModerationAction } = require('./adminLog');

const MAX_TIMEOUT_MINUTES = 28 * 24 * 60; // 40320 minút (28 dní - limit Discord API)

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

function canModerateTarget(guild, actorMember, targetMember) {
    if (!targetMember) return { ok: true };

    if (actorMember && actorMember.id === targetMember.id) {
        return { ok: false, error: 'Nemôžeš vykonať túto akciu sám na sebe.' };
    }
    if (targetMember.id === OWNER_ID || targetMember.id === guild.ownerId) {
        return { ok: false, error: 'Nie je možné moderovať majiteľa servera.' };
    }

    const me = guild.members.me;
    if (me && me.roles.highest.position <= targetMember.roles.highest.position) {
        return { ok: false, error: 'Rola bota je príliš nízko na moderovanie tohto používateľa.' };
    }

    if (actorMember && actorMember.id !== OWNER_ID && actorMember.id !== guild.ownerId) {
        if (actorMember.roles.highest.position <= targetMember.roles.highest.position) {
            return { ok: false, error: 'Nemôžeš moderovať používateľa s rovnakou alebo vyššou rolou.' };
        }
    }

    return { ok: true };
}

function formatDurationMinutes(minutes) {
    const m = Math.round(Number(minutes) || 0);
    if (m < 60) return `${m} min`;
    if (m % (24 * 60) === 0) {
        const d = m / (24 * 60);
        return `${d} ${d === 1 ? 'deň' : (d < 5 ? 'dni' : 'dní')}`;
    }
    if (m % 60 === 0) {
        const h = m / 60;
        return `${h} hod`;
    }
    const h = Math.floor(m / 60);
    const rem = m % 60;
    return `${h} hod ${rem} min`;
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

async function issueWarning({ guild, targetUser, targetMember = null, moderatorId = null, moderatorTag = 'Neznámy', actorMember = null, reason }) {
    const member = targetMember || (targetUser?.id ? guild.members.cache.get(targetUser.id) : null);
    if (member) {
        const check = canModerateTarget(guild, actorMember, member);
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

    await sendModDm(targetUser || member?.user, {
        guildName: guild.name,
        title: '⚠️ Dostal si varovanie',
        color: 0xF5A623,
        reason: cleanReason,
        extra: `Počet varovaní: ${total}`
    });

    const modText = moderatorId ? `<@${moderatorId}>` : moderatorTag;
    await logModerationAction(guild, {
        title: `⚠️ Varovanie #${warning.id}`,
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
        message: `Warn #${warning.id} pre ${targetTag}: ${cleanReason}`,
        actor: moderatorTag,
        targetUserId: userId
    });

    let escalation = null;
    const mod = getModerationSettings();
    if (mod?.autoEscalation?.enabled && member) {
        const rule = (mod.autoEscalation.rules || []).find(r => r.threshold === total);
        if (rule) {
            const botCheck = canModerateTarget(guild, null, member);
            if (botCheck.ok) {
                const autoReason = `Auto-eskalácia po ${total} varovaniach`;
                if (rule.action === 'timeout') {
                    const mins = Math.min(Math.max(Number(rule.durationMinutes) || 60, 1), MAX_TIMEOUT_MINUTES);
                    const ok = await member.timeout(mins * 60 * 1000, autoReason).then(() => true).catch(() => false);
                    if (ok) {
                        await sendModDm(member.user, {
                            guildName: guild.name,
                            title: '🔇 Automatický timeout',
                            color: 0xF5A623,
                            reason: autoReason,
                            extra: `Trvanie: ${formatDurationMinutes(mins)}`
                        });
                        await logModerationAction(guild, {
                            title: '🔇 Auto-eskalácia — Timeout',
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
                            message: `Auto-timeout (${formatDurationMinutes(mins)}) pre ${targetTag} po ${total} varovaniach.`,
                            actor: 'Auto-eskalácia',
                            targetUserId: member.id
                        });
                        escalation = { action: 'timeout', durationMinutes: mins };
                    }
                } else if (rule.action === 'kick' && member.kickable) {
                    await sendModDm(member.user, {
                        guildName: guild.name,
                        title: '👢 Automatický kick',
                        color: 0xED4245,
                        reason: autoReason
                    });
                    const ok = await member.kick(autoReason).then(() => true).catch(() => false);
                    if (ok) {
                        await logModerationAction(guild, {
                            title: '👢 Auto-eskalácia — Kick',
                            color: 0xED4245,
                            targetUser: member.user,
                            targetId: member.id,
                            moderatorText: 'Automatický systém',
                            reason: autoReason
                        });
                        addActivityLog({
                            level: 'warn',
                            category: 'moderation',
                            message: `Auto-kick pre ${targetTag} po ${total} varovaniach.`,
                            actor: 'Auto-eskalácia',
                            targetUserId: member.id
                        });
                        escalation = { action: 'kick' };
                    }
                } else if (rule.action === 'ban' && member.bannable) {
                    await sendModDm(member.user, {
                        guildName: guild.name,
                        title: '🔨 Automatický ban',
                        color: 0xED4245,
                        reason: autoReason
                    });
                    const ok = await guild.members.ban(member.id, { reason: autoReason }).then(() => true).catch(() => false);
                    if (ok) {
                        await logModerationAction(guild, {
                            title: '🔨 Auto-eskalácia — Ban',
                            color: 0xED4245,
                            targetUser: member.user,
                            targetId: member.id,
                            moderatorText: 'Automatický systém',
                            reason: autoReason
                        });
                        addActivityLog({
                            level: 'warn',
                            category: 'moderation',
                            message: `Auto-ban pre ${targetTag} po ${total} varovaniach.`,
                            actor: 'Auto-eskalácia',
                            targetUserId: member.id
                        });
                        escalation = { action: 'ban' };
                    }
                }
            }
        }
    }

    return { ok: true, warning, total, escalation };
}

async function removeWarning({ guild, targetUserId, targetLabel = null, warningId, moderatorId = null, moderatorTag = 'Neznámy' }) {
    const res = deleteWarning(targetUserId, warningId);
    if (!res.removed) {
        return { ok: false, error: `Varovanie #${warningId} sa nenašlo.` };
    }

    const label = targetLabel || `ID ${targetUserId}`;
    await logModerationAction(guild, {
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
        message: `Odstránený warn #${res.removed.id} pre ${label}.`,
        actor: moderatorTag,
        targetUserId
    });

    return { ok: true, removed: res.removed, remaining: res.remaining };
}

async function clearAllWarnings({ guild, targetUserId, targetLabel = null, moderatorId = null, moderatorTag = 'Neznámy' }) {
    const removedCount = clearUserWarnings(targetUserId);
    if (removedCount === 0) {
        return { ok: false, error: 'Používateľ nemá žiadne varovania.' };
    }

    const label = targetLabel || `ID ${targetUserId}`;
    await logModerationAction(guild, {
        title: '🧹 Vymazané všetky varovania',
        color: 0x57F287,
        targetId: targetUserId,
        moderatorText: moderatorId ? `<@${moderatorId}>` : moderatorTag,
        extraFields: [{ name: 'Počet vymazaných', value: String(removedCount), inline: true }]
    });

    addActivityLog({
        level: 'info',
        category: 'moderation',
        message: `Vymazané všetky varovania (${removedCount}) pre ${label}.`,
        actor: moderatorTag,
        targetUserId
    });

    return { ok: true, removedCount };
}

async function applyTimeout({ guild, targetMember, durationMinutes, reason = 'Bez dôvodu', moderatorId = null, moderatorTag = 'Neznámy', actorMember = null }) {
    if (!targetMember) {
        return { ok: false, error: 'Používateľ sa nenašiel na serveri.' };
    }
    const mins = Math.round(Number(durationMinutes));
    if (!Number.isFinite(mins) || mins < 1 || mins > MAX_TIMEOUT_MINUTES) {
        return { ok: false, error: 'Trvanie timeoutu musí byť 1 až 40320 minút.' };
    }

    const check = canModerateTarget(guild, actorMember, targetMember);
    if (!check.ok) return check;
    if (!targetMember.moderatable) {
        return { ok: false, error: 'Bot nemá oprávnenie udeliť timeout tomuto používateľovi.' };
    }

    const cleanReason = String(reason || '').trim().slice(0, 500) || 'Bez dôvodu';
    await targetMember.timeout(mins * 60 * 1000, cleanReason);

    const durLabel = formatDurationMinutes(mins);
    await sendModDm(targetMember.user, {
        guildName: guild.name,
        title: '🔇 Dostal si timeout',
        color: 0xF5A623,
        reason: cleanReason,
        extra: `Trvanie: ${durLabel}`
    });

    await logModerationAction(guild, {
        title: '🔇 Timeout',
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
        message: `Timeout ${durLabel} pre ${targetMember.user.tag}: ${cleanReason}`,
        actor: moderatorTag,
        targetUserId: targetMember.id
    });

    return { ok: true, durationLabel: durLabel };
}

async function removeTimeout({ guild, targetMember, reason = 'Zrušený timeout', moderatorId = null, moderatorTag = 'Neznámy', actorMember = null }) {
    if (!targetMember) {
        return { ok: false, error: 'Používateľ sa nenašiel na serveri.' };
    }
    const check = canModerateTarget(guild, actorMember, targetMember);
    if (!check.ok) return check;
    if (!targetMember.moderatable) {
        return { ok: false, error: 'Bot nemá oprávnenie upraviť timeout tohto používateľa.' };
    }

    const cleanReason = String(reason || '').trim().slice(0, 500) || 'Zrušený timeout';
    await targetMember.timeout(null, cleanReason);

    await logModerationAction(guild, {
        title: '🔊 Timeout zrušený',
        color: 0x57F287,
        targetUser: targetMember.user,
        targetId: targetMember.id,
        moderatorText: moderatorId ? `<@${moderatorId}>` : moderatorTag,
        reason: cleanReason
    });

    addActivityLog({
        level: 'info',
        category: 'moderation',
        message: `Zrušený timeout pre ${targetMember.user.tag}.`,
        actor: moderatorTag,
        targetUserId: targetMember.id
    });

    return { ok: true };
}

async function kickMember({ guild, targetMember, reason = 'Bez dôvodu', moderatorId = null, moderatorTag = 'Neznámy', actorMember = null }) {
    if (!targetMember) {
        return { ok: false, error: 'Používateľ sa nenašiel na serveri.' };
    }
    const check = canModerateTarget(guild, actorMember, targetMember);
    if (!check.ok) return check;
    if (!targetMember.kickable) {
        return { ok: false, error: 'Bot nemá oprávnenie vyhodiť tohto používateľa.' };
    }

    const cleanReason = String(reason || '').trim().slice(0, 500) || 'Bez dôvodu';
    const targetUser = targetMember.user;

    await sendModDm(targetUser, {
        guildName: guild.name,
        title: '👢 Bol si vyhodený zo servera',
        color: 0xF5A623,
        reason: cleanReason
    });

    await targetMember.kick(cleanReason);

    await logModerationAction(guild, {
        title: '👢 Kick',
        color: 0xF5A623,
        targetUser,
        targetId: targetUser.id,
        moderatorText: moderatorId ? `<@${moderatorId}>` : moderatorTag,
        reason: cleanReason
    });

    addActivityLog({
        level: 'warn',
        category: 'moderation',
        message: `Kick pre ${targetUser.tag}: ${cleanReason}`,
        actor: moderatorTag,
        targetUserId: targetUser.id
    });

    return { ok: true, targetTag: targetUser.tag };
}

async function banMember({ guild, targetUser = null, targetMember = null, deleteMessageSeconds = 0, reason = 'Bez dôvodu', moderatorId = null, moderatorTag = 'Neznámy', actorMember = null }) {
    const member = targetMember || (targetUser?.id ? guild.members.cache.get(targetUser.id) : null);
    const userId = targetUser?.id || member?.id;
    if (!userId) {
        return { ok: false, error: 'Používateľ nebol zadaný.' };
    }

    if (userId === OWNER_ID || userId === guild.ownerId) {
        return { ok: false, error: 'Nie je možné zabanovať majiteľa servera.' };
    }
    if (actorMember && actorMember.id === userId) {
        return { ok: false, error: 'Nemôžeš zabanovať sám seba.' };
    }

    if (member) {
        const check = canModerateTarget(guild, actorMember, member);
        if (!check.ok) return check;
        if (!member.bannable) {
            return { ok: false, error: 'Bot nemá oprávnenie zabanovať tohto používateľa.' };
        }
    }

    const cleanReason = String(reason || '').trim().slice(0, 500) || 'Bez dôvodu';
    const userObj = targetUser || member?.user || null;
    const targetTag = userObj?.tag || `ID ${userId}`;

    if (userObj) {
        await sendModDm(userObj, {
            guildName: guild.name,
            title: '🔨 Bol si zabanovaný',
            color: 0xED4245,
            reason: cleanReason
        });
    }

    const delSec = Math.min(Math.max(Math.round(Number(deleteMessageSeconds) || 0), 0), 604800);
    await guild.members.ban(userId, { deleteMessageSeconds: delSec, reason: cleanReason });

    await logModerationAction(guild, {
        title: '🔨 Ban',
        color: 0xED4245,
        targetUser: userObj,
        targetId: userId,
        moderatorText: moderatorId ? `<@${moderatorId}>` : moderatorTag,
        reason: cleanReason
    });

    addActivityLog({
        level: 'warn',
        category: 'moderation',
        message: `Ban pre ${targetTag}: ${cleanReason}`,
        actor: moderatorTag,
        targetUserId: userId
    });

    return { ok: true, targetTag };
}

async function unbanUser({ guild, userId, reason = 'Bez dôvodu', moderatorId = null, moderatorTag = 'Neznámy' }) {
    const cleanId = String(userId || '').trim();
    if (!/^\d{15,22}$/.test(cleanId)) {
        return { ok: false, error: 'Zadaj platné Discord User ID.' };
    }

    const banInfo = await guild.bans.fetch(cleanId).catch(() => null);
    if (!banInfo) {
        return { ok: false, error: 'Tento používateľ nie je zabanovaný.' };
    }

    const cleanReason = String(reason || '').trim().slice(0, 500) || 'Bez dôvodu';
    await guild.members.unban(cleanId, cleanReason);

    await logModerationAction(guild, {
        title: '🕊️ Unban',
        color: 0x57F287,
        targetUser: banInfo.user,
        targetId: cleanId,
        moderatorText: moderatorId ? `<@${moderatorId}>` : moderatorTag,
        reason: cleanReason
    });

    addActivityLog({
        level: 'info',
        category: 'moderation',
        message: `Unban pre ${banInfo.user?.tag || cleanId}: ${cleanReason}`,
        actor: moderatorTag,
        targetUserId: cleanId
    });

    return { ok: true, targetTag: banInfo.user?.tag || cleanId };
}

module.exports = {
    MAX_TIMEOUT_MINUTES,
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
    unbanUser
};
