const { Events } = require('discord.js');
const { handleInviteDelete } = require('../services/inviteTracker');

module.exports = {
    name: Events.InviteDelete,
    execute(invite) {
        handleInviteDelete(invite);
    }
};
