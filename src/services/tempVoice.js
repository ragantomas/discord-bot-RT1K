const { ChannelType, PermissionFlagsBits } = require('discord.js');
const { TEMPVOICE_DEFAULTS } = require('../config');
const {
    getTempRoom,
    setTempRoom,
    deleteTempRoom,
    getAllTempRooms
} = require('../storage/settingsStore');
const { buildControlPanel, refreshControlPanel } = require('./tempVoicePanel');
const { addActivityLog } = require('./activityLog');
const { updateBotStatus } = require('./botStatus');

function formatRoomName(template, member) {
    const rawTemplate = template || TEMPVOICE_DEFAULTS.roomNameTemplate;
    const formatted = rawTemplate
        .replace(/\{user\}/gi, member.displayName)
        .replace(/\{username\}/gi, member.user.username)
        .trim();

    return (formatted || member.displayName).slice(0, 100);
}

function clampBitrate(guild, bitrateKbps) {
    const kbps = typeof bitrateKbps === 'number' ? bitrateKbps : TEMPVOICE_DEFAULTS.bitrateKbps;
    const bps = Math.round(kbps * 1000);
    const maxBitrate = guild.maximumBitrate || 96000;
    return Math.min(Math.max(bps, 8000), maxBitrate);
}

async function resolveTargetCategoryId(guild, guildConfig) {
    if (guildConfig.categoryId) {
        const category = guild.channels.cache.get(guildConfig.categoryId)
            || await guild.channels.fetch(guildConfig.categoryId).catch(() => null);
        if (category?.type === ChannelType.GuildCategory) {
            return category.id;
        }
    }

    if (guildConfig.triggerChannelId) {
        const trigger = guild.channels.cache.get(guildConfig.triggerChannelId)
            || await guild.channels.fetch(guildConfig.triggerChannelId).catch(() => null);
        if (trigger?.parentId) {
            return trigger.parentId;
        }
    }

    return null;
}

async function transferOwnership(channel, room, newOwner, oldOwnerId) {
    room.ownerId = newOwner.id;
    setTempRoom(channel.id, room);

    await channel.permissionOverwrites.edit(newOwner.id, {
        ViewChannel: true,
        Connect: true,
        SendMessages: true
    }).catch(() => null);

    await refreshControlPanel(channel, room);
    await channel.send(
        `👑 <@${oldOwnerId}> opustil miestnosť. Novým majiteľom miestnosti je <@${newOwner.id}>!`
    ).catch(() => null);
}

async function createTempRoom(member, guildConfig) {
    const guild = member.guild;
    const parentId = await resolveTargetCategoryId(guild, guildConfig);
    const roomName = formatRoomName(guildConfig.roomNameTemplate, member);
    const bitrate = clampBitrate(guild, guildConfig.bitrateKbps);
    const userLimit = typeof guildConfig.userLimit === 'number'
        ? Math.min(Math.max(guildConfig.userLimit, 0), 99)
        : TEMPVOICE_DEFAULTS.userLimit;

    const permissionOverwrites = [
        {
            id: guild.members.me.id,
            allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.Connect,
                PermissionFlagsBits.ManageChannels,
                PermissionFlagsBits.MoveMembers,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.EmbedLinks
            ]
        },
        {
            id: member.id,
            allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.Connect,
                PermissionFlagsBits.SendMessages
            ]
        }
    ];

    const newChannel = await guild.channels.create({
        name: roomName,
        type: ChannelType.GuildVoice,
        parent: parentId || undefined,
        bitrate,
        userLimit,
        permissionOverwrites
    });

    try {
        await member.voice.setChannel(newChannel);
    } catch (err) {
        await newChannel.delete('Nepodarilo sa presunúť používateľa do dočasnej miestnosti').catch(() => null);
        return null;
    }

    const room = {
        guildId: guild.id,
        channelId: newChannel.id,
        ownerId: member.id,
        panelMessageId: null,
        locked: false
    };

    setTempRoom(newChannel.id, room);
    updateBotStatus(guild.client);

    addActivityLog({
        level: 'info',
        category: 'tempvoice',
        message: `Created TempVoice room "${newChannel.name}" for ${member.displayName}.`
    });

    const panelMessage = await newChannel.send(buildControlPanel(newChannel, room)).catch(err => {
        console.error('Chyba pri odosielaní ovládacieho panelu TempVoice:', err);
        return null;
    });

    if (panelMessage) {
        room.panelMessageId = panelMessage.id;
        setTempRoom(newChannel.id, room);
    }

    return room;
}

async function handleRoomLeave(channel, leavingMember) {
    const room = getTempRoom(channel.id);
    if (!room) return;

    const humanMembers = channel.members.filter(m => !m.user.bot);

    if (humanMembers.size === 0) {
        deleteTempRoom(channel.id);
        updateBotStatus(channel.client);
        await channel.delete('Dočasná miestnosť je prázdna').catch(() => null);
        return;
    }

    if (room.ownerId === leavingMember?.id || !humanMembers.has(room.ownerId)) {
        const nextOwner = humanMembers.first();
        if (nextOwner) {
            const previousOwnerId = room.ownerId;
            await transferOwnership(channel, room, nextOwner, previousOwnerId);
        }
    }
}

