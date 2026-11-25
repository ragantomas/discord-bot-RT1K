const { Events } = require('discord.js');
const { updateBotStatus } = require('../services/botStatus');
const { registerCommands } = require('../handlers/commandHandler');
const { startScheduledTasks } = require('../tasks');
const { cleanupTempRoomsOnStartup } = require('../services/tempVoice');
const { seedActiveVoiceSessions } = require('../services/playerActivity');

module.exports = {
    name: Events.ClientReady,
    once: true,
    async execute(client) {
        console.log(`Bot je online ako ${client.user.tag}!`);
        updateBotStatus(client, { force: true });
        seedActiveVoiceSessions(client);

        await registerCommands(client);
        await cleanupTempRoomsOnStartup(client);
        startScheduledTasks(client);
    }
};
