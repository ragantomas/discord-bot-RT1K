import {
  Activity,
  Archive,
  ArrowRight,
  Flame,
  Gavel,
  Hand,
  Hash,
  Headphones,
  Mic,
  Newspaper,
  ScrollText,
  Server,
  ShieldCheck,
  Sparkles,
  Tags,
  Ticket,
  TrendingUp,
  Trophy,
  UserPlus,
  Users,
  Volume2,
} from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { EmptyState, SkeletonCard } from '@/components/ui/Feedback';
import { POLLING } from '@/config/constants';
import { LOG_CATEGORY_LABEL_KEYS, LOG_LEVEL_STYLES } from '@/config/theme';
import { useDashboard } from '@/context/DashboardContext';
import { BackupModal } from '@/features/overview/BackupModal';
import { getAppLanguage } from '@/i18n';
import { formatDateTime, formatDuration, formatNumber } from '@/utils/format';

export function OverviewPage() {
  const { t } = useTranslation();
  const lang = getAppLanguage();
  const { overview, initialLoading } = useDashboard();
  const [backupOpen, setBackupOpen] = useState(false);
  const [liveUptimeMs, setLiveUptimeMs] = useState(0);

  useEffect(() => {
    setLiveUptimeMs(overview?.bot.uptimeMs || 0);
  }, [overview?.bot.uptimeMs]);

  useEffect(() => {
    if (!overview?.bot.online) return;
    const timer = window.setInterval(() => {
      if (!document.hidden) {
        setLiveUptimeMs((prev) => (prev > 0 ? prev + POLLING.UPTIME_TICK_MS : prev));
      }
    }, POLLING.UPTIME_TICK_MS);
    return () => window.clearInterval(timer);
  }, [overview?.bot.online]);

  if (initialLoading || !overview) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonCard key={i} rows={2} />
          ))}
        </div>
        <SkeletonCard rows={5} />
      </div>
    );
  }

  const { bot, guild, stats, modules } = overview;

  const moduleCards: Array<{
    path: string;
    label: string;
    active: boolean;
    icon: ReactNode;
    accent: string;
  }> = [
    { path: '/tempvoice', label: t('nav.tempvoice'), active: modules.tempVoiceEnabled, icon: <Mic className="w-4 h-4" />, accent: 'text-brand' },
    { path: '/patchbot', label: t('nav.patchbot'), active: modules.patchBotEnabled, icon: <Newspaper className="w-4 h-4" />, accent: 'text-amber-400' },
    { path: '/joinroles', label: t('nav.joinroles'), active: modules.joinRolesEnabled, icon: <UserPlus className="w-4 h-4" />, accent: 'text-emerald-400' },
    { path: '/csstatus', label: t('nav.csstatus'), active: modules.csStatusEnabled, icon: <Activity className="w-4 h-4" />, accent: 'text-sky-400' },
    { path: '/rankfeed', label: t('nav.rankfeed'), active: modules.rankFeedEnabled, icon: <TrendingUp className="w-4 h-4" />, accent: 'text-emerald-300' },
    { path: '/adminlog', label: t('nav.adminlog'), active: modules.adminLogEnabled, icon: <ShieldCheck className="w-4 h-4" />, accent: 'text-sky-300' },
    { path: '/welcome', label: t('nav.welcome'), active: modules.welcomeEnabled, icon: <Hand className="w-4 h-4" />, accent: 'text-pink-400' },
    { path: '/tickets', label: t('nav.tickets'), active: modules.ticketsEnabled, icon: <Ticket className="w-4 h-4" />, accent: 'text-violet-400' },
    { path: '/moderation', label: t('nav.moderation'), active: modules.moderationEnabled, icon: <Gavel className="w-4 h-4" />, accent: 'text-red-400' },
  ];

  const maxActivity = Math.max(
    1,
    ...(stats.dailyActivity || []).map((d) => (d.messages || 0) + (d.voiceJoins || 0)),
  );

  return (
    <div className="space-y-6">
      {/* Server Header Banner */}
      <div className="card p-5 bg-gradient-to-r from-brand/10 via-bg-surface to-bg-surface flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          <div className="w-14 h-14 rounded-2xl bg-bg-elevated border border-slate-700/80 overflow-hidden flex items-center justify-center shrink-0">
            {guild.iconUrl ? (
              <img src={guild.iconUrl} alt={guild.name} className="w-full h-full object-cover" />
            ) : (
              <Server className="w-6 h-6 text-brand" />
            )}
          </div>
          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h3 className="text-lg font-bold text-white truncate">{guild.name}</h3>
              <span
                className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-0.5 rounded-full border ${
                  bot.online
                    ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                    : 'bg-red-500/15 text-red-300 border-red-500/30'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    bot.online ? 'bg-emerald-400' : 'bg-red-400'
                  }`}
                />
                <span>{bot.online ? t('common.online') : t('common.offline')}</span>
              </span>
            </div>
            <div className="flex items-center flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
              <span>
                {t('overview.uptime')}:{' '}
                <strong className="text-slate-200">
                  {formatDuration(liveUptimeMs || bot.uptimeMs)}
                </strong>
              </span>
              <span>
                {t('overview.ping')}:{' '}
                <strong className="text-slate-200">{bot.online ? `${bot.ping} ms` : '—'}</strong>
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center flex-wrap gap-2 text-xs shrink-0">
          <div className="px-3 py-2 rounded-xl bg-bg-elevated/80 border border-slate-800 flex items-center gap-2">
            <Hash className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-slate-400">{t('overview.channels')}</span>
            <strong className="text-white">{guild.textChannelsCount}</strong>
          </div>
          <div className="px-3 py-2 rounded-xl bg-bg-elevated/80 border border-slate-800 flex items-center gap-2">
            <Volume2 className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-slate-400">{t('overview.voiceChannels')}</span>
            <strong className="text-white">{guild.voiceChannelsCount}</strong>
          </div>
          <div className="px-3 py-2 rounded-xl bg-bg-elevated/80 border border-slate-800 flex items-center gap-2">
            <Tags className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-slate-400">{t('overview.roles')}</span>
            <strong className="text-white">{guild.rolesCount}</strong>
          </div>
        </div>
      </div>

      {/* Primary KPI row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <Link to="/members" className="card p-5 space-y-2 hover:border-slate-600/80 transition">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              {t('overview.members')}
            </span>
            <Users className="w-4 h-4 text-sky-400" />
          </div>
          <div className="text-2xl font-bold text-white">{formatNumber(guild.humanCount, lang)}</div>
          <div className="text-xs text-slate-400 flex items-center justify-between gap-2">
            <span>{t('overview.botsCount', { count: guild.botCount })}</span>
            <span>{t('overview.totalCount', { count: guild.memberCount })}</span>
          </div>
        </Link>

        <Link to="/tempvoice" className="card p-5 space-y-2 hover:border-slate-600/80 transition">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              {t('overview.activeVoice')}
            </span>
            <Headphones className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold text-white">{formatNumber(stats.inVoiceCount, lang)}</div>
          <div className="text-xs text-slate-400">
            {t('overview.tempRooms')}: {stats.activeTempRoomsCount}
          </div>
        </Link>

        <Link to="/members" className="card p-5 space-y-2 hover:border-slate-600/80 transition">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              {t('overview.linkedPlayers')}
            </span>
            <Trophy className="w-4 h-4 text-brand-gold" />
          </div>
          <div className="text-2xl font-bold text-white">
            {formatNumber(stats.linkedPlayersCount, lang)}
          </div>
          <div className="text-xs text-slate-400">
            {stats.avgElo !== null
              ? t('overview.avgElo', { value: formatNumber(stats.avgElo, lang) })
              : t('overview.noElo')}
          </div>
        </Link>

        <Link to="/tickets" className="card p-5 space-y-2 hover:border-slate-600/80 transition">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              {t('overview.openTickets')}
            </span>
            <Ticket className="w-4 h-4 text-violet-400" />
          </div>
          <div className="text-2xl font-bold text-white">
            {formatNumber(stats.openTicketsCount, lang)}
          </div>
          <div className="text-xs text-slate-400">
            {t('overview.warningsAndTimeout', {
              warnings: stats.totalWarningsCount,
              timeouts: stats.timedOutCount,
            })}
          </div>
        </Link>
      </div>

      {/* Secondary server & climber stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card p-5 flex items-center justify-between gap-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              {t('overview.serverBoost')}
            </div>
            <div className="text-sm font-semibold text-white mt-1.5">
              {t('overview.boostTier', { tier: guild.boostTier, count: guild.boostCount })}
            </div>
          </div>
          <Sparkles className="w-5 h-5 text-pink-400 shrink-0" />
        </div>

        <div className="card p-5 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              {t('overview.topClimber')}
            </div>
            {stats.topClimber ? (
              <>
                <div className="text-sm font-semibold text-white truncate mt-1">
                  {stats.topClimber.displayName}
                </div>
                <div className="text-xs text-emerald-400 mt-1">
                  {t('overview.weeklyGain', { delta: formatNumber(stats.topClimber.delta, lang) })}
                </div>
              </>
            ) : (
              <div className="text-xs text-slate-400 mt-1.5">{t('overview.noClimber')}</div>
            )}
          </div>
          <Flame className="w-5 h-5 text-amber-400 shrink-0" />
        </div>

        <div className="card p-5 flex items-center justify-between gap-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              {t('overview.backup')}
            </div>
            <div className="text-xs text-slate-400 mt-1.5">{t('backup.fullDesc')}</div>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setBackupOpen(true)}
            icon={<Archive className="w-3.5 h-3.5 text-emerald-400" />}
          >
            {t('overview.backup')}
          </Button>
        </div>
      </div>

      {/* Modules grid */}
      <div className="card p-6 space-y-4">
        <h3 className="text-base font-semibold text-white">{t('overview.modulesStatus')}</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {moduleCards.map((mod) => (
            <Link
              key={mod.path}
              to={mod.path}
              className="flex items-center justify-between gap-3 p-3.5 rounded-xl bg-bg-elevated/60 hover:bg-bg-elevated border border-slate-800 hover:border-slate-700 transition"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span className={mod.accent}>{mod.icon}</span>
                <span className="text-sm font-medium text-white truncate">{mod.label}</span>
              </div>
              <span
                className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${
                  mod.active
                    ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/35'
                    : 'bg-slate-800 text-slate-400 border-slate-700'
                }`}
              >
                {mod.active ? t('common.active') : t('common.inactive')}
              </span>
            </Link>
          ))}
        </div>
      </div>

      {/* Top players + 7-day activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card p-6 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-base font-semibold text-white flex items-center gap-2">
              <Trophy className="w-4 h-4 text-brand-gold" />
              <span>{t('overview.topPlayers')}</span>
            </h3>
            <Link
              to="/members"
              className="text-xs font-medium text-brand hover:text-indigo-300 inline-flex items-center gap-1"
            >
              <span>{t('common.viewAll')}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {stats.topPlayers.length === 0 ? (
            <EmptyState message={t('overview.noLinkedPlayers')} />
          ) : (
            <div className="space-y-2.5">
              {stats.topPlayers.map((p, idx) => (
                <div
                  key={p.userId}
                  className="flex items-center justify-between gap-3 p-3 rounded-xl bg-bg-elevated/60 border border-slate-800"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="w-6 text-center text-xs font-bold text-slate-400">
                      #{idx + 1}
                    </span>
                    <img
                      src={p.avatarUrl}
                      alt={p.displayName}
                      className="w-8 h-8 rounded-full object-cover shrink-0"
                    />
                    <span className="text-sm font-medium text-white truncate">{p.displayName}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {p.weeklyDelta !== 0 && (
                      <span
                        className={`text-xs font-semibold ${
                          p.weeklyDelta > 0 ? 'text-emerald-400' : 'text-red-400'
                        }`}
                      >
                        {p.weeklyDelta > 0 ? '+' : ''}
                        {formatNumber(p.weeklyDelta, lang)}
                      </span>
                    )}
                    <span
                      className="px-2.5 py-0.5 rounded-lg text-xs font-bold border"
                      style={{
                        color: p.rankColor,
                        borderColor: `${p.rankColor}55`,
                        backgroundColor: `${p.rankColor}1a`,
                      }}
                    >
                      {formatNumber(p.elo, lang)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card p-6 space-y-4">
          <h3 className="text-base font-semibold text-white flex items-center gap-2">
            <Activity className="w-4 h-4 text-sky-400" />
            <span>{t('overview.activity7d')}</span>
          </h3>

          {!stats.dailyActivity || stats.dailyActivity.length === 0 ? (
            <EmptyState message={t('common.noEntries')} />
          ) : (
            <div className="grid grid-cols-7 gap-2 items-end h-44 pt-4">
              {stats.dailyActivity.map((day) => {
                const total = (day.messages || 0) + (day.voiceJoins || 0);
                const pct = Math.max(8, Math.round((total / maxActivity) * 100));
                const shortLabel = day.date.slice(5);
                return (
                  <div
                    key={day.date}
                    className="flex flex-col items-center gap-2 h-full justify-end"
                    title={`${day.date}: ${day.messages} ${t('overview.messages')}, ${day.voiceJoins} ${t('overview.voiceJoins')}`}
                  >
                    <div className="text-[11px] text-slate-400">{total}</div>
                    <div className="w-full max-w-[34px] flex-1 flex items-end">
                      <div
                        className="w-full rounded-t-lg bg-gradient-to-t from-brand/80 to-sky-400/90 transition-all"
                        style={{ height: `${pct}%` }}
                      />
                    </div>
                    <div className="text-[11px] text-slate-500">{shortLabel}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Recent logs */}
      <div className="card p-6 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-base font-semibold text-white flex items-center gap-2">
            <ScrollText className="w-4 h-4 text-brand" />
            <span>{t('overview.recentActivity')}</span>
          </h3>
          <Link
            to="/logs"
            className="text-xs font-medium text-brand hover:text-indigo-300 inline-flex items-center gap-1"
          >
            <span>{t('common.viewAll')}</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {stats.recentLogs.length === 0 ? (
          <EmptyState message={t('logs.noLogs')} />
        ) : (
          <div className="divide-y divide-slate-800/80">
            {stats.recentLogs.map((entry, idx) => {
              const lvl = LOG_LEVEL_STYLES[entry.level] ?? LOG_LEVEL_STYLES.info;
              const catKey = LOG_CATEGORY_LABEL_KEYS[entry.category] ?? 'logs.categories.system';
              return (
                <div
                  key={`${entry.timestamp}-${idx}`}
                  className="py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-sm"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${lvl.dot}`} />
                    <span
                      className={`px-2 py-0.5 rounded-md text-[11px] font-medium border shrink-0 ${lvl.badge}`}
                    >
                      {t(catKey)}
                    </span>
                    <span className="text-slate-200 truncate">{entry.message}</span>
                  </div>
                  <div className="text-xs text-slate-500 shrink-0 flex items-center gap-2">
                    {entry.actor && <span>{entry.actor}</span>}
                    <span>{formatDateTime(entry.timestamp, lang)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <BackupModal open={backupOpen} onClose={() => setBackupOpen(false)} />
    </div>
  );
}
