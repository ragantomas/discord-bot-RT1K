import { http } from '@/api/client';
import type { BackupTarget } from '@/config/constants';
import type { SettingsData } from '@/types/api';

export const backupApi = {
  getDownloadUrl: (target: BackupTarget) => `/api/backup/download/${encodeURIComponent(target)}`,
  restore: (data: unknown) =>
    http.post<{ ok: boolean; restored: string[]; settings: SettingsData }>('/api/backup/restore', {
      data,
    }),
};
