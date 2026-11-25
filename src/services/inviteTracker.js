const { PermissionFlagsBits } = require('discord.js');

const guildInvites = new Map();

function snapshotInvites(invites) {
    const map = new Map();
    if (!invites) return map;
    for (const inv of invites.values()) {
        if (!inv?.code) continue;
        map.set(inv.code, {
            uses: Number(inv.uses || 0),
            maxUses: Number(inv.maxUses || 0),
            inviterId: inv.inviter?.id || null,
            inviterTag: inv.inviter?.tag || null,
            expiresTimestamp: inv.expiresTimestamp || null
        });
    }
    return map;
}

async function seedGuildInvites(guild) {
    if (!guild?.members?.me?.permissions.has(PermissionFlagsBits.ManageGuild)) return;
    const invites = await guild.invites.fetch().catch(() => null);
    if (invites) {
        guildInvites.set(guild.id, snapshotInvites(invites));
    }
}

async function seedInvites(client) {
    for (const guild of client.guilds.cache.values()) {
        await seedGuildInvites(guild);
    }
}

function handleInviteCreate(invite) {
    if (!invite?.guild?.id || !invite.code) return;
    let map = guildInvites.get(invite.guild.id);
    if (!map) {
        map = new Map();
        guildInvites.set(invite.guild.id, map);
    }
    map.set(invite.code, {
        uses: Number(invite.uses || 0),
        maxUses: Number(invite.maxUses || 0),
        inviterId: invite.inviter?.id || null,
        inviterTag: invite.inviter?.tag || null,
        expiresTimestamp: invite.expiresTimestamp || null
    });
}

function handleInviteDelete(invite) {
    if (!invite?.guild?.id || !invite.code) return;
    const map = guildInvites.get(invite.guild.id);
    if (map) {
        map.delete(invite.code);
    }
}

async function resolveMemberJoinInvite(member) {
    if (!member?.guild || member.user?.bot) return null;
    if (!member.guild.members.me?.permissions.has(PermissionFlagsBits.ManageGuild)) return null;

    const prevMap = guildInvites.get(member.guild.id) || new Map();
    const freshInvites = await member.guild.invites.fetch().catch(() => null);
    if (!freshInvites) return null;

    const freshMap = snapshotInvites(freshInvites);
    let matched = null;

    for (const [code, cur] of freshMap.entries()) {
        const prevUses = prevMap.get(code)?.uses ?? 0;
        if (cur.uses > prevUses) {
            matched = { code, ...cur };
            break;
        }
    }

    if (!matched) {
        const now = Date.now();
        for (const [code, prev] of prevMap.entries()) {
            if (freshMap.has(code)) continue;
            if (
                prev.maxUses > 0 &&
                prev.uses + 1 >= prev.maxUses &&
                (!prev.expiresTimestamp || prev.expiresTimestamp > now)
            ) {
                matched = { code, ...prev, uses: prev.uses + 1 };
                break;
            }
        }
    }

    guildInvites.set(member.guild.id, freshMap);
    return matched;
}

module.exports = {
    seedInvites,
    seedGuildInvites,
    handleInviteCreate,
    handleInviteDelete,
    resolveMemberJoinInvite
};
