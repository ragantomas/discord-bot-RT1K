export type AppLanguage = 'sk' | 'en';

export type SectionId =
  | 'overview'
  | 'players'
  | 'announcements'
  | 'logs'
  | 'tempvoice'
  | 'patchbot'
  | 'joinroles'
  | 'csstatus'
  | 'rankfeed'
  | 'adminlog'
  | 'welcome'
  | 'tickets'
  | 'moderation'
  | 'settings';

export interface BotBasicInfo {
  id: string | null;
  username: string;
  avatarUrl: string | null;
  online: boolean;
}

export interface GuildBasicInfo {
  id: string;
  name: string;
  iconUrl: string | null;
}

export interface AuthUser {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface AuthMeResponse {
  authenticated: boolean;
  authorized: boolean;
  isOwner: boolean;
  user: AuthUser | null;
  bot: BotBasicInfo;
  guild: GuildBasicInfo | null;
  oauthConfigured: boolean;
}

export interface GuildRoleMeta {
  id: string;
  name: string;
  colorHex: string;
  position: number;
  managed: boolean;
  editable: boolean;
  isEveryone: boolean;
}

export interface TextChannelMeta {
  id: string;
  name: string;
  type: 'text' | 'announcement';
  parentId: string | null;
}

export interface VoiceChannelMeta {
  id: string;
  name: string;
  parentId: string | null;
  userLimit: number;
  bitrateKbps: number;
}

export interface CategoryMeta {
  id: string;
  name: string;
}

export interface GuildMemberMeta {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string;
}

export interface GuildMeta {
  roles: GuildRoleMeta[];
  textChannels: TextChannelMeta[];
  voiceChannels: VoiceChannelMeta[];
  categories: CategoryMeta[];
  members: GuildMemberMeta[];
  maxBitrateKbps: number;
}

export interface DailyActivityItem {
  date: string;
  dayName?: string;
  messages: number;
  voiceJoins: number;
}

export type LogLevel = 'info' | 'success' | 'warn' | 'error';

export interface ActivityLogEntry {
  id?: string;
  timestamp: number;
  level: LogLevel;
  category: string;
  message: string;
  actor?: string | null;
  targetUserId?: string | null;
}

export interface OverviewTopPlayer {
  userId: string;
  displayName: string;
  avatarUrl: string;
  elo: number;
  rankColor: string;
  weeklyDelta: number;
}

export interface OverviewTopClimber {
  userId: string;
  displayName: string;
  delta: number;
  elo: number | null;
}

export interface OverviewData {
  bot: {
    online: boolean;
    ping: number;
    uptimeMs: number;
    username: string;
    avatarUrl: string | null;
  };
  guild: {
    id: string;
    name: string;
    memberCount: number;
    humanCount: number;
    botCount: number;
    boostCount: number;
    boostTier: number;
    textChannelsCount: number;
    voiceChannelsCount: number;
    rolesCount: number;
    iconUrl: string | null;
  };
  stats: {
    linkedPlayersCount: number;
    activeTempRoomsCount: number;
    openTicketsCount: number;
    inVoiceCount: number;
    totalWarningsCount: number;
    timedOutCount: number;
    topElo: number;
    avgElo: number | null;
    topClimber: OverviewTopClimber | null;
    topPlayers: OverviewTopPlayer[];
    dailyActivity: DailyActivityItem[];
    recentLogs: ActivityLogEntry[];
  };
  modules: {
    tempVoiceEnabled: boolean;
    patchBotEnabled: boolean;
    joinRolesEnabled: boolean;
    csStatusEnabled: boolean;
    rankFeedEnabled: boolean;
    adminLogEnabled: boolean;
    welcomeEnabled: boolean;
    ticketsEnabled: boolean;
    moderationEnabled: boolean;
  };
  viewAuditLogGranted: boolean;
  steamApiKeyConfigured: boolean;
}

export interface EloHistoryPoint {
  elo: number;
  timestamp: number;
}

export interface MemberRoleItem {
  id: string;
  name: string;
  colorHex: string;
  editable: boolean;
}

export interface MemberVoiceState {
  channelId: string;
  channelName: string;
  selfMute: boolean;
  selfDeaf: boolean;
  serverMute: boolean;
  serverDeaf: boolean;
  streaming: boolean;
  selfVideo: boolean;
}

export interface PlayerTicketRef {
  channelId: string;
  number: number;
  channelName: string;
  subject: string;
  claimedByName: string | null;
  createdAt?: number | null;
}

export interface PlayerSummary {
  userId: string;
  isLinked: boolean;
  steamId: string | null;
  leetifyUrl: string | null;
  elo: number | null;
  eloHistory: EloHistoryPoint[];
  weeklyDelta: number;
  lastDelta: number;
  rankColor: string;
  displayName: string;
  username: string;
  inGuild: boolean;
  avatarUrl: string;
  roles: MemberRoleItem[];
  voice: MemberVoiceState | null;
  lastSeenAt: number | null;
  openTickets: PlayerTicketRef[];
  joinedAt: number | null;
  createdAt: number | null;
  warningsCount: number;
  isTimedOut: boolean;
  timeoutUntil: number | null;
  isOwner: boolean;
}

export interface WarningItem {
  id: number;
  reason: string;
  moderatorId?: string | null;
  moderatorTag?: string;
  createdAt: number;
}

export interface PlayerActivityStats {
  messagesTotal: number;
  messages7d?: number;
  voiceSecondsTotal?: number;
  voiceMinutesTotal: number;
  voiceJoinsTotal?: number;
  lastMessageAt: number | null;
  lastMessageChannelName?: string | null;
  lastVoiceAt: number | null;
  lastVoiceChannelName?: string | null;
  voiceHistory?: Array<{
    type: 'join' | 'leave' | 'move';
    channelName: string;
    timestamp: number;
  }>;
}

export interface PlayerDetailResponse {
  player: {
    userId: string;
    displayName: string;
    username: string;
    inGuild: boolean;
    avatarUrl: string;
    isTimedOut: boolean;
    timeoutUntil: number | null;
    isOwner: boolean;
  };
  account: {
    createdAt: number | null;
    joinedAt: number | null;
    boostSince: number | null;
    nickname: string | null;
    canManageNick: boolean;
    canMoveVoice: boolean;
  };
  roles: MemberRoleItem[];
  voice: MemberVoiceState | null;
  activity: PlayerActivityStats;
  openTickets: PlayerTicketRef[];
  cs2: {
    isLinked: boolean;
    steamId: string | null;
    leetifyUrl: string | null;
    elo: number | null;
    eloHistory: EloHistoryPoint[];
    weeklyDelta: number;
    lastDelta: number;
    rankColor: string;
  };
  warnings: WarningItem[];
  timeline: ActivityLogEntry[];
}

export interface RankRoleConfig {
  min: number;
  roleId: string;
  color: number;
}

export interface TempVoiceSetup {
  id: string;
  enabled: boolean;
  triggerChannelId: string | null;
  categoryId: string | null;
  triggerName: string;
  roomNameTemplate: string;
  bitrateKbps: number;
  userLimit: number;
  lockOnDisable: boolean;
  lockRoleIds: string[];
  lockedRolePrevConnect?: Record<string, unknown>;
  createTriggerChannel?: boolean;
}

export interface TempVoiceRoomMember {
  id: string;
  displayName: string;
  username: string;
  avatarUrl: string;
  isOwner: boolean;
}

export interface TempVoiceRoom {
  channelId: string;
  name: string;
  ownerId: string;
  ownerName: string;
  memberCount: number;
  userLimit: number;
  bitrateKbps: number;
  locked: boolean;
  members: TempVoiceRoomMember[];
}

export interface PatchBotSettings {
  enabled: boolean;
  channelIds: string[];
  roleId: string | null;
  mode: 'all' | 'patchnotes';
  postedGids?: string[];
  lastPostedTitle: string | null;
  lastPostedAt: number | null;
}

export interface JoinRolesSettings {
  enabled: boolean;
  memberRoleIds: string[];
  botRoleIds: string[];
}

export interface CsStatusSettings {
  enabled: boolean;
  channelId: string | null;
  messageId: string | null;
  intervalSeconds: number;
  lastUpdatedAt: number;
}

export interface RankFeedSettings {
  enabled: boolean;
  channelId: string | null;
  notifyRankUp: boolean;
  notifyDerank: boolean;
}

export interface RankUpdaterSettings {
  activeIntervalMinutes: number;
  postMatchDelayMinutes: number;
  backgroundIntervalMinutes: number;
  inactiveIntervalHours: number;
  useSteamApi: boolean;
  useDiscordPresence: boolean;
}

export interface RankUpdaterStatus {
  playingCount: number;
  rateLimitedUntil: number | null;
  queueSize?: number;
}

export interface AdminLogEvents {
  memberJoin: boolean;
  memberLeave: boolean;
  bans: boolean;
  timeouts: boolean;
  warnings: boolean;
  channelActions: boolean;
  roleChanges: boolean;
  voiceActivity: boolean;
}

export interface AdminLogSettings {
  enabled: boolean;
  channelId: string | null;
  events: AdminLogEvents;
}

export interface WelcomeSettings {
  enabled: boolean;
  channelEnabled: boolean;
  channelId: string | null;
  channelTitle: string;
  channelDescription: string;
  channelColor: string;
  channelShowAvatar: boolean;
  dmEnabled: boolean;
  dmTitle: string;
  dmDescription: string;
  dmColor: string;
  goodbyeEnabled: boolean;
  goodbyeChannelId: string | null;
  goodbyeTitle: string;
  goodbyeDescription: string;
  goodbyeColor: string;
  ignoreBots: boolean;
}

export interface TicketsSettings {
  enabled: boolean;
  categoryId: string | null;
  logChannelId: string | null;
  supportRoleIds: string[];
  panelChannelId: string | null;
  panelMessageId: string | null;
  panelTitle: string;
  panelDescription: string;
  panelColor: string;
  panelButtonLabel: string;
  ticketCounter?: number;
}

export interface OpenTicket {
  channelId: string;
  number: number;
  channelName: string;
  userId: string;
  userName: string;
  userAvatar: string;
  subject: string;
  claimedById: string | null;
  claimedByName: string | null;
  createdAt: number;
}

export interface ModerationCommandsConfig {
  warn: boolean;
  timeout: boolean;
  kick: boolean;
  ban: boolean;
  clear: boolean;
  lock: boolean;
  slowmode: boolean;
}

export type EscalationAction = 'timeout' | 'kick' | 'ban';

export interface AutoEscalationRule {
  threshold: number;
  action: EscalationAction;
  durationMinutes: number;
}

export interface ModerationSettings {
  enabled: boolean;
  adminRoleIds: string[];
  dmUser: boolean;
  commands: ModerationCommandsConfig;
  autoEscalation: {
    enabled: boolean;
    rules: AutoEscalationRule[];
  };
}

export interface BanEntry {
  userId: string;
  username: string;
  tag: string;
  avatarUrl: string;
  reason: string | null;
}

export interface AnnouncementHistoryEntry {
  channelId: string;
  channelName: string;
  messageId: string;
  sentAt: number;
  content: string;
  title: string;
  description: string;
  color: string;
  thumbnailUrl: string;
  imageUrl: string;
  footerText: string;
  roleId: string | null;
  timestamp: boolean;
}

export interface SettingsData {
  dashboardRoleIds: string[];
  allowedChannelId: string | null;
  allowedChannelBypassRoleIds: string[];
  unrankedRoleId: string | null;
  rankRoles: RankRoleConfig[];
  tempVoice: {
    enabled: boolean;
    setups: TempVoiceSetup[];
  };
  patchBot: PatchBotSettings;
  joinRoles: JoinRolesSettings;
  csStatus: CsStatusSettings;
  botStatus: {
    text: string;
  };
  rankFeed: RankFeedSettings;
  rankUpdater: RankUpdaterSettings;
  adminLog: AdminLogSettings;
  announcementsHistory: AnnouncementHistoryEntry[];
  welcome: WelcomeSettings;
  tickets: TicketsSettings;
  moderation: ModerationSettings;
}

export interface SettingsApiResponse {
  settings: SettingsData;
  steamApiKeyConfigured: boolean;
  rankUpdaterStatus: RankUpdaterStatus;
  ownerId: string;
}

export interface LivePayload {
  overview: OverviewData;
  players?: PlayerSummary[];
  rooms?: TempVoiceRoom[];
  logs?: ActivityLogEntry[];
  announcementsHistory?: AnnouncementHistoryEntry[];
  openTickets?: OpenTicket[];
  rankUpdaterStatus?: RankUpdaterStatus;
}
