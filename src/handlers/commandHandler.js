const fs = require('fs');
const path = require('path');
const { Collection } = require('discord.js');

function getCommandFiles(dir) {
    if (!fs.existsSync(dir)) return [];

    const files = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            files.push(...getCommandFiles(fullPath));
        } else if (entry.isFile() && entry.name.endsWith('.js')) {
            files.push(fullPath);
        }
    }
    return files;
}

function loadCommands(client) {
    client.commands = new Collection();
    const commandsDir = path.join(__dirname, '..', 'commands');

    for (const filePath of getCommandFiles(commandsDir)) {
        const command = require(filePath);
        if (command?.data && typeof command.execute === 'function') {
            client.commands.set(command.data.name, command);
        } else {
            console.warn(`[WARN] Príkaz v ${filePath} nemá platnú vlastnosť "data" alebo "execute".`);
        }
    }
}

async function registerCommands(client) {
    const commands = [...client.commands.values()].map(cmd => cmd.data.toJSON());
    await client.application.commands.set(commands);
}

module.exports = {
    loadCommands,
    registerCommands
};
