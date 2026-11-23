const { Events } = require('discord.js');
const { loadUsers, saveUsers } = require('../storage/usersStore');
const { updateBotStatus } = require('../services/botStatus');

module.exports = {
    name: Events.GuildMemberRemove,
    execute(member) {
        const users = loadUsers();
        if (users[member.id]) {
            delete users[member.id];
            saveUsers(users);
            updateBotStatus(member.client);
            console.log(`Hráč ${member.user.tag} odišiel zo servera a bol odstránený z users.json.`);
        }
    }
};
