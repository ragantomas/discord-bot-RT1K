import type { LogLevel } from '@/types/api';

export const DEFAULT_AVATAR_URL = 'https://cdn.discordapp.com/embed/avatars/0.png';
export const DEFAULT_EMBED_COLOR = '#5865F2';

export const LOG_LEVEL_STYLES: Record<LogLevel, { dot: string; badge: string }> = {
  info: {
    dot: 'bg-sky-400',
    badge: 'bg-sky-500/10 text-sky-300 border-sky-500/30',
  },
  success: {
    dot: 'bg-emerald-400',
    badge: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
  },
  warn: {
    dot: 'bg-amber-400',
    badge: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
  },
  error: {
    dot: 'bg-red-400',
    badge: 'bg-red-500/10 text-red-300 border-red-500/30',
  },
};

export const LOG_CATEGORY_LABEL_KEYS: Record<string, string> = {
  all: 'logs.categories.all',
  audit: 'logs.categories.audit',
  dashboard: 'logs.categories.audit',
  moderation: 'logs.categories.moderation',
  elo: 'logs.categories.elo',
  tempvoice: 'logs.categories.tempvoice',
  patchbot: 'logs.categories.patchbot',
  joinroles: 'logs.categories.joinroles',
  adminlog: 'logs.categories.adminlog',
  welcome: 'logs.categories.welcome',
  tickets: 'logs.categories.tickets',
  voice: 'logs.categories.voice',
  system: 'logs.categories.system',
};
