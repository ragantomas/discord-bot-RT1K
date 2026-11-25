import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useLocation } from 'react-router-dom';
import { announcementsApi } from '@/api/announcements';
import { logsApi } from '@/api/logs';
import { moderationApi } from '@/api/moderation';
import { overviewApi } from '@/api/overview';
import { playersApi } from '@/api/players';
import { settingsApi } from '@/api/settings';
import { tempVoiceApi } from '@/api/tempvoice';
import { ticketsApi } from '@/api/tickets';
import { POLLING } from '@/config/constants';
import { getNavItemByPath } from '@/config/navigation';
import { useAuth } from '@/context/AuthContext';
import type {
  ActivityLogEntry,
  AnnouncementHistoryEntry,
  BanEntry,
  GuildMeta,
  OpenTicket,
  OverviewData,
  PlayerSummary,
  RankUpdaterStatus,
  SectionId,
  SettingsData,
  TempVoiceRoom,
} from '@/types/api';

export interface DirtyHandlers {
  onSave: () => Promise<void> | void;
  onDiscard: () => void;
}

interface DashboardContextValue {
  activeSection: SectionId;
  initialLoading: boolean;
  overview: OverviewData | null;
  meta: GuildMeta | null;
  settings: SettingsData | null;
  steamApiKeyConfigured: boolean;
  rankUpdaterStatus: RankUpdaterStatus | null;
  players: PlayerSummary[];
  tempRooms: TempVoiceRoom[];
  openTickets: OpenTicket[];
  bans: BanEntry[];
  logs: ActivityLogEntry[];
  announcementsHistory: AnnouncementHistoryEntry[];
  isDirty: boolean;
  registerDirty: (handlers: DirtyHandlers) => void;
  clearDirty: () => void;
  triggerDirtySave: () => Promise<void>;
  triggerDirtyDiscard: () => void;
  setSettingsSlice: <K extends keyof SettingsData>(key: K, value: SettingsData[K]) => void;
  replaceSettings: (next: SettingsData) => void;
  setRankUpdaterStatus: (next: RankUpdaterStatus | null) => void;
  setLogs: (next: ActivityLogEntry[]) => void;
  setAnnouncementsHistory: (next: AnnouncementHistoryEntry[]) => void;
  refreshOverview: () => Promise<void>;
  refreshMeta: () => Promise<void>;
  refreshPlayers: () => Promise<void>;
  refreshTempRooms: () => Promise<void>;
  refreshOpenTickets: () => Promise<void>;
  refreshBans: () => Promise<void>;
  refreshLogs: () => Promise<void>;
  refreshAnnouncementsHistory: () => Promise<void>;
  reloadAll: () => Promise<void>;
}

const DashboardContext = createContext<DashboardContextValue | null>(null);

