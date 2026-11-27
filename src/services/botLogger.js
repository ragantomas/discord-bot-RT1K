const fs = require('fs');
const util = require('util');
const { BOT_LOG_FILE } = require('../config');
const { addThrottledErrorLog, persistNow } = require('./activityLog');
const { flushAllVoiceSessionsAndPersist } = require('./playerActivity');

const MAX_LOG_BYTES = 1024 * 1024;
let initialized = false;
let handlersRegistered = false;
let shuttingDown = false;

function formatTimestamp(date = new Date()) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const hh = String(date.getHours()).padStart(2, '0');
    const mm = String(date.getMinutes()).padStart(2, '0');
    const ss = String(date.getSeconds()).padStart(2, '0');
    return `${y}-${m}-${d} ${hh}:${mm}:${ss}`;
}

function appendLogLine(level, args) {
    if (!BOT_LOG_FILE) return;
    try {
        if (fs.existsSync(BOT_LOG_FILE)) {
            const stat = fs.statSync(BOT_LOG_FILE);
            if (stat.size >= MAX_LOG_BYTES) {
                try {
                    fs.renameSync(BOT_LOG_FILE, `${BOT_LOG_FILE}.old`);
                } catch {
                    // Ignore rotation error
                }
            }
        }
        const text = util.format(...args);
        fs.appendFileSync(BOT_LOG_FILE, `[${formatTimestamp()}] [${level}] ${text}\n`);
    } catch {
        // Never throw from console logger
    }
}

function initBotLogger() {
    if (initialized) return;
    initialized = true;

    const origLog = console.log.bind(console);
    const origWarn = console.warn.bind(console);
    const origError = console.error.bind(console);

    console.log = (...args) => {
        appendLogLine('INFO', args);
        origLog(...args);
    };
    console.warn = (...args) => {
        appendLogLine('WARN', args);
        origWarn(...args);
    };
    console.error = (...args) => {
        appendLogLine('ERROR', args);
        origError(...args);
    };
}

function registerProcessHandlers(client) {
    if (handlersRegistered) return;
    handlersRegistered = true;

    process.on('unhandledRejection', (reason) => {
        console.error('[UnhandledRejection]', reason);
        addThrottledErrorLog({
            key: 'process:unhandledRejection',
            category: 'system',
            message: `Unhandled rejection: ${reason?.message || String(reason)}`
        });
    });

    process.on('uncaughtException', (err) => {
        console.error('[UncaughtException]', err);
        addThrottledErrorLog({
            key: 'process:uncaughtException',
            category: 'system',
            message: `Uncaught exception: ${err?.message || String(err)}`
        });
    });

    if (client && typeof client.on === 'function') {
        client.on('error', (err) => {
            console.error('[DiscordClientError]', err);
            addThrottledErrorLog({
                key: 'discord:clientError',
                category: 'system',
                message: `Discord client error: ${err?.message || String(err)}`
            });
        });

        client.on('shardError', (err) => {
            console.error('[DiscordShardError]', err);
            addThrottledErrorLog({
                key: 'discord:shardError',
                category: 'system',
                message: `Discord shard error: ${err?.message || String(err)}`
            });
        });
    }

    const handleShutdown = (signal) => {
        if (shuttingDown) return;
        shuttingDown = true;
        console.log(`Prijatý signál ${signal}, ukladám dáta a vypínam bota...`);
        try {
            flushAllVoiceSessionsAndPersist();
        } catch (err) {
            console.error('Chyba pri ukladaní voice aktivity pri vypínaní:', err);
        }
        try {
            persistNow();
        } catch (err) {
            console.error('Chyba pri ukladaní Activity Logu pri vypínaní:', err);
        }
        try {
            if (client && typeof client.destroy === 'function') {
                client.destroy();
            }
        } catch {
            // Ignore destroy errors
        }
        process.exit(0);
    };

    process.on('SIGINT', () => handleShutdown('SIGINT'));
    process.on('SIGTERM', () => handleShutdown('SIGTERM'));
}

module.exports = {
    initBotLogger,
    registerProcessHandlers
};
