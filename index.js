require('dotenv').config();
const { initBotLogger, registerProcessHandlers } = require('./src/services/botLogger');
initBotLogger();

const { Client, GatewayIntentBits, Partials, Options } = require('discord.js');
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
    makeCache: Options.cacheWithLimits({
        ...Options.DefaultMakeCacheSettings,
        MessageManager: 30,
        ReactionManager: 0,
        ReactionUserManager: 0,
        GuildStickerManager: 0,
        GuildScheduledEventManager: 0,
        StageInstanceManager: 0,
        AutoModerationRuleManager: 0,
        ThreadMemberManager: 0,
        GuildBanManager: 0,
        GuildInviteManager: 0
    }),
    sweepers: {
        ...Options.DefaultSweeperSettings,
        messages: {
            interval: 600,
            lifetime: 1800
        },
        threads: {
            interval: 3600,
            lifetime: 3600
        }
    },
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
