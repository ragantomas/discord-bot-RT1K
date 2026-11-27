import { http } from '@/api/client';
import type { BackupPart } from '@/config/constants';
import type { SettingsData } from '@/types/api';

export const backupApi = {
  getDownloadUrl: (parts: BackupPart[]) =>
    `/api/backup/download?parts=${encodeURIComponent(parts.join(','))}`,
  restore: (data: unknown) =>
    http.post<{ ok: boolean; restored: string[]; settings: SettingsData }>('/api/backup/restore', {
      data,
    }),
};
