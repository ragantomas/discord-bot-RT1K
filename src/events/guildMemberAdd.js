const { Events } = require('discord.js');
const { assignJoinRole } = require('../services/joinRoles');
const { logMemberJoin } = require('../services/adminLog');

module.exports = {
    name: Events.GuildMemberAdd,
    async execute(member) {
        try {
            await assignJoinRole(member);
        } catch (err) {
            console.error(`Chyba pri prideľovaní join role pre ${member.user?.tag || member.id}:`, err);
        }

        try {
            await logMemberJoin(member);
        } catch (err) {
            console.error('Chyba pri admin logu príchodu člena:', err);
        }
    }
};
