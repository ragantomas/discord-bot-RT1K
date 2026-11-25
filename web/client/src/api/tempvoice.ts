import { http } from '@/api/client';
import type { TempVoiceRoom, TempVoiceSetup } from '@/types/api';

export const tempVoiceApi = {
  saveSettings: (payload: { enabled: boolean; setups: TempVoiceSetup[] }) =>
    http.put<{ ok: boolean; tempVoice: { enabled: boolean; setups: TempVoiceSetup[] }; warnings: string[] }>(
      '/api/settings/tempvoice',
      payload,
    ),
  listRooms: () => http.get<{ rooms: TempVoiceRoom[] }>('/api/tempvoice/rooms'),
  toggleLock: (channelId: string) =>
    http.post<{ ok: boolean; locked: boolean }>(
      `/api/tempvoice/rooms/${encodeURIComponent(channelId)}/toggle-lock`,
    ),
  closeRoom: (channelId: string) =>
    http.delete<{ ok: boolean }>(`/api/tempvoice/rooms/${encodeURIComponent(channelId)}`),
  renameRoom: (channelId: string, name: string) =>
    http.post<{ ok: boolean; name: string }>(`/api/tempvoice/rooms/${encodeURIComponent(channelId)}/rename`, {
      name,
    }),
  kickMember: (channelId: string, userId: string) =>
    http.post<{ ok: boolean; displayName: string }>(
      `/api/tempvoice/rooms/${encodeURIComponent(channelId)}/kick/${encodeURIComponent(userId)}`,
    ),
};
