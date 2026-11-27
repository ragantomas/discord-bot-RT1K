const path = require('path');

const UNRANKED_ROLE_ID = '1574198222476541992';
const OWNER_ID = '713707568429793331';

const RANK_ROLES = [
    { min: 30000, roleId: '1574199974265225347', color: 0xFFD700 },
    { min: 25000, roleId: '1574199760271835166', color: 0xEB4B4B },
    { min: 20000, roleId: '1574199687895064576', color: 0xD32CE6 },
    { min: 15000, roleId: '1574199550946840638', color: 0x8847FF },
    { min: 10000, roleId: '1574199371908517919', color: 0x4B69FF },
    { min: 5000, roleId: '1574199278841237676', color: 0x5E98D9 },
    { min: 1000, roleId: '1574199085664182413', color: 0xB0C3D9 }
];

const ALL_RANK_ROLE_IDS = [...RANK_ROLES.map(r => r.roleId), UNRANKED_ROLE_ID];

const DB_FILE = path.join(__dirname, '..', 'users.json');
const SETTINGS_FILE = path.join(__dirname, '..', 'settings.json');
const ACTIVITY_LOG_FILE = path.join(__dirname, '..', 'activity.json');
const WARNINGS_FILE = path.join(__dirname, '..', 'warnings.json');
const PLAYER_ACTIVITY_FILE = path.join(__dirname, '..', 'player_activity.json');
const TEMPVOICE_DB_FILE = path.join(__dirname, '..', 'tempvoice.json');
const PATCHBOT_DB_FILE = path.join(__dirname, '..', 'patchbot.json');
const JOINROLES_DB_FILE = path.join(__dirname, '..', 'joinroles.json');
const CSSTATUS_DB_FILE = path.join(__dirname, '..', 'csstatus.json');
const MODERATION_FILE = path.join(__dirname, '..', 'moderation.json');
const BOT_LOG_FILE = path.join(__dirname, '..', 'bot.log');

const CS2_APP_ID = 730;
const CS2_ICON_URL = 'https://shared.fastly.steamstatic.com/community_assets/images/apps/730/8dbc71957312bbd3baea65848b545be9eae2a355.jpg';

const PATCHBOT_DEFAULTS = {
    mode: 'all',
    roleId: null
};

const CSSTATUS_DEFAULTS = {
    intervalSeconds: 300,
    minIntervalSeconds: 30,
    maxIntervalSeconds: 3600
};

const TEMPVOICE_DEFAULTS = {
    triggerName: '➕ Vytvoriť miestnosť',
    roomNameTemplate: '🎮 {user}',
    bitrateKbps: 64,
    userLimit: 0
};

const RANK_UPDATER_DEFAULTS = {
    activeIntervalMinutes: 5,
    postMatchDelayMinutes: 4,
    backgroundIntervalMinutes: 60,
    inactiveIntervalHours: 12,
    useSteamApi: true,
    useDiscordPresence: true
};

const INTERVALS = {
    RANK_UPDATE_MS: 1 * 60 * 60 * 1000,
    RANK_UPDATE_DELAY_MS: 2000,
    RANK_STEAM_POLL_MS: 2 * 60 * 1000,
    RANK_WORKER_TICK_MS: 2000,
    RANK_INACTIVE_DAYS: 14,
    PATCH_CHECK_MS: 5 * 60 * 1000,
    CS_STATUS_TICK_MS: 10 * 1000
};

module.exports = {
    OWNER_ID,
    UNRANKED_ROLE_ID,
    RANK_ROLES,
    ALL_RANK_ROLE_IDS,
    CS2_APP_ID,
    CS2_ICON_URL,
    DB_FILE,
    SETTINGS_FILE,
    ACTIVITY_LOG_FILE,
    WARNINGS_FILE,
    PLAYER_ACTIVITY_FILE,
    MODERATION_FILE,
    BOT_LOG_FILE,
    TEMPVOICE_DB_FILE,
    PATCHBOT_DB_FILE,
    JOINROLES_DB_FILE,
    CSSTATUS_DB_FILE,
    PATCHBOT_DEFAULTS,
    CSSTATUS_DEFAULTS,
    TEMPVOICE_DEFAULTS,
    RANK_UPDATER_DEFAULTS,
    INTERVALS
};
