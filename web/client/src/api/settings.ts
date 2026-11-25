import { http } from '@/api/client';
import type {
  AdminLogSettings,
  CsStatusSettings,
  JoinRolesSettings,
  PatchBotSettings,
  RankFeedSettings,
  RankRoleConfig,
  RankUpdaterSettings,
  RankUpdaterStatus,
  SettingsApiResponse,
  SettingsData,
  WelcomeSettings,
} from '@/types/api';

export interface GeneralSettingsPayload {
  dashboardRoleIds: string[];
  allowedChannelId: string | null;
  allowedChannelBypassRoleIds: string[];
  unrankedRoleId: string | null;
  rankRoles: Array<{ min: number; roleId: string; color: string | number }>;
  rankUpdater: RankUpdaterSettings;
  botStatus: { text: string };
}

export const settingsApi = {
  getAll: () => http.get<SettingsApiResponse>('/api/settings'),
  saveGeneral: (payload: GeneralSettingsPayload) =>
    http.put<{ ok: boolean; settings: SettingsData; rankUpdaterStatus: RankUpdaterStatus }>(
      '/api/settings/general',
      payload,
    ),

  savePatchBot: (payload: {
    enabled: boolean;
    channelIds: string[];
    roleId: string | null;
    mode: 'all' | 'patchnotes';
  }) => http.put<{ ok: boolean; patchBot: PatchBotSettings }>('/api/settings/patchbot', payload),
  sendLatestPatch: (withPing: boolean) =>
    http.post<{ ok: boolean; title: string; sentCount: number; patchBot: PatchBotSettings }>(
      '/api/patchbot/latest',
      { withPing },
    ),

  saveJoinRoles: (payload: JoinRolesSettings) =>
    http.put<{ ok: boolean; joinRoles: JoinRolesSettings }>('/api/settings/joinroles', payload),

  saveCsStatus: (payload: { enabled: boolean; channelId: string | null; interval: string }) =>
    http.put<{ ok: boolean; csStatus: CsStatusSettings }>('/api/settings/csstatus', payload),
  refreshCsStatus: () => http.post<{ ok: boolean; csStatus: CsStatusSettings }>('/api/csstatus/refresh'),

  saveRankFeed: (payload: RankFeedSettings) =>
    http.put<{ ok: boolean; rankFeed: RankFeedSettings }>('/api/settings/rankfeed', payload),
  testRankFeed: () => http.post<{ ok: boolean }>('/api/rankfeed/test'),

  saveAdminLog: (payload: AdminLogSettings) =>
    http.put<{ ok: boolean; adminLog: AdminLogSettings }>('/api/settings/adminlog', payload),
  testAdminLog: () => http.post<{ ok: boolean }>('/api/adminlog/test'),

  saveWelcome: (payload: WelcomeSettings) =>
    http.put<{ ok: boolean; welcome: WelcomeSettings }>('/api/settings/welcome', payload),
  testWelcome: (target: 'channel' | 'dm' | 'goodbye') =>
    http.post<{ ok: boolean }>('/api/welcome/test', { target }),
};

export type { RankRoleConfig };
