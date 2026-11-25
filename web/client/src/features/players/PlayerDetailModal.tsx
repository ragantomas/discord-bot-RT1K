import {
  ExternalLink,
  Gavel,
  Headphones,
  Plus,
  Save,
  Ticket,
  Trash2,
  VolumeX,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { playersApi } from '@/api/players';
import { Button } from '@/components/ui/Button';
import { RoleSelect, VoiceChannelSelect } from '@/components/ui/DiscordSelects';
import { EmptyState, SkeletonCard } from '@/components/ui/Feedback';
import { Modal } from '@/components/ui/Modal';
import { API_LIMITS } from '@/config/constants';
import { LOG_CATEGORY_LABEL_KEYS, LOG_LEVEL_STYLES } from '@/config/theme';
import { useDashboard } from '@/context/DashboardContext';
import { useToast } from '@/context/ToastContext';
import { EloChart } from '@/features/players/EloChart';
import { getAppLanguage } from '@/i18n';
import type { PlayerDetailResponse } from '@/types/api';
import { formatDateTime, formatNumber, formatRelativeTime } from '@/utils/format';

type DetailTab = 'overview' | 'activity' | 'roles' | 'timeline';

interface PlayerDetailModalProps {
  userId: string | null;
  onClose: () => void;
  onOpenModeration: (userId: string) => void;
}

export function PlayerDetailModal({ userId, onClose, onOpenModeration }: PlayerDetailModalProps) {
  const { t } = useTranslation();
  const lang = getAppLanguage();
  const { showToast } = useToast();
  const { meta, refreshPlayers } = useDashboard();

  const [detail, setDetail] = useState<PlayerDetailResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<DetailTab>('overview');
  const [nickname, setNickname] = useState('');
  const [savingNick, setSavingNick] = useState(false);
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [roleBusy, setRoleBusy] = useState(false);
  const [targetVoiceId, setTargetVoiceId] = useState<string | null>(null);
  const [voiceBusy, setVoiceBusy] = useState(false);

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const loadDetail = useCallback(async (uid: string, opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    try {
      const res = await playersApi.detail(uid);
      setDetail(res);
      setNickname(res.account.nickname ?? '');
      setTargetVoiceId(res.voice?.channelId ?? null);
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), 'error');
      onCloseRef.current();
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    if (userId) {
      setActiveTab('overview');
      setSelectedRoleId(null);
      void loadDetail(userId);
    } else {
      setDetail(null);
    }
  }, [userId, loadDetail]);

  const handleSaveNickname = async () => {
    if (!userId) return;
    setSavingNick(true);
    try {
      await playersApi.setNickname(userId, nickname);
      showToast(t('players.detail.nicknameSaved'));
      await Promise.all([loadDetail(userId, { silent: true }), refreshPlayers()]);
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setSavingNick(false);
    }
  };

  const handleAddRole = async () => {
    if (!userId || !selectedRoleId) return;
    setRoleBusy(true);
    try {
      await playersApi.addRole(userId, selectedRoleId);
      setSelectedRoleId(null);
      showToast(t('players.detail.roleAdded'));
      await Promise.all([loadDetail(userId, { silent: true }), refreshPlayers()]);
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setRoleBusy(false);
    }
  };

  const handleRemoveRole = async (roleId: string) => {
    if (!userId) return;
    setRoleBusy(true);
    try {
      await playersApi.removeRole(userId, roleId);
      showToast(t('players.detail.roleRemoved'));
      await Promise.all([loadDetail(userId, { silent: true }), refreshPlayers()]);
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setRoleBusy(false);
    }
  };

  const handleVoiceAction = async (action: 'disconnect' | 'move') => {
    if (!userId) return;
    setVoiceBusy(true);
    try {
      await playersApi.voiceAction(userId, { action, channelId: targetVoiceId });
      showToast(t('players.detail.voiceDone'));
      await Promise.all([loadDetail(userId, { silent: true }), refreshPlayers()]);
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setVoiceBusy(false);
    }
  };

  const assignedRoleIds = new Set((detail?.roles ?? []).map((r) => r.id));
  const assignableRoles = (meta?.roles ?? []).filter((r) => !assignedRoleIds.has(r.id));

  const tabs: Array<{ id: DetailTab; label: string }> = [
    { id: 'overview', label: t('players.detail.tabOverview') },
    { id: 'activity', label: t('players.detail.tabActivity') },
    { id: 'roles', label: `${t('players.detail.tabRoles')} (${detail?.roles.length ?? 0})` },
    { id: 'timeline', label: t('players.detail.tabTimeline') },
  ];

  return (
    <Modal
      open={Boolean(userId)}
      onClose={onClose}
      maxWidthClass="max-w-3xl"
      title={
        detail ? (
          <div className="flex items-center gap-3 min-w-0">
            <img
              src={detail.player.avatarUrl}
              alt={detail.player.displayName}
              className="w-11 h-11 rounded-full object-cover bg-bg-elevated shrink-0"
            />
            <div className="min-w-0">
              <h3 className="text-lg font-semibold text-white truncate">
                {detail.player.displayName}
              </h3>
              <p className="text-xs text-slate-400 truncate">
                @{detail.player.username} · {detail.player.userId}
              </p>
            </div>
          </div>
        ) : (
          <h3 className="text-lg font-semibold text-white">{t('common.loading')}</h3>
        )
      }
      headerRight={
        detail && !detail.player.isOwner ? (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => onOpenModeration(detail.player.userId)}
            icon={<Gavel className="w-3.5 h-3.5 text-amber-300" />}
          >
            {t('nav.moderation')}
          </Button>
        ) : null
      }
    >
      {loading || !detail ? (
        <SkeletonCard rows={4} />
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2 border-b border-slate-800 pb-3">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition ${
                  activeTab === tab.id
                    ? 'bg-brand text-white border-brand'
                    : 'bg-bg-elevated hover:bg-bg-hover text-slate-300 border-slate-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {activeTab === 'overview' && (
            <div className="space-y-4">
              {detail.cs2.isLinked && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="p-3.5 rounded-xl bg-bg-elevated/60 border border-slate-800">
                    <div className="text-xs text-slate-400">{t('players.detail.currentElo')}</div>
                    <div
                      className="text-xl font-bold mt-1"
                      style={{ color: detail.cs2.rankColor }}
                    >
                      {detail.cs2.elo !== null
                        ? formatNumber(detail.cs2.elo, lang)
                        : t('players.unranked')}
                    </div>
                  </div>
                  <div className="p-3.5 rounded-xl bg-bg-elevated/60 border border-slate-800">
                    <div className="text-xs text-slate-400">{t('players.detail.weeklyDelta')}</div>
                    <div
                      className={`text-xl font-bold mt-1 ${
                        detail.cs2.weeklyDelta > 0
                          ? 'text-emerald-400'
                          : detail.cs2.weeklyDelta < 0
                            ? 'text-red-400'
                            : 'text-slate-300'
                      }`}
                    >
                      {detail.cs2.weeklyDelta > 0 ? '+' : ''}
                      {formatNumber(detail.cs2.weeklyDelta, lang)}
                    </div>
                  </div>
                  <div className="p-3.5 rounded-xl bg-bg-elevated/60 border border-slate-800">
                    <div className="text-xs text-slate-400">{t('players.detail.steamId')}</div>
                    <div className="text-sm font-mono text-white mt-1.5 flex items-center justify-between gap-2">
                      <span className="truncate">{detail.cs2.steamId}</span>
                      {detail.cs2.leetifyUrl && (
                        <a
                          href={detail.cs2.leetifyUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-brand hover:text-indigo-300 shrink-0"
                          title={t('players.detail.openLeetify')}
                        >
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {detail.cs2.isLinked && (
                <EloChart history={detail.cs2.eloHistory} accentColor={detail.cs2.rankColor} />
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div className="p-3 rounded-xl bg-bg-elevated/60 border border-slate-800">
                  <div className="text-slate-400">{t('players.detail.accountCreated')}</div>
                  <div className="text-white font-medium mt-1">
                    {formatDateTime(detail.account.createdAt, lang)}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-bg-elevated/60 border border-slate-800">
                  <div className="text-slate-400">{t('players.detail.joinedServer')}</div>
                  <div className="text-white font-medium mt-1">
                    {formatDateTime(detail.account.joinedAt, lang)}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-bg-elevated/60 border border-slate-800">
                  <div className="text-slate-400">{t('players.detail.boostingSince')}</div>
                  <div className="text-white font-medium mt-1">
                    {formatDateTime(detail.account.boostSince, lang)}
                  </div>
                </div>
              </div>

              {detail.account.canManageNick && (
                <div className="p-4 rounded-xl bg-bg-elevated/60 border border-slate-800 space-y-2">
                  <label className="text-xs font-medium text-slate-400 block">
                    {t('players.detail.nickname')}
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      maxLength={API_LIMITS.NICKNAME_MAX}
                      value={nickname}
                      onChange={(e) => setNickname(e.target.value)}
                      placeholder={t('players.detail.nicknamePlaceholder')}
                      className="input-field flex-1 min-w-0"
                    />
                    <Button
                      variant="primary"
                      loading={savingNick}
                      onClick={() => void handleSaveNickname()}
                      icon={<Save className="w-4 h-4" />}
                      className="whitespace-nowrap shrink-0 h-[42px]"
                    >
                      {t('common.save')}
                    </Button>
                  </div>
                </div>
              )}

              {detail.voice && (
                <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-sm font-medium text-emerald-200">
                      <Headphones className="w-4 h-4 text-emerald-400" />
                      <span>
                        {t('players.detail.voiceState')}: {detail.voice.channelName}
                      </span>
                    </div>
                    {detail.account.canMoveVoice && (
                      <Button
                        size="sm"
                        variant="danger"
                        loading={voiceBusy}
                        onClick={() => void handleVoiceAction('disconnect')}
                        icon={<VolumeX className="w-3.5 h-3.5" />}
                      >
                        {t('players.detail.disconnect')}
                      </Button>
                    )}
                  </div>
                  {detail.account.canMoveVoice && (
                    <div className="flex gap-2">
                      <VoiceChannelSelect
                        channels={meta?.voiceChannels ?? []}
                        value={targetVoiceId}
                        onChange={setTargetVoiceId}
                        className="flex-1 min-w-0"
                      />
                      <Button
                        size="sm"
                        variant="secondary"
                        loading={voiceBusy}
                        disabled={!targetVoiceId || targetVoiceId === detail.voice.channelId}
                        onClick={() => void handleVoiceAction('move')}
                        className="whitespace-nowrap shrink-0 h-[42px]"
                      >
                        {t('players.detail.move')}
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {detail.openTickets.length > 0 && (
                <div className="p-4 rounded-xl bg-bg-elevated/60 border border-slate-800 space-y-2">
                  <div className="text-xs font-medium text-slate-400 flex items-center gap-1.5">
                    <Ticket className="w-3.5 h-3.5 text-violet-400" />
                    <span>{t('players.detail.openTickets')}</span>
                  </div>
                  {detail.openTickets.map((tk) => (
                    <div
                      key={tk.channelId}
                      className="text-xs text-slate-200 flex items-center justify-between"
                    >
                      <span>
                        #{tk.number} · #{tk.channelName} — {tk.subject}
                      </span>
                      {tk.claimedByName && (
                        <span className="text-slate-400">{tk.claimedByName}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'activity' && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-4 rounded-xl bg-bg-elevated/60 border border-slate-800">
                <div className="text-xs text-slate-400">{t('players.detail.messagesTotal')}</div>
                <div className="text-2xl font-bold text-white mt-1">
                  {formatNumber(detail.activity.messagesTotal || 0, lang)}
                </div>
              </div>
              <div className="p-4 rounded-xl bg-bg-elevated/60 border border-slate-800">
                <div className="text-xs text-slate-400">{t('players.detail.voiceMinutes')}</div>
                <div className="text-2xl font-bold text-white mt-1">
                  {formatNumber(detail.activity.voiceMinutesTotal || 0, lang)}
                </div>
              </div>
              <div className="p-4 rounded-xl bg-bg-elevated/60 border border-slate-800">
                <div className="text-xs text-slate-400">{t('players.detail.lastSeen')}</div>
                <div className="text-sm font-semibold text-white mt-2">
                  {formatRelativeTime(
                    Math.max(detail.activity.lastMessageAt || 0, detail.activity.lastVoiceAt || 0) ||
                      null,
                    lang,
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'roles' && (
            <div className="space-y-4">
              {detail.player.inGuild && (
                <div className="flex gap-2">
                  <RoleSelect
                    roles={assignableRoles}
                    value={selectedRoleId}
                    onChange={setSelectedRoleId}
                    onlyEditable
                    className="flex-1 min-w-0"
                  />
                  <Button
                    variant="primary"
                    loading={roleBusy}
                    disabled={!selectedRoleId}
                    onClick={() => void handleAddRole()}
                    icon={<Plus className="w-4 h-4" />}
                    className="whitespace-nowrap shrink-0 h-[42px]"
                  >
                    {t('players.detail.addRole')}
                  </Button>
                </div>
              )}

              {detail.roles.length === 0 ? (
                <EmptyState message={t('players.detail.noRoles')} />
              ) : (
                <div className="flex flex-wrap gap-2">
                  {detail.roles.map((r) => (
                    <span
                      key={r.id}
                      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-bg-elevated border border-slate-700 text-xs font-medium text-slate-200"
                    >
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: r.colorHex }}
                      />
                      <span>{r.name}</span>
                      {r.editable && (
                        <button
                          type="button"
                          disabled={roleBusy}
                          onClick={() => void handleRemoveRole(r.id)}
                          className="text-slate-400 hover:text-red-400 transition"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'timeline' && (
            <div className="space-y-2">
              {detail.timeline.length === 0 ? (
                <EmptyState message={t('players.detail.noTimeline')} />
              ) : (
                <div className="divide-y divide-slate-800/80">
                  {detail.timeline.map((item, idx) => {
                    const lvl = LOG_LEVEL_STYLES[item.level] ?? LOG_LEVEL_STYLES.info;
                    const catKey = LOG_CATEGORY_LABEL_KEYS[item.category] ?? 'logs.categories.system';
                    return (
                      <div
                        key={`${item.timestamp}-${idx}`}
                        className="py-2.5 flex items-center justify-between gap-3 text-xs"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className={`w-2 h-2 rounded-full shrink-0 ${lvl.dot}`} />
                          <span className={`px-2 py-0.5 rounded border ${lvl.badge} shrink-0`}>
                            {t(catKey)}
                          </span>
                          <span className="text-slate-200 truncate">{item.message}</span>
                        </div>
                        <span className="text-slate-500 shrink-0">
                          {formatDateTime(item.timestamp, lang)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
