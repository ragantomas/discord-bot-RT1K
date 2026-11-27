require('dotenv').config();
const { initBotLogger, registerProcessHandlers } = require('./src/services/botLogger');
initBotLogger();

const { Client, GatewayIntentBits, Partials } = require('discord.js');
const { loadCommands } = require('./src/handlers/commandHandler');
const { loadEvents } = require('./src/handlers/eventHandler');
const { startWebServer } = require('./web/server');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildModeration,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildPresences,
        GatewayIntentBits.GuildInvites
    ],
    partials: [Partials.Message],
    presence: {
        activities: [],
        status: 'online'
    }
});

registerProcessHandlers(client);
loadCommands(client);
loadEvents(client);
startWebServer(client);

client.login(process.env.DISCORD_TOKEN);
