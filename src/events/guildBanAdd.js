const { Events } = require('discord.js');
const { logBanAdd } = require('../services/adminLog');

module.exports = {
    name: Events.GuildBanAdd,
    async execute(ban) {
        try {
            await logBanAdd(ban);
        } catch (err) {
            console.error('Chyba pri logovaní banu:', err);
        }
    }
};
