const { Events } = require('discord.js');
const { loadSettings, updateSettings } = require('../storage/settingsStore');

module.exports = {
    name: Events.GuildRoleDelete,
    execute(role) {
        if (!role?.guild?.id) return;

        const current = loadSettings();
        const needsUpdate =
            current.dashboardRoleId === role.id ||
            current.patchBot?.roleId === role.id ||
            current.joinRoles?.memberRoleId === role.id ||
            current.joinRoles?.botRoleId === role.id;

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
            if (settings.joinRoles.memberRoleId === role.id) {
                settings.joinRoles.memberRoleId = null;
                console.warn(`Join rola pre hráčov (${role.id}) bola zmazaná.`);
            }
            if (settings.joinRoles.botRoleId === role.id) {
                settings.joinRoles.botRoleId = null;
                console.warn(`Join rola pre botov (${role.id}) bola zmazaná.`);
            }
        });
    }
};
