import { http } from '@/api/client';
import type { AuthMeResponse } from '@/types/api';

export const authApi = {
  me: () => http.get<AuthMeResponse>('/api/auth/me', { skipUnauthorizedRedirect: true }),
  logout: () => http.post<{ ok: boolean }>('/api/logout'),
};
