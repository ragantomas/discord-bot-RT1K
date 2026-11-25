import { http } from '@/api/client';
import type { OpenTicket, TicketsSettings } from '@/types/api';

export const ticketsApi = {
  saveSettings: (payload: Omit<TicketsSettings, 'panelMessageId' | 'ticketCounter'>) =>
    http.put<{ ok: boolean; tickets: TicketsSettings }>('/api/settings/tickets', payload),
  sendPanel: () =>
    http.post<{ ok: boolean; messageId: string; tickets: TicketsSettings }>('/api/tickets/panel'),
  listOpen: () => http.get<{ openTickets: OpenTicket[] }>('/api/tickets/open'),
  close: (channelId: string) =>
    http.delete<{ ok: boolean }>(`/api/tickets/${encodeURIComponent(channelId)}`),
};
