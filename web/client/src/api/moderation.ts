import { http } from '@/api/client';
import type { BanEntry, ModerationSettings, WarningItem } from '@/types/api';

export const moderationApi = {
  saveSettings: (payload: ModerationSettings) =>
    http.put<{ ok: boolean; moderation: ModerationSettings; warnings: string[] }>(
      '/api/settings/moderation',
      payload,
    ),
  getWarnings: (userId: string) =>
    http.get<{ warnings: WarningItem[] }>(`/api/moderation/warnings/${encodeURIComponent(userId)}`),
  warn: (payload: { userId: string; reason: string }) =>
    http.post<{
      ok: boolean;
      warning: WarningItem;
      total: number;
      escalation: { action: string; durationMinutes?: number } | null;
      warnings: WarningItem[];
    }>('/api/moderation/warn', payload),
  deleteWarning: (userId: string, warningId: number) =>
    http.delete<{ ok: boolean; warnings: WarningItem[] }>(
      `/api/moderation/warnings/${encodeURIComponent(userId)}/${warningId}`,
    ),
  clearWarnings: (userId: string) =>
    http.delete<{ ok: boolean; removedCount: number; warnings: WarningItem[] }>(
      `/api/moderation/warnings/${encodeURIComponent(userId)}`,
    ),
  timeout: (payload: { userId: string; durationMinutes: number; reason?: string }) =>
    http.post<{ ok: boolean; durationLabel?: string }>('/api/moderation/timeout', payload),
  kick: (payload: { userId: string; reason?: string }) =>
    http.post<{ ok: boolean }>('/api/moderation/kick', payload),
  ban: (payload: { userId: string; deleteMessageSeconds: number; reason?: string }) =>
    http.post<{ ok: boolean }>('/api/moderation/ban', payload),
  listBans: () => http.get<{ bans: BanEntry[] }>('/api/moderation/bans'),
  unban: (userId: string, reason?: string) =>
    http.delete<{ ok: boolean }>(`/api/moderation/bans/${encodeURIComponent(userId)}`, { reason }),
};
