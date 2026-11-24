const fs = require('fs');
const path = require('path');
const { Collection } = require('discord.js');
const { OWNER_ID } = require('../config');
const { getModerationSettings } = require('../storage/settingsStore');

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

function shouldRegisterCommand(cmd, modSettings) {
    if (!cmd.adminOnly) return true;
    if (!modSettings?.enabled) return false;
    if (cmd.modModuleKey && modSettings.commands?.[cmd.modModuleKey] === false) {
        return false;
    }
    return true;
}

async function registerCommands(client) {
    const mod = getModerationSettings();
    const commands = [...client.commands.values()]
        .filter(cmd => shouldRegisterCommand(cmd, mod))
        .map(cmd => cmd.data.toJSON());

    return client.application.commands.set(commands);
}

async function syncAdminCommandPermissions(client, guild, registeredCommands, userAccessToken) {
    if (!guild || !client?.user?.id || !userAccessToken) {
        return { synced: false, reason: 'no_token' };
    }

    const mod = getModerationSettings();
    const permissions = [
        { id: guild.id, type: 1, permission: false },
        { id: OWNER_ID, type: 2, permission: true },
        ...(mod.adminRoleIds || []).slice(0, 95).map(roleId => ({
            id: roleId,
            type: 1,
            permission: true
        }))
    ];

    const list = registeredCommands ? [...registeredCommands.values()] : [];
    const adminCmds = list.filter(cmd => client.commands.get(cmd.name)?.adminOnly);
    let syncedCount = 0;

    for (const cmd of adminCmds) {
        try {
            const res = await fetch(
                `https://discord.com/api/v10/applications/${client.user.id}/guilds/${guild.id}/commands/${cmd.id}/permissions`,
                {
                    method: 'PUT',
                    headers: {
                        Authorization: `Bearer ${userAccessToken}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ permissions })
                }
            );
            if (!res.ok) {
                return { synced: false, reason: 'api_error', status: res.status };
            }
            syncedCount++;
        } catch {
            return { synced: false, reason: 'api_error', status: 0 };
        }
    }

    return { synced: true, count: syncedCount };
}

module.exports = {
    loadCommands,
    registerCommands,
    syncAdminCommandPermissions
};
