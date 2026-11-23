const { Events } = require('discord.js');
const { loadSettings, updateSettings } = require('../storage/settingsStore');

module.exports = {
    name: Events.GuildRoleDelete,
    execute(role) {
        if (!role?.guild?.id) return;

        const current = loadSettings();
        const hasMemberRole = (current.joinRoles?.memberRoleIds || []).includes(role.id);
        const hasBotRole = (current.joinRoles?.botRoleIds || []).includes(role.id);

        const needsUpdate =
            current.dashboardRoleId === role.id ||
            current.patchBot?.roleId === role.id ||
            hasMemberRole ||
            hasBotRole;

        if (!needsUpdate) return;

        updateSettings(settings => {
            if (settings.dashboardRoleId === role.id) {
                settings.dashboardRoleId = null;
                console.warn(`Rola pre prístup do dashboardu (${role.id}) bola zmazaná.`);
            }
            if (settings.patchBot.roleId === role.id) {
                settings.patchBot.roleId = null;
                console.warn(`Ping rola pre CS2 PatchBota (${role.id}) bola zmazaná.`);
            }
            if (hasMemberRole) {
                settings.joinRoles.memberRoleIds = settings.joinRoles.memberRoleIds.filter(id => id !== role.id);
                console.warn(`Join rola pre hráčov (${role.id}) bola zmazaná.`);
            }
            if (hasBotRole) {
                settings.joinRoles.botRoleIds = settings.joinRoles.botRoleIds.filter(id => id !== role.id);
                console.warn(`Join rola pre botov (${role.id}) bola zmazaná.`);
            }
        });
    }
};
