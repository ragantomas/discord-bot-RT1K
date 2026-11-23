const { Events } = require('discord.js');
const { logBanRemove } = require('../services/adminLog');

module.exports = {
    name: Events.GuildBanRemove,
    async execute(ban) {
        try {
            await logBanRemove(ban);
        } catch (err) {
            console.error('Chyba pri logovaní unbanu:', err);
        }
    }
};