export function DashboardProvider({ children }: { children: ReactNode }) {
  const { auth } = useAuth();
  const location = useLocation();
  const activeSection = getNavItemByPath(location.pathname).id;

  const [initialLoading, setInitialLoading] = useState(true);
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [meta, setMeta] = useState<GuildMeta | null>(null);
  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [steamApiKeyConfigured, setSteamApiKeyConfigured] = useState(false);
  const [rankUpdaterStatus, setRankUpdaterStatus] = useState<RankUpdaterStatus | null>(null);
  const [players, setPlayers] = useState<PlayerSummary[]>([]);
  const [tempRooms, setTempRooms] = useState<TempVoiceRoom[]>([]);
  const [openTickets, setOpenTickets] = useState<OpenTicket[]>([]);
  const [bans, setBans] = useState<BanEntry[]>([]);
  const [logs, setLogs] = useState<ActivityLogEntry[]>([]);
  const [announcementsHistory, setAnnouncementsHistory] = useState<AnnouncementHistoryEntry[]>([]);

  const [isDirty, setIsDirty] = useState(false);
  const dirtyHandlersRef = useRef<DirtyHandlers | null>(null);
  const pollingInFlightRef = useRef(false);
  const pollSeqRef = useRef(0);

  const registerDirty = useCallback((handlers: DirtyHandlers) => {
    dirtyHandlersRef.current = handlers;
    setIsDirty(true);
  }, []);

  const clearDirty = useCallback(() => {
    dirtyHandlersRef.current = null;
    setIsDirty(false);
  }, []);

  const triggerDirtySave = useCallback(async () => {
    if (dirtyHandlersRef.current) {
      await dirtyHandlersRef.current.onSave();
    }
  }, []);

  const triggerDirtyDiscard = useCallback(() => {
    if (dirtyHandlersRef.current) {
      dirtyHandlersRef.current.onDiscard();
    }
    dirtyHandlersRef.current = null;
    setIsDirty(false);
  }, []);

  useEffect(() => {
    clearDirty();
  }, [activeSection, clearDirty]);

  const setSettingsSlice = useCallback(<K extends keyof SettingsData>(key: K, value: SettingsData[K]) => {
    setSettings((prev) => (prev ? { ...prev, [key]: value } : prev));
  }, []);

  const replaceSettings = useCallback((next: SettingsData) => {
    setSettings(next);
  }, []);

  const refreshOverview = useCallback(async () => {
    const data = await overviewApi.getOverview();
    setOverview(data);
  }, []);

  const refreshMeta = useCallback(async () => {
    const data = await overviewApi.getMeta();
    setMeta(data);
  }, []);

  const refreshPlayers = useCallback(async () => {
    const data = await playersApi.list();
    setPlayers(data.players || []);
  }, []);

  const refreshTempRooms = useCallback(async () => {
    const data = await tempVoiceApi.listRooms();
    setTempRooms(data.rooms || []);
  }, []);

  const refreshOpenTickets = useCallback(async () => {
    const data = await ticketsApi.listOpen();
    setOpenTickets(data.openTickets || []);
  }, []);

  const refreshBans = useCallback(async () => {
    const data = await moderationApi.listBans();
    setBans(data.bans || []);
  }, []);

  const refreshLogs = useCallback(async () => {
    const data = await logsApi.list('all');
    setLogs(data.logs || []);
  }, []);

  const refreshAnnouncementsHistory = useCallback(async () => {
    const data = await announcementsApi.history();
    setAnnouncementsHistory(data.history || []);
  }, []);

  const reloadAll = useCallback(async () => {
    setInitialLoading(true);
    try {
      const [ov, gm, st, pl, rooms, tk, logRes, ann] = await Promise.all([
        overviewApi.getOverview(),
        overviewApi.getMeta(),
        settingsApi.getAll(),
        playersApi.list(),
        tempVoiceApi.listRooms(),
        ticketsApi.listOpen(),
        logsApi.list('all'),
        announcementsApi.history(),
      ]);
      setOverview(ov);
      setMeta(gm);
      setSettings(st.settings);
      setSteamApiKeyConfigured(Boolean(st.steamApiKeyConfigured));
      setRankUpdaterStatus(st.rankUpdaterStatus || null);
      setPlayers(pl.players || []);
      setTempRooms(rooms.rooms || []);
      setOpenTickets(tk.openTickets || []);
      setLogs(logRes.logs || []);
      setAnnouncementsHistory(ann.history || []);

      moderationApi
        .listBans()
        .then((res) => setBans(res.bans || []))
        .catch(() => setBans([]));
    } finally {
      setInitialLoading(false);
    }
  }, []);

  useEffect(() => {
    if (auth?.authorized) {
      void reloadAll();
    }
  }, [auth?.authorized, reloadAll]);

  const pollNow = useCallback(async (section: SectionId, opts?: { force?: boolean }) => {
    const force = Boolean(opts?.force);
    if (!force && (document.hidden || pollingInFlightRef.current)) return;

    const seq = ++pollSeqRef.current;
    pollingInFlightRef.current = true;
    try {
      const data = await overviewApi.getLive(section);
      if (seq !== pollSeqRef.current) return;

      if (data.overview) {
        setOverview(data.overview);
      }
      if (data.rankUpdaterStatus) {
        setRankUpdaterStatus(data.rankUpdaterStatus);
      }
      if (Array.isArray(data.players)) {
        setPlayers(data.players);
      }
      if (Array.isArray(data.rooms)) {
        setTempRooms(data.rooms);
      }
      if (Array.isArray(data.logs)) {
        setLogs(data.logs);
      }
      if (Array.isArray(data.openTickets)) {
        setOpenTickets(data.openTickets);
      }
      if (Array.isArray(data.announcementsHistory)) {
        setAnnouncementsHistory(data.announcementsHistory);
      }
    } catch {
      // Ignore transient network hiccups during background polling
    } finally {
      if (seq === pollSeqRef.current) {
        pollingInFlightRef.current = false;
      }
    }
  }, []);

  useEffect(() => {
    if (!auth?.authorized || initialLoading) return;

    void pollNow(activeSection, { force: true });
    if (activeSection === 'moderation') {
      void refreshBans().catch(() => null);
    } else if (activeSection === 'announcements') {
      void refreshAnnouncementsHistory().catch(() => null);
    }

    const pollTimer = window.setInterval(() => {
      void pollNow(activeSection);
    }, POLLING.LIVE_INTERVAL_MS);

    const handleVisibilityOrFocus = () => {
      if (!document.hidden) {
        void pollNow(activeSection, { force: true });
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityOrFocus);
    window.addEventListener('focus', handleVisibilityOrFocus);

    return () => {
      window.clearInterval(pollTimer);
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
      window.removeEventListener('focus', handleVisibilityOrFocus);
    };
  }, [
    auth?.authorized,
    initialLoading,
    activeSection,
    pollNow,
    refreshBans,
    refreshAnnouncementsHistory,
  ]);

  const value = useMemo(
    () => ({
      activeSection,
      initialLoading,
      overview,
      meta,
      settings,
      steamApiKeyConfigured,
      rankUpdaterStatus,
      players,
      tempRooms,
      openTickets,
      bans,
      logs,
      announcementsHistory,
      isDirty,
      registerDirty,
      clearDirty,
      triggerDirtySave,
      triggerDirtyDiscard,
      setSettingsSlice,
      replaceSettings,
      setRankUpdaterStatus,
      setLogs,
      setAnnouncementsHistory,
      refreshOverview,
      refreshMeta,
      refreshPlayers,
      refreshTempRooms,
      refreshOpenTickets,
      refreshBans,
      refreshLogs,
      refreshAnnouncementsHistory,
      reloadAll,
    }),
    [
      activeSection,
      initialLoading,
      overview,
      meta,
      settings,
      steamApiKeyConfigured,
      rankUpdaterStatus,
      players,
      tempRooms,
      openTickets,
      bans,
      logs,
      announcementsHistory,
      isDirty,
      registerDirty,
      clearDirty,
      triggerDirtySave,
      triggerDirtyDiscard,
      setSettingsSlice,
      replaceSettings,
      refreshOverview,
      refreshMeta,
      refreshPlayers,
      refreshTempRooms,
      refreshOpenTickets,
      refreshBans,
      refreshLogs,
      refreshAnnouncementsHistory,
      reloadAll,
    ],
  );

  return <DashboardContext.Provider value={value}>{children}</DashboardContext.Provider>;
}

export function useDashboard(): DashboardContextValue {
  const ctx = useContext(DashboardContext);
  if (!ctx) throw new Error('useDashboard must be used within DashboardProvider');
  return ctx;
}
