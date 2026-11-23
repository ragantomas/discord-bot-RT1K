const { Events } = require('discord.js');
const { loadUsers, saveUsers } = require('../storage/usersStore');
const { updateBotStatus } = require('../services/botStatus');
const { logMemberLeave } = require('../services/adminLog');

module.exports = {
    name: Events.GuildMemberRemove,
    async execute(member) {
        const users = loadUsers();
        if (users[member.id]) {
            delete users[member.id];
            saveUsers(users);
            updateBotStatus(member.client);
            console.log(`Hráč ${member.user.tag} odišiel zo servera a bol odstránený z users.json.`);
        }

        try {
            await logMemberLeave(member);
        } catch (err) {
            console.error('Chyba pri admin logu odchodu člena:', err);
        }
    }
};
