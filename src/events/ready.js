const { Events } = require('discord.js');
const { updateBotStatus } = require('../services/botStatus');
const { registerCommands } = require('../handlers/commandHandler');
const { startScheduledTasks } = require('../tasks');
const { cleanupTempRoomsOnStartup } = require('../services/tempVoice');
const { seedActiveVoiceSessions } = require('../services/playerActivity');
const { seedInvites } = require('../services/inviteTracker');
const { addActivityLog } = require('../services/activityLog');

module.exports = {
    name: Events.ClientReady,
    once: true,
    async execute(client) {
        console.log(`Bot je online ako ${client.user.tag}!`);
        addActivityLog({
            level: 'info',
            category: 'system',
            message: `Bot started (${client.user.tag}).`
        });
        updateBotStatus(client, { force: true });
        seedActiveVoiceSessions(client);
        seedInvites(client).catch(console.error);

        await registerCommands(client);
        await cleanupTempRoomsOnStartup(client);
        startScheduledTasks(client);
    }
};
