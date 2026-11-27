import type { AppLanguage, EscalationAction, TempVoiceSetup } from '@/types/api';

export const DEFAULT_LANGUAGE: AppLanguage = 'sk';
export const SUPPORTED_LANGUAGES: readonly AppLanguage[] = ['sk', 'en'] as const;

export const STORAGE_KEYS = {
  LANGUAGE: 'rt1k_dashboard_lang',
} as const;

export const POLLING = {
  LIVE_INTERVAL_MS: 5000,
  UPTIME_TICK_MS: 1000,
  TOAST_DURATION_MS: 4200,
} as const;

export const API_LIMITS = {
  LOGS_DEFAULT_LIMIT: 500,
  ANNOUNCEMENT_TITLE_MAX: 256,
  ANNOUNCEMENT_DESCRIPTION_MAX: 4096,
  ANNOUNCEMENT_CONTENT_MAX: 2000,
  ANNOUNCEMENT_FOOTER_MAX: 2048,
  NICKNAME_MAX: 32,
  BOT_STATUS_MAX: 128,
  ROOM_NAME_MAX: 100,
  CS_STATUS_MIN_SECONDS: 30,
  CS_STATUS_MAX_SECONDS: 3600,
  TEMPVOICE_MIN_BITRATE: 8,
  TEMPVOICE_MAX_BITRATE: 384,
  TEMPVOICE_MIN_LIMIT: 0,
  TEMPVOICE_MAX_LIMIT: 99,
  ESCALATION_MIN_THRESHOLD: 1,
  ESCALATION_MAX_THRESHOLD: 50,
  ESCALATION_MAX_DURATION_MIN: 40320,
} as const;

export const RANK_UPDATER_LIMITS = {
  activeMin: 3,
  activeMax: 30,
  postMatchMin: 2,
  postMatchMax: 15,
  backgroundMin: 15,
  backgroundMax: 720,
  inactiveMin: 6,
  inactiveMax: 48,
} as const;

export const OAUTH_ERROR_KEYS: Record<string, string> = {
  bot_starting: 'auth.errors.botStarting',
  oauth_config: 'auth.errors.oauthConfig',
  oauth_cancelled: 'auth.errors.oauthCancelled',
  oauth_state: 'auth.errors.oauthState',
  oauth_failed: 'auth.errors.oauthFailed',
};

export const BOT_STATUS_VARIABLES = [
  { token: '{players}', labelKey: 'settings.botStatusVars.players' },
  { token: '{members}', labelKey: 'settings.botStatusVars.members' },
  { token: '{rooms}', labelKey: 'settings.botStatusVars.rooms' },
  { token: '{top_elo}', labelKey: 'settings.botStatusVars.topElo' },
  { token: '{ping}', labelKey: 'settings.botStatusVars.ping' },
  { token: '{uptime}', labelKey: 'settings.botStatusVars.uptime' },
] as const;

export const WELCOME_VARIABLES = [
  { token: '{user}', labelKey: 'welcome.vars.mention' },
  { token: '{displayname}', labelKey: 'welcome.vars.displayName' },
  { token: '{username}', labelKey: 'welcome.vars.username' },
  { token: '{server}', labelKey: 'welcome.vars.server' },
  { token: '{members}', labelKey: 'welcome.vars.members' },
] as const;

export const BAN_DELETE_PRESETS = [
  { seconds: 0, labelKey: 'moderation.banDelete.none' },
  { seconds: 3600, labelKey: 'moderation.banDelete.1h' },
  { seconds: 86400, labelKey: 'moderation.banDelete.24h' },
  { seconds: 604800, labelKey: 'moderation.banDelete.7d' },
] as const;

export const ESCALATION_ACTIONS: readonly EscalationAction[] = ['timeout', 'kick', 'ban'] as const;

export const LOG_FILTER_CATEGORIES = [
  'all',
  'audit',
  'moderation',
  'elo',
  'tempvoice',
  'patchbot',
  'joinroles',
  'adminlog',
  'welcome',
  'tickets',
  'system',
] as const;

export const DEFAULT_TEMPVOICE_SETUP_FACTORY = (index: number): TempVoiceSetup => ({
  id: `tv_${Date.now()}_${index + 1}`,
  enabled: true,
  triggerChannelId: null,
  categoryId: null,
  triggerName: '➕ Vytvoriť miestnosť',
  roomNameTemplate: '🎮 {user}',
  bitrateKbps: 64,
  userLimit: 0,
  lockOnDisable: false,
  lockRoleIds: [],
  createTriggerChannel: false,
});

export const BACKUP_PARTS = [
  'settings',
  'users',
  'warnings',
  'moderation',
  'playerActivity',
  'activityLog',
] as const;
export type BackupPart = (typeof BACKUP_PARTS)[number];
