const { Events } = require('discord.js');
const { handleInviteCreate } = require('../services/inviteTracker');

module.exports = {
    name: Events.InviteCreate,
    execute(invite) {
        handleInviteCreate(invite);
    }
};
