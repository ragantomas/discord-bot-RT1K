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

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function syncAdminCommandPermissions(client, guild, registeredCommands, userAccessToken) {
    if (!registeredCommands) {
        return { synced: false, reason: 'register_failed' };
    }
    if (!guild || !client?.user?.id || !userAccessToken) {
        return { synced: false, reason: 'no_token' };
    }

    const mod = getModerationSettings();
    const permissions = [
        { id: guild.id, type: 1, permission: false },
        { id: OWNER_ID, type: 2, permission: true },
        ...(mod.adminRoleIds || [])
            .filter(id => id && id !== guild.id)
            .slice(0, 95)
            .map(roleId => ({
                id: roleId,
                type: 1,
                permission: true
            }))
    ];

    const list = [...registeredCommands.values()];
    const adminCmds = list.filter(cmd => client.commands.get(cmd.name)?.adminOnly);
    let syncedCount = 0;

    for (const cmd of adminCmds) {
        const url = `https://discord.com/api/v10/applications/${client.user.id}/guilds/${guild.id}/commands/${cmd.id}/permissions`;
        let done = false;

        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                const res = await fetch(url, {
                    method: 'PUT',
                    headers: {
                        Authorization: `Bearer ${userAccessToken}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ permissions })
                });

                if (res.status === 429) {
                    const rlData = await res.json().catch(() => ({}));
                    const retryHeader = Number(res.headers.get('retry-after'));
                    const retrySec = Number(rlData.retry_after) || (Number.isFinite(retryHeader) ? retryHeader : 1);
                    await sleep(Math.ceil(retrySec * 1000) + 200);
                    continue;
                }

                if (res.ok) {
                    syncedCount++;
                    const remaining = res.headers.get('x-ratelimit-remaining');
                    if (remaining === '0') {
                        const resetAfter = Number(res.headers.get('x-ratelimit-reset-after')) || 1;
                        await sleep(Math.ceil(resetAfter * 1000) + 150);
                    }
                    done = true;
                    break;
                }

                const errText = await res.text().catch(() => '');
                let errBody = null;
                try {
                    errBody = JSON.parse(errText);
                } catch {
                    errBody = null;
                }

                if (errBody?.code === 10063 && attempt < 2) {
                    await sleep(1200);
                    continue;
                }

                console.error(`[Moderation] Sync oprávnení zlyhal pre /${cmd.name}:`, res.status, errBody || errText);
                return {
                    synced: false,
                    reason: 'api_error',
                    status: res.status,
                    code: errBody?.code || null,
                    detail: errBody?.message || errText || ''
                };
            } catch (err) {
                console.error(`[Moderation] Sync oprávnení sieťová chyba pre /${cmd.name}:`, err);
                return {
                    synced: false,
                    reason: 'api_error',
                    status: 0,
                    code: null,
                    detail: err?.message || ''
                };
            }
        }

        if (!done) {
            return {
                synced: false,
                reason: 'api_error',
                status: 429,
                code: null,
                detail: 'Rate limit'
            };
        }
    }

    return { synced: true, count: syncedCount };
}

module.exports = {
    loadCommands,
    registerCommands,
    syncAdminCommandPermissions
};
