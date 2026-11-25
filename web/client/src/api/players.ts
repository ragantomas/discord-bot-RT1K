import { http } from '@/api/client';
import type { PlayerDetailResponse, PlayerSummary } from '@/types/api';

export const playersApi = {
  list: () => http.get<{ players: PlayerSummary[] }>('/api/players'),
  link: (payload: { userId: string; profile: string }) =>
    http.post<{ ok: boolean; userId: string; steamId: string; elo: number | null }>('/api/players/link', payload),
  unlink: (userId: string) => http.delete<{ ok: boolean }>(`/api/players/${encodeURIComponent(userId)}`),
  detail: (userId: string) => http.get<PlayerDetailResponse>(`/api/players/${encodeURIComponent(userId)}/detail`),
  addRole: (userId: string, roleId: string) =>
    http.post<{ ok: boolean }>(`/api/players/${encodeURIComponent(userId)}/roles`, { roleId }),
  removeRole: (userId: string, roleId: string) =>
    http.delete<{ ok: boolean }>(
      `/api/players/${encodeURIComponent(userId)}/roles/${encodeURIComponent(roleId)}`,
    ),
  setNickname: (userId: string, nickname: string) =>
    http.put<{ ok: boolean; nickname: string | null }>(`/api/players/${encodeURIComponent(userId)}/nickname`, {
      nickname,
    }),
  voiceAction: (userId: string, payload: { action: 'disconnect' | 'move'; channelId?: string | null }) =>
    http.post<{ ok: boolean }>(`/api/players/${encodeURIComponent(userId)}/voice`, payload),
};
