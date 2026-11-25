import { http } from '@/api/client';
import type { GuildMeta, LivePayload, OverviewData, SectionId } from '@/types/api';

export const overviewApi = {
  getOverview: () => http.get<OverviewData>('/api/overview'),
  getMeta: () => http.get<GuildMeta>('/api/guild/meta'),
  getLive: (section: SectionId) =>
    http.get<LivePayload>(`/api/live?section=${encodeURIComponent(section)}`, {
      skipUnauthorizedRedirect: false,
    }),
};
