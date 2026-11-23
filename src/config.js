const path = require('path');

const UNRANKED_ROLE_ID = '1574198222476541992';
const OWNER_ID = '713707568429793331';

const RANK_ROLES = [
    { min: 30000, roleId: '1574199974265225347', color: 0xFFD700 }, // 30 000+ (Gold)
    { min: 25000, roleId: '1574199760271835166', color: 0xEB4B4B }, // 25 000 – 29 999 (Red)
    { min: 20000, roleId: '1574199687895064576', color: 0xD32CE6 }, // 20 000 – 24 999 (Pink)
    { min: 15000, roleId: '1574199550946840638', color: 0x8847FF }, // 15 000 – 19 999 (Purple)
    { min: 10000, roleId: '1574199371908517919', color: 0x4B69FF }, // 10 000 – 14 999 (Blue)
    { min: 5000, roleId: '1574199278841237676', color: 0x5E98D9 }, // 5 000 – 9 999 (Light Blue)
    { min: 1000, roleId: '1574199085664182413', color: 0xB0C3D9 }  // 1 000 – 4 999 (Grey)
];

const ALL_RANK_ROLE_IDS = [...RANK_ROLES.map(r => r.roleId), UNRANKED_ROLE_ID];

const DB_FILE = path.join(__dirname, '..', 'users.json');
const TEMPVOICE_DB_FILE = path.join(__dirname, '..', 'tempvoice.json');
const PATCHBOT_DB_FILE = path.join(__dirname, '..', 'patchbot.json');
const JOINROLES_DB_FILE = path.join(__dirname, '..', 'joinroles.json');
const CSSTATUS_DB_FILE = path.join(__dirname, '..', 'csstatus.json');

const CS2_APP_ID = 730;
const CS2_ICON_URL = 'https://shared.fastly.steamstatic.com/community_assets/images/apps/730/8dbc71957312bbd3baea65848b545be9eae2a355.jpg';

const PATCHBOT_DEFAULTS = {
    mode: 'all',
    roleId: null
};

const CSSTATUS_DEFAULTS = {
    intervalMinutes: 5
};

const TEMPVOICE_DEFAULTS = {
    triggerName: '➕ Vytvoriť miestnosť',
    roomNameTemplate: '🎮 {user}',
    bitrateKbps: 64,
    userLimit: 0
};

const INTERVALS = {
    RANK_UPDATE_MS: 1 * 60 * 60 * 1000,
    RANK_UPDATE_DELAY_MS: 2000,
    DAILY_BACKUP_MS: 24 * 60 * 60 * 1000,
    PATCH_CHECK_MS: 5 * 60 * 1000,
    CS_STATUS_TICK_MS: 60 * 1000
};

module.exports = {
    OWNER_ID,
    UNRANKED_ROLE_ID,
    RANK_ROLES,
    ALL_RANK_ROLE_IDS,
    CS2_APP_ID,
    CS2_ICON_URL,
    DB_FILE,
    TEMPVOICE_DB_FILE,
    PATCHBOT_DB_FILE,
    JOINROLES_DB_FILE,
    CSSTATUS_DB_FILE,
    PATCHBOT_DEFAULTS,
    CSSTATUS_DEFAULTS,
    TEMPVOICE_DEFAULTS,
    INTERVALS
};
