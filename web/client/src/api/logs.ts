import { http } from '@/api/client';
import { API_LIMITS } from '@/config/constants';
import type { ActivityLogEntry } from '@/types/api';

export const logsApi = {
  list: (category = 'all', limit: number = API_LIMITS.LOGS_DEFAULT_LIMIT) =>
    http.get<{ logs: ActivityLogEntry[] }>(
      `/api/logs?category=${encodeURIComponent(category)}&limit=${limit}`,
    ),
  clear: () => http.delete<{ ok: boolean; logs: ActivityLogEntry[] }>('/api/logs'),
};
