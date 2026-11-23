const { ActivityType } = require('discord.js');
const { loadUsers } = require('../storage/usersStore');
const { getBotStatusSettings } = require('../storage/settingsStore');

const ACTIVITY_TYPE_MAP = {
    Custom: ActivityType.Custom,
    Playing: ActivityType.Playing,
    Watching: ActivityType.Watching,
    Listening: ActivityType.Listening,
    Competing: ActivityType.Competing
};

function updateBotStatus(client) {
    if (!client.user) return;

    const statusConfig = getBotStatusSettings();

    if (statusConfig.mode === 'custom' && statusConfig.customText) {
        const type = ACTIVITY_TYPE_MAP[statusConfig.activityType] ?? ActivityType.Custom;
        if (type === ActivityType.Custom) {
            client.user.setActivity({
                name: 'custom',
                type: ActivityType.Custom,
                state: statusConfig.customText
            });
        } else {
            client.user.setActivity({
                name: statusConfig.customText,
                type
            });
        }
        return;
    }

    const count = Object.keys(loadUsers()).length;
    const text = count === 1 ? '1 CS2 hráča' : `${count} CS2 hráčov`;
    client.user.setActivity({
        name: 'custom',
        type: ActivityType.Custom,
        state: `Sleduje ${text}`
    });
}

module.exports = { updateBotStatus };
