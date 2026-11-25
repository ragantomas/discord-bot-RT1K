import { http } from '@/api/client';
import type { AnnouncementHistoryEntry } from '@/types/api';

export interface AnnouncementPayload {
  channelId?: string;
  content: string;
  title: string;
  description: string;
  color: string;
  thumbnailUrl: string;
  imageUrl: string;
  footerText: string;
  roleId: string | null;
  timestamp: boolean;
  crosspost?: boolean;
}

export const announcementsApi = {
  history: () => http.get<{ history: AnnouncementHistoryEntry[] }>('/api/announcements/history'),
  send: (payload: AnnouncementPayload & { channelId: string }) =>
    http.post<{ ok: boolean; entry: AnnouncementHistoryEntry; history: AnnouncementHistoryEntry[] }>(
      '/api/announcements/send',
      payload,
    ),
  update: (channelId: string, messageId: string, payload: AnnouncementPayload) =>
    http.put<{ ok: boolean; entry: AnnouncementHistoryEntry; history: AnnouncementHistoryEntry[] }>(
      `/api/announcements/${encodeURIComponent(channelId)}/${encodeURIComponent(messageId)}`,
      payload,
    ),
};
