const { PermissionFlagsBits } = require('discord.js');
const { getJoinRolesSettings } = require('../storage/settingsStore');
const { addActivityLog, addThrottledErrorLog } = require('./activityLog');

function validateAssignableRole(guild, role) {
    if (!role) {
        return { ok: false, reason: 'Selected role was not found.' };
    }

    if (role.id === guild.id) {
        return { ok: false, reason: 'Cannot use `@everyone` as a join role.' };
    }

    if (role.managed) {
        return {
            ok: false,
            reason: `Role <@&${role.id}> is managed by Discord or an integration and cannot be assigned by the bot.`
        };
    }

    if (!guild.members.me?.permissions.has(PermissionFlagsBits.ManageRoles)) {
        return {
            ok: false,
            reason: 'Bot lacks **Manage Roles** permission.'
        };
    }

    if (!role.editable) {
        return {
            ok: false,
            reason: `Bot role must be positioned **above** <@&${role.id}> in server role settings.`
        };
    }

    return { ok: true };
}

async function assignJoinRole(member) {
    if (!member?.guild || !member.user) return false;

    const config = getJoinRolesSettings();
    if (!config || !config.enabled) return false;

    const roleIds = member.user.bot
        ? (config.botRoleIds || [])
        : (config.memberRoleIds || []);

    if (roleIds.length === 0) return false;

    const rolesToAdd = [];
    for (const roleId of roleIds) {
        const role = member.guild.roles.cache.get(roleId)
            || await member.guild.roles.fetch(roleId).catch(() => null);

        if (!role) {
            console.warn(`Join rola (${roleId}) na serveri ${member.guild.id} už neexistuje.`);
            continue;
        }

        if (member.roles.cache.has(role.id)) continue;

        if (!role.editable) {
            console.warn(`Bot nemôže priradiť join rolu ${role.name} (${role.id}) na serveri ${member.guild.id}.`);
            addThrottledErrorLog({
                key: `joinroles:editable:${role.id}`,
                category: 'joinroles',
                message: `Cannot assign join role @${role.name}: bot role is positioned below it.`
            });
            continue;
        }

        rolesToAdd.push(role);
    }

    if (rolesToAdd.length === 0) return true;

    try {
        await member.roles.add(
            rolesToAdd,
            member.user.bot ? 'Automatické join role pre bota' : 'Automatické join role pre člena'
        );
    } catch (err) {
        addThrottledErrorLog({
            key: `joinroles:add:${member.guild.id}`,
            category: 'joinroles',
            message: `Failed to assign join roles to ${member.user.tag}: ${err?.message || err}`,
            targetUserId: member.id
        });
        throw err;
    }

    addActivityLog({
        level: 'info',
        category: 'joinroles',
        message: `Assigned join roles (${rolesToAdd.map(r => r.name).join(', ')}) to ${member.user.tag}.`
    });
    return true;
}

module.exports = {
    validateAssignableRole,
    assignJoinRole
};