async function cleanupTempRoomsOnStartup(client) {
    const rooms = Object.values(getAllTempRooms());

    for (const room of rooms) {
        const guild = client.guilds.cache.get(room.guildId)
            || await client.guilds.fetch(room.guildId).catch(() => null);

        if (!guild) {
            deleteTempRoom(room.channelId);
            continue;
        }

        const channel = guild.channels.cache.get(room.channelId)
            || await guild.channels.fetch(room.channelId).catch(() => null);

        if (!channel) {
            deleteTempRoom(room.channelId);
            continue;
        }

        const humanMembers = channel.members.filter(m => !m.user.bot);
        if (humanMembers.size === 0) {
            deleteTempRoom(room.channelId);
            await channel.delete('Čistenie prázdnej TempVoice miestnosti po reštarte').catch(() => null);
        } else if (!humanMembers.has(room.ownerId)) {
            const nextOwner = humanMembers.first();
            if (nextOwner) {
                const previousOwnerId = room.ownerId;
                await transferOwnership(channel, room, nextOwner, previousOwnerId);
            }
        }
    }
}

async function toggleTempRoomLock(client, channelId) {
    const room = getTempRoom(channelId);
    if (!room) return { ok: false, reason: 'not_found' };

    const guild = client.guilds.cache.get(room.guildId)
        || await client.guilds.fetch(room.guildId).catch(() => null);
    if (!guild) {
        deleteTempRoom(channelId);
        updateBotStatus(client);
        return { ok: false, reason: 'missing_guild' };
    }

    const channel = guild.channels.cache.get(channelId)
        || await guild.channels.fetch(channelId).catch(() => null);
    if (!channel) {
        deleteTempRoom(channelId);
        updateBotStatus(client);
        return { ok: false, reason: 'missing_channel' };
    }

    room.locked = !room.locked;

    await channel.permissionOverwrites.edit(room.ownerId, {
        ViewChannel: true,
        Connect: true
    }).catch(() => null);

    await channel.permissionOverwrites.edit(guild.roles.everyone, {
        Connect: room.locked ? false : null
    });

    setTempRoom(channelId, room);
    await refreshControlPanel(channel, room);

    return { ok: true, locked: room.locked, room };
}

async function closeTempRoom(client, channelId) {
    const room = getTempRoom(channelId);
    if (!room) return { ok: false, reason: 'not_found' };

    deleteTempRoom(channelId);
    updateBotStatus(client);

    const guild = client.guilds.cache.get(room.guildId)
        || await client.guilds.fetch(room.guildId).catch(() => null);
    const channel = guild
        ? (guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId).catch(() => null))
        : null;

    if (channel) {
        await channel.delete('Zatvorené cez webový dashboard').catch(() => null);
    }

    return { ok: true };
}

async function renameTempRoom(client, channelId, newName) {
    const room = getTempRoom(channelId);
    if (!room) return { ok: false, reason: 'not_found' };

    const trimmed = String(newName || '').trim();
    if (!trimmed || trimmed.length > 100) {
        return { ok: false, reason: 'invalid_name' };
    }

    const guild = client.guilds.cache.get(room.guildId)
        || await client.guilds.fetch(room.guildId).catch(() => null);
    const channel = guild
        ? (guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId).catch(() => null))
        : null;

    if (!channel) {
        deleteTempRoom(channelId);
        updateBotStatus(client);
        return { ok: false, reason: 'missing_channel' };
    }

    await channel.setName(trimmed);
    await refreshControlPanel(channel, room);

    return { ok: true, name: trimmed };
}

async function kickFromTempRoom(client, channelId, userId) {
    const room = getTempRoom(channelId);
    if (!room) return { ok: false, reason: 'not_found' };

    const guild = client.guilds.cache.get(room.guildId)
        || await client.guilds.fetch(room.guildId).catch(() => null);
    const channel = guild
        ? (guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId).catch(() => null))
        : null;

    if (!channel) {
        deleteTempRoom(channelId);
        updateBotStatus(client);
        return { ok: false, reason: 'missing_channel' };
    }

    const targetMember = channel.members.get(userId);
    if (!targetMember) {
        return { ok: false, reason: 'member_not_in_room' };
    }

    await targetMember.voice.disconnect('Odpojený cez webový dashboard.');
    return { ok: true, displayName: targetMember.displayName };
}

function getOverwriteConnectState(channel, roleId) {
    const ow = channel.permissionOverwrites?.cache?.get(roleId);
    if (ow?.allow?.has(PermissionFlagsBits.Connect)) return 'allow';
    if (ow?.deny?.has(PermissionFlagsBits.Connect)) return 'deny';
    return 'inherit';
}

