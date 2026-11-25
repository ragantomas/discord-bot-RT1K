const { Events } = require('discord.js');
const { assignJoinRole } = require('../services/joinRoles');
const { logMemberJoin } = require('../services/adminLog');
const { handleMemberWelcome } = require('../services/welcome');
const { updateBotStatus } = require('../services/botStatus');
const { recordMemberJoin } = require('../services/playerActivity');
const { resolveMemberJoinInvite } = require('../services/inviteTracker');

module.exports = {
    name: Events.GuildMemberAdd,
    async execute(member) {
        recordMemberJoin(member);

        const inviteInfo = await resolveMemberJoinInvite(member).catch(() => null);

        try {
            await assignJoinRole(member);
        } catch (err) {
            console.error(`Chyba pri prideľovaní join role pre ${member.user?.tag || member.id}:`, err);
        }

        try {
            await handleMemberWelcome(member);
        } catch (err) {
            console.error('Chyba pri uvítacej správe:', err);
        }

        try {
            await logMemberJoin(member, inviteInfo);
        } catch (err) {
            console.error('Chyba pri admin logu príchodu člena:', err);
        }

        try {
            updateBotStatus(member.client);
        } catch (err) {
            console.error('Chyba pri aktualizácii statusu bota po príchode člena:', err);
        }
    }
};
