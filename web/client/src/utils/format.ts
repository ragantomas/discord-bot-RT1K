import type { AppLanguage, OverviewData } from '@/types/api';

export function getLocaleCode(lang: AppLanguage): string {
  return lang === 'sk' ? 'sk-SK' : 'en-GB';
}

export function formatNumber(value: number, lang: AppLanguage): string {
  return value.toLocaleString(getLocaleCode(lang));
}

export function formatDuration(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0 || days > 0) parts.push(`${hours}h`);
  if (mins > 0 || hours > 0 || days > 0) parts.push(`${mins}m`);
  parts.push(`${secs}s`);
  return parts.join(' ');
}

export function formatCompactUptime(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${Math.max(1, mins)}m`;
}

export function formatIntervalLabel(seconds: number): string {
  const sec = Number(seconds) || 300;
  if (sec % 60 === 0) return `${sec / 60}m`;
  return `${sec}s`;
}

export function splitIntervalParts(seconds: number): { value: number; unit: 's' | 'm' } {
  const sec = Number(seconds) || 300;
  if (sec >= 60 && sec % 60 === 0) {
    return { value: sec / 60, unit: 'm' };
  }
  return { value: sec, unit: 's' };
}

export function formatDateTime(timestampMs: number | null | undefined, lang: AppLanguage): string {
  if (!timestampMs) return '—';
  return new Date(timestampMs).toLocaleString(getLocaleCode(lang), {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatShortDate(timestampMs: number | null | undefined, lang: AppLanguage): string {
  if (!timestampMs) return '—';
  return new Date(timestampMs).toLocaleDateString(getLocaleCode(lang), {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export function formatRelativeTime(timestampMs: number | null | undefined, lang: AppLanguage): string {
  if (!timestampMs) return '—';
  const diffSec = Math.round((Date.now() - timestampMs) / 1000);
  const abs = Math.abs(diffSec);
  const future = diffSec < 0;

  const rtf = new Intl.RelativeTimeFormat(getLocaleCode(lang), { numeric: 'auto' });
  if (abs < 60) return rtf.format(future ? abs : -abs, 'second');
  const mins = Math.round(abs / 60);
  if (mins < 60) return rtf.format(future ? mins : -mins, 'minute');
  const hours = Math.round(mins / 60);
  if (hours < 24) return rtf.format(future ? hours : -hours, 'hour');
  const days = Math.round(hours / 24);
  if (days < 30) return rtf.format(future ? days : -days, 'day');
  const months = Math.round(days / 30);
  return rtf.format(future ? months : -months, 'month');
}

export function formatHexColor(colorVal: number | string | null | undefined, fallback = '#808080'): string {
  if (typeof colorVal === 'string') {
    const cleaned = colorVal.trim();
    if (/^#[0-9a-f]{6}$/i.test(cleaned)) return cleaned.toUpperCase();
    if (/^[0-9a-f]{6}$/i.test(cleaned)) return `#${cleaned.toUpperCase()}`;
  }
  if (typeof colorVal === 'number' && Number.isFinite(colorVal)) {
    return `#${(colorVal & 0xffffff).toString(16).padStart(6, '0').toUpperCase()}`;
  }
  return fallback;
}

export function pickSlovakPlural(count: number, formsStr: string): string {
  const forms = formsStr.split('|').map((s) => s.trim());
  const n = Math.abs(Math.floor(Number(count) || 0));
  if (forms.length === 1) return forms[0];
  if (forms.length === 2) return n === 1 ? forms[0] : forms[1];
  if (n === 1) return forms[0];
  if (n >= 2 && n <= 4) return forms[1];
  return forms[2];
}

export function resolveBotStatusPreview(template: string, overview: OverviewData | null, lang: AppLanguage): string {
  const trimmed = template.trim();
  if (!trimmed) return '';

  const values: Record<string, number | string> = {
    players: overview?.stats.linkedPlayersCount ?? 0,
    members: overview?.guild.memberCount ?? 0,
    rooms: overview?.stats.activeTempRoomsCount ?? 0,
    top_elo: overview?.stats.topElo ? formatNumber(overview.stats.topElo, lang) : '0',
    ping: overview?.bot.ping ?? 0,
    uptime: formatCompactUptime(overview?.bot.uptimeMs ?? 0),
  };

  let output = trimmed.replace(/\{(\w+):([^}]+)\}/g, (match, key: string, forms: string) => {
    const numVal = values[key];
    if (typeof numVal !== 'number') return match;
    return pickSlovakPlural(numVal, forms);
  });

  output = output.replace(/\{(\w+)\}/g, (match, key: string) => {
    if (key in values) return String(values[key]);
    return match;
  });

  return output.slice(0, 128);
}

export function formatMinutesDuration(minutes: number, lang: AppLanguage): string {
  const mins = Math.max(0, Math.round(minutes));
  if (mins >= 1440 && mins % 1440 === 0) {
    const d = mins / 1440;
    return lang === 'sk' ? `${d} d` : `${d}d`;
  }
  if (mins >= 60 && mins % 60 === 0) {
    const h = mins / 60;
    return lang === 'sk' ? `${h} h` : `${h}h`;
  }
  return lang === 'sk' ? `${mins} min` : `${mins}m`;
}
