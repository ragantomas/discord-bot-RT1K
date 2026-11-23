const { Events } = require('discord.js');
const { loadSettings, updateSettings } = require('../storage/settingsStore');

module.exports = {
    name: Events.GuildRoleDelete,
    execute(role) {
        if (!role?.guild?.id) return;

        const current = loadSettings();
        const hasDashboardRole = (current.dashboardRoleIds || []).includes(role.id);
        const hasMemberRole = (current.joinRoles?.memberRoleIds || []).includes(role.id);
        const hasBotRole = (current.joinRoles?.botRoleIds || []).includes(role.id);
        const hasTempVoiceLockRole = (current.tempVoice?.setups || []).some(
            setup => (setup.lockRoleIds || []).includes(role.id)
                || Boolean(setup.lockedRolePrevConnect && Object.prototype.hasOwnProperty.call(setup.lockedRolePrevConnect, role.id))
        );

        const needsUpdate =
            hasDashboardRole ||
            current.patchBot?.roleId === role.id ||
            hasMemberRole ||
            hasBotRole ||
            hasTempVoiceLockRole;

        if (!needsUpdate) return;

        updateSettings(settings => {
            if (hasDashboardRole) {
                settings.dashboardRoleIds = (settings.dashboardRoleIds || []).filter(id => id !== role.id);
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
            if (hasTempVoiceLockRole && Array.isArray(settings.tempVoice?.setups)) {
                for (const setup of settings.tempVoice.setups) {
                    if (Array.isArray(setup.lockRoleIds)) {
                        setup.lockRoleIds = setup.lockRoleIds.filter(id => id !== role.id);
                    }
                    if (setup.lockedRolePrevConnect && typeof setup.lockedRolePrevConnect === 'object') {
                        delete setup.lockedRolePrevConnect[role.id];
                    }
                }
                console.warn(`Rola pre zamknutie TempVoice (${role.id}) bola zmazaná.`);
            }
        });
    }
};
