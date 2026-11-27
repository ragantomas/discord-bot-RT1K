import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Gavel,
  Headphones,
  Link2,
  Search,
  Unlink,
  User,
  Users,
} from 'lucide-react';
import { useCallback, useMemo, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { playersApi } from '@/api/players';
import { Button } from '@/components/ui/Button';
import { MemberSelect } from '@/components/ui/DiscordSelects';
import { EmptyState, SkeletonCard } from '@/components/ui/Feedback';
import { useConfirm } from '@/context/ConfirmContext';
import { useDashboard } from '@/context/DashboardContext';
import { useToast } from '@/context/ToastContext';
import { PlayerDetailModal } from '@/features/players/PlayerDetailModal';
import { PlayerModModal } from '@/features/players/PlayerModModal';
import { getAppLanguage } from '@/i18n';
import type { PlayerSummary } from '@/types/api';
import { formatNumber } from '@/utils/format';

type PlayerFilter = 'all' | 'linked' | 'unlinked' | 'voice';

export function PlayersPage() {
  const { t } = useTranslation();
  const lang = getAppLanguage();
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const { players, meta, initialLoading, refreshPlayers, refreshOverview } = useDashboard();

  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [profileInput, setProfileInput] = useState('');
  const [linking, setLinking] = useState(false);

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<PlayerFilter>('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const [detailUserId, setDetailUserId] = useState<string | null>(null);
  const [modUserId, setModUserId] = useState<string | null>(null);

  const handleCloseDetail = useCallback(() => setDetailUserId(null), []);
  const handleCloseMod = useCallback(() => setModUserId(null), []);
  const handleOpenModFromDetail = useCallback((uid: string) => {
    setDetailUserId(null);
    setModUserId(uid);
  }, []);
  const handleOpenDetailFromMod = useCallback((uid: string) => {
    setModUserId(null);
    setDetailUserId(uid);
  }, []);

  const modPlayer: PlayerSummary | null = useMemo(
    () => players.find((p) => p.userId === modUserId) ?? null,
    [players, modUserId],
  );

  const filteredPlayers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return players.filter((p) => {
      if (filter === 'linked' && !p.isLinked) return false;
      if (filter === 'unlinked' && p.isLinked) return false;
      if (filter === 'voice' && !p.voice) return false;
      if (!q) return true;
      return (
        p.displayName.toLowerCase().includes(q) ||
        p.username.toLowerCase().includes(q) ||
        p.userId.includes(q) ||
        (p.steamId ?? '').includes(q)
      );
    });
  }, [players, search, filter]);

  const handleLink = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedUserId || !profileInput.trim()) return;
    setLinking(true);
    try {
      const res = await playersApi.link({
        userId: selectedUserId,
        profile: profileInput.trim(),
      });
      const eloLabel = res.elo !== null ? `${formatNumber(res.elo, lang)} Elo` : t('players.unranked');
      showToast(t('players.linkedToast', { elo: eloLabel }));
      setProfileInput('');
      setSelectedUserId(null);
      await Promise.all([refreshPlayers(), refreshOverview()]);
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setLinking(false);
    }
  };

  const handleUnlink = async (player: PlayerSummary) => {
    const ok = await confirm({
      title: t('players.unlinkTitle'),
      message: t('players.unlinkMessage', { name: player.displayName }),
      confirmLabel: t('common.remove'),
    });
    if (!ok) return;

    try {
      await playersApi.unlink(player.userId);
      showToast(t('players.unlinkedToast', { name: player.displayName }));
      await Promise.all([refreshPlayers(), refreshOverview()]);
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), 'error');
    }
  };


  const totalPages = Math.max(1, Math.ceil(filteredPlayers.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const startIdx = (safePage - 1) * pageSize;
  const paginatedPlayers = useMemo(
    () => filteredPlayers.slice(startIdx, startIdx + pageSize),
    [filteredPlayers, startIdx, pageSize],
  );

  if (initialLoading) {
    return <SkeletonCard rows={6} />;
  }

  const filterButtons: Array<{ id: PlayerFilter; label: string }> = [
    { id: 'all', label: t('players.filterAll') },
    { id: 'linked', label: t('players.filterLinked') },
    { id: 'unlinked', label: t('players.filterUnlinked') },
    { id: 'voice', label: t('players.filterVoice') },
  ];

  return (
    <div className="space-y-6">
      {/* Link CS2 account */}
      <form onSubmit={handleLink} className="card p-6 space-y-4">
        <h3 className="text-base font-semibold text-white flex items-center gap-2">
          <Link2 className="w-4 h-4 text-brand" />
          <span>{t('players.linkTitle')}</span>
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          <div className="md:col-span-4">
            <MemberSelect
              members={meta?.members ?? []}
              value={selectedUserId}
              onChange={setSelectedUserId}
            />
          </div>
          <div className="md:col-span-6">
            <input
              type="text"
              value={profileInput}
              onChange={(e) => setProfileInput(e.target.value)}
              placeholder={t('players.profilePlaceholder')}
              className="input-field"
            />
          </div>
          <div className="md:col-span-2">
            <Button
              type="submit"
              variant="primary"
              loading={linking}
              loadingText={t('players.linking')}
              disabled={!selectedUserId || !profileInput.trim()}
              className="w-full h-[42px]"
            >
              {t('players.linkBtn')}
            </Button>
          </div>
        </div>
      </form>

      {/* Players table */}
      <div className="card overflow-hidden">
        <div className="p-5 border-b border-slate-800/90 flex items-center justify-between gap-3">
          <h3 className="text-base font-semibold text-white flex items-center gap-2">
            <Users className="w-4 h-4 text-brand" />
            <span>{t('players.tableTitle', { count: filteredPlayers.length })}</span>
          </h3>
        </div>

        <div className="px-5 py-3.5 border-b border-slate-800/90 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {filterButtons.map((btn) => (
              <button
                key={btn.id}
                type="button"
                onClick={() => {
                  setFilter(btn.id);
                  setPage(1);
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition ${
                  filter === btn.id
                    ? 'bg-brand text-white border-brand'
                    : 'bg-bg-elevated hover:bg-bg-hover text-slate-300 border-slate-700'
                }`}
              >
                {btn.label}
              </button>
            ))}
          </div>

          <div className="relative md:w-64">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder={t('common.search')}
              className="input-field pl-9"
            />
          </div>
        </div>

        {filteredPlayers.length === 0 ? (
          <EmptyState message={t('players.noPlayers')} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800/80 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  <th className="py-3 px-4">{t('players.colPlayer')}</th>
                  <th className="py-3 px-4">{t('players.colElo')}</th>
                  <th className="py-3 px-4 hidden lg:table-cell">{t('players.colRoles')}</th>
                  <th className="py-3 px-4">{t('players.colStatus')}</th>
                  <th className="py-3 px-4 text-right">{t('players.colActions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-sm">
                {paginatedPlayers.map((p) => (
                  <tr key={p.userId} className="hover:bg-bg-elevated/40 transition">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <img
                          src={p.avatarUrl}
                          alt={p.displayName}
                          className="w-8 h-8 rounded-full object-cover shrink-0 bg-bg-elevated"
                        />
                        <div className="min-w-0">
                          <div className="font-medium text-white truncate max-w-[180px]">
                            {p.displayName}
                          </div>
                          <div className="text-xs text-slate-500 truncate">@{p.username}</div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      {p.isLinked ? (
                        <div className="flex items-center gap-2">
                          <span
                            className="px-2.5 py-0.5 rounded-lg text-xs font-bold border"
                            style={{
                              color: p.rankColor,
                              borderColor: `${p.rankColor}55`,
                              backgroundColor: `${p.rankColor}1a`,
                            }}
                          >
                            {p.elo !== null ? formatNumber(p.elo, lang) : t('players.unranked')}
                          </span>
                          {p.weeklyDelta !== 0 && (
                            <span
                              className={`text-xs font-medium ${
                                p.weeklyDelta > 0 ? 'text-emerald-400' : 'text-red-400'
                              }`}
                            >
                              {p.weeklyDelta > 0 ? '+' : ''}
                              {formatNumber(p.weeklyDelta, lang)}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-slate-500">{t('players.notLinked')}</span>
                      )}
                    </td>
                    <td className="py-3 px-4 hidden lg:table-cell">
                      <div className="flex flex-wrap gap-1 max-w-xs">
                        {p.roles.slice(0, 3).map((r) => (
                          <span
                            key={r.id}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-bg-elevated border border-slate-700/80 text-[11px] text-slate-300"
                          >
                            <span
                              className="w-2 h-2 rounded-full"
                              style={{ backgroundColor: r.colorHex }}
                            />
                            <span className="truncate max-w-[90px]">{r.name}</span>
                          </span>
                        ))}
                        {p.roles.length > 3 && (
                          <span className="text-[11px] text-slate-500">+{p.roles.length - 3}</span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {p.voice && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-[11px] text-emerald-300">
                            <Headphones className="w-3 h-3" />
                            <span>{p.voice.channelName}</span>
                          </span>
                        )}
                        {p.isTimedOut && (
                          <span className="px-2 py-0.5 rounded-md bg-orange-500/15 border border-orange-500/30 text-[11px] text-orange-300">
                            {t('players.timedOut')}
                          </span>
                        )}
                        {p.warningsCount > 0 && (
                          <span className="px-2 py-0.5 rounded-md bg-amber-500/15 border border-amber-500/30 text-[11px] text-amber-300">
                            {t('players.warningsBadge', { count: p.warningsCount })}
                          </span>
                        )}
                        {!p.inGuild && (
                          <span className="px-2 py-0.5 rounded-md bg-slate-800 border border-slate-700 text-[11px] text-slate-400">
                            {t('players.notInGuild')}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center justify-end gap-1.5">
                        {p.leetifyUrl && (
                          <a
                            href={p.leetifyUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="p-2 rounded-lg bg-bg-elevated hover:bg-bg-hover border border-slate-700 text-slate-300 hover:text-white transition"
                            title={t('players.detail.openLeetify')}
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        )}
                        <button
                          type="button"
                          onClick={() => setDetailUserId(p.userId)}
                          className="p-2 rounded-lg bg-bg-elevated hover:bg-bg-hover border border-slate-700 text-sky-300 transition"
                          title={t('common.detail')}
                        >
                          <User className="w-3.5 h-3.5" />
                        </button>
                        {!p.isOwner && (
                          <button
                            type="button"
                            onClick={() => setModUserId(p.userId)}
                            className="p-2 rounded-lg bg-bg-elevated hover:bg-bg-hover border border-slate-700 text-amber-300 transition"
                            title={t('nav.moderation')}
                          >
                            <Gavel className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {p.isLinked && (
                          <button
                            type="button"
                            onClick={() => void handleUnlink(p)}
                            className="p-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-300 transition"
                            title={t('players.unlinkTitle')}
                          >
                            <Unlink className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {filteredPlayers.length > 0 && (
          <div className="px-5 py-3.5 border-t border-slate-800/90 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-400">
            <div className="flex items-center gap-3">
              <span>
                {t('players.showingRange', {
                  from: startIdx + 1,
                  to: Math.min(startIdx + pageSize, filteredPlayers.length),
                  total: filteredPlayers.length,
                })}
              </span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
                className="bg-bg-elevated border border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-200"
              >
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={safePage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="p-1.5 rounded-lg bg-bg-elevated hover:bg-bg-hover border border-slate-700 text-slate-300 disabled:opacity-40 transition"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-slate-300 font-medium px-1">
                {safePage} / {totalPages}
              </span>
              <button
                type="button"
                disabled={safePage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="p-1.5 rounded-lg bg-bg-elevated hover:bg-bg-hover border border-slate-700 text-slate-300 disabled:opacity-40 transition"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      <PlayerDetailModal
        userId={detailUserId}
        onClose={handleCloseDetail}
        onOpenModeration={handleOpenModFromDetail}
      />

      <PlayerModModal
        player={modPlayer}
        onClose={handleCloseMod}
        onOpenDetail={handleOpenDetailFromMod}
      />
    </div>
  );
}
