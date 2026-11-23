const { Events } = require('discord.js');
const {
    getJoinRolesGuildConfig,
    setJoinRolesGuildConfig
} = require('../storage/joinRolesStore');

module.exports = {
    name: Events.RoleDelete,
    execute(role) {
        if (!role?.guild?.id) return;

        const config = getJoinRolesGuildConfig(role.guild.id);
        if (!config) return;

        let changed = false;

        if (config.memberRoleId === role.id) {
            config.memberRoleId = null;
            changed = true;
        }

        if (config.botRoleId === role.id) {
            config.botRoleId = null;
            changed = true;
        }

        if (changed) {
            setJoinRolesGuildConfig(role.guild.id, config);
            console.warn(`Join rola (${role.id}) na serveri ${role.guild.id} bola zmazaná a odstránená z konfigurácie.`);
        }
    }
};