async function restoreTriggerRoleConnect(channel, roleId, prevState) {
    const connectValue = prevState === 'allow' ? true : (prevState === 'deny' ? false : null);
    await channel.permissionOverwrites.edit(
        roleId,
        { Connect: connectValue },
        { reason: 'TempVoice bol zapnutý — obnovenie oprávnení spúšťacieho kanála' }
    );
}

async function unlockTriggerChannelRoles(guild, channelId, prevConnectMap) {
    if (!guild || !channelId || !prevConnectMap || typeof prevConnectMap !== 'object') {
        return { warning: null };
    }
    const entries = Object.entries(prevConnectMap);
    if (entries.length === 0) return { warning: null };

    const channel = guild.channels.cache.get(channelId)
        || await guild.channels.fetch(channelId).catch(() => null);
    if (!channel || channel.type !== ChannelType.GuildVoice) {
        return { warning: null };
    }

    let failedRoles = 0;
    for (const [roleId, prevState] of entries) {
        try {
            await restoreTriggerRoleConnect(channel, roleId, prevState);
        } catch {
            failedRoles++;
        }
    }

    const warning = failedRoles > 0
        ? `Nepodarilo sa obnoviť oprávnenia na kanáli „${channel.name}“ (skontroluj, či má bot právo Spravovať roly / Manage Permissions).`
        : null;
    return { warning };
}

async function syncTriggerChannelLock(guild, setup, prevSetup, shouldBeLocked) {
    let prevChannelWarning = null;
    if (
        prevSetup?.triggerChannelId &&
        prevSetup.triggerChannelId !== setup.triggerChannelId &&
        Object.keys(prevSetup.lockedRolePrevConnect || {}).length > 0
    ) {
        const res = await unlockTriggerChannelRoles(guild, prevSetup.triggerChannelId, prevSetup.lockedRolePrevConnect);
        prevChannelWarning = res.warning;
    }

    const nextPrevMap = prevSetup?.triggerChannelId === setup.triggerChannelId
        ? { ...(prevSetup.lockedRolePrevConnect || {}) }
        : {};

    if (!setup.triggerChannelId || !guild) {
        return { lockedRolePrevConnect: {}, warning: prevChannelWarning };
    }

    const channel = guild.channels.cache.get(setup.triggerChannelId)
        || await guild.channels.fetch(setup.triggerChannelId).catch(() => null);
    if (!channel || channel.type !== ChannelType.GuildVoice) {
        return { lockedRolePrevConnect: {}, warning: prevChannelWarning };
    }

    const desiredLockedSet = new Set(shouldBeLocked ? (setup.lockRoleIds || []) : []);
    let unlockedCount = 0;
    let lockedCount = 0;
    let failedRoles = 0;

    for (const roleId of Object.keys(nextPrevMap)) {
        if (desiredLockedSet.has(roleId)) continue;
        try {
            await restoreTriggerRoleConnect(channel, roleId, nextPrevMap[roleId]);
            delete nextPrevMap[roleId];
            unlockedCount++;
        } catch {
            failedRoles++;
        }
    }

    for (const roleId of desiredLockedSet) {
        const wasAlreadyLocked = Object.prototype.hasOwnProperty.call(nextPrevMap, roleId);
        const prevState = wasAlreadyLocked ? nextPrevMap[roleId] : getOverwriteConnectState(channel, roleId);
        try {
            await channel.permissionOverwrites.edit(
                roleId,
                { Connect: false },
                { reason: 'TempVoice bol vypnutý — automatické zamknutie spúšťacieho kanála' }
            );
            nextPrevMap[roleId] = prevState;
            if (!wasAlreadyLocked) lockedCount++;
        } catch {
            failedRoles++;
        }
    }

    if (lockedCount > 0) {
        addActivityLog({
            level: 'info',
            category: 'tempvoice',
            message: `Auto-locked trigger channel "${channel.name}" for ${lockedCount} ${lockedCount === 1 ? 'role' : 'roles'}.`
        });
    }
    if (unlockedCount > 0) {
        addActivityLog({
            level: 'info',
            category: 'tempvoice',
            message: `Auto-unlocked trigger channel "${channel.name}" (${unlockedCount} ${unlockedCount === 1 ? 'role' : 'roles'}).`
        });
    }

    const currWarning = failedRoles > 0
        ? `Nepodarilo sa upraviť oprávnenia na kanáli „${channel.name}“ (skontroluj, či má bot právo Spravovať roly / Manage Permissions).`
        : null;

    return {
        lockedRolePrevConnect: nextPrevMap,
        warning: currWarning || prevChannelWarning
    };
}

module.exports = {
    formatRoomName,
    clampBitrate,
    createTempRoom,
    handleRoomLeave,
    cleanupTempRoomsOnStartup,
    toggleTempRoomLock,
    closeTempRoom,
    renameTempRoom,
    kickFromTempRoom,
    getOverwriteConnectState,
    unlockTriggerChannelRoles,
    syncTriggerChannelLock
};
