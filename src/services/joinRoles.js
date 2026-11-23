const { PermissionFlagsBits } = require('discord.js');
const { getJoinRolesSettings } = require('../storage/settingsStore');

function validateAssignableRole(guild, role) {
    if (!role) {
        return { ok: false, reason: 'Vybraná rola sa nenašla.' };
    }

    if (role.id === guild.id) {
        return { ok: false, reason: 'Rolu `@everyone` nie je možné použiť ako join rolu.' };
    }

    if (role.managed) {
        return {
            ok: false,
            reason: `Rolu <@&${role.id}> spravuje Discord alebo integrácia a bot ju nemôže prideľovať.`
        };
    }

    if (!guild.members.me?.permissions.has(PermissionFlagsBits.ManageRoles)) {
        return {
            ok: false,
            reason: 'Bot nemá oprávnenie **Manage Roles** (*Spravovať role*) potrebné na prideľovanie rolí.'
        };
    }

    if (!role.editable) {
        return {
            ok: false,
            reason: `Rola bota musí byť v nastaveniach rolí servera **vyššie** ako <@&${role.id}>, inak ju bot nemôže prideľovať.`
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
            continue;
        }

        rolesToAdd.push(role);
    }

    if (rolesToAdd.length === 0) return true;

    await member.roles.add(
        rolesToAdd,
        member.user.bot ? 'Automatické join role pre bota' : 'Automatické join role pre člena'
    );
    return true;
}

module.exports = {
    validateAssignableRole,
    assignJoinRole
};
