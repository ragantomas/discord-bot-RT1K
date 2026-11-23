const { Events } = require('discord.js');
const { logMemberUpdate } = require('../services/adminLog');

module.exports = {
    name: Events.GuildMemberUpdate,
    async execute(oldMember, newMember) {
        try {
            await logMemberUpdate(oldMember, newMember);
        } catch (err) {
            console.error('Chyba pri logovaní úpravy člena:', err);
        }
    }
};
