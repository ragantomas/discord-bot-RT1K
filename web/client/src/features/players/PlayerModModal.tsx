import { AlertTriangle, Ban, Clock, Trash2, User, UserX, Volume2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { moderationApi } from '@/api/moderation';
import { Button } from '@/components/ui/Button';
import { DurationUnitInput } from '@/components/ui/DurationUnitInput';
import { SkeletonCard } from '@/components/ui/Feedback';
import { Modal } from '@/components/ui/Modal';
import { BAN_DELETE_PRESETS } from '@/config/constants';
import { useConfirm } from '@/context/ConfirmContext';
import { useDashboard } from '@/context/DashboardContext';
import { useToast } from '@/context/ToastContext';
import { getAppLanguage } from '@/i18n';
import type { PlayerSummary, WarningItem } from '@/types/api';
import { formatDateTime } from '@/utils/format';

interface PlayerModModalProps {
  player: PlayerSummary | null;
  onClose: () => void;
  onOpenDetail: (userId: string) => void;
}

export function PlayerModModal({ player, onClose, onOpenDetail }: PlayerModModalProps) {
  const { t } = useTranslation();
  const lang = getAppLanguage();
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const { refreshPlayers, refreshOverview, refreshBans } = useDashboard();

  const [warnings, setWarnings] = useState<WarningItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [warnReason, setWarnReason] = useState('');
  const [timeoutMinutes, setTimeoutMinutes] = useState(10);
  const [timeoutReason, setTimeoutReason] = useState('');
  const [actionReason, setActionReason] = useState('');
  const [banDeleteSec, setBanDeleteSec] = useState(0);
  const [busy, setBusy] = useState(false);

  const loadWarnings = useCallback(async (uid: string) => {
    setLoading(true);
    try {
      const res = await moderationApi.getWarnings(uid);
      setWarnings(res.warnings || []);
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  const playerId = player?.userId ?? null;

  useEffect(() => {
    if (playerId) {
      setWarnReason('');
      setTimeoutReason('');
      setActionReason('');
      setTimeoutMinutes(10);
      setBanDeleteSec(0);
      void loadWarnings(playerId);
    } else {
      setWarnings([]);
    }
  }, [playerId, loadWarnings]);

  const syncAfterAction = async () => {
    await Promise.all([refreshPlayers(), refreshOverview()]);
  };

  const handleWarn = async () => {
    if (!player || !warnReason.trim()) return;
    setBusy(true);
    try {
      const res = await moderationApi.warn({ userId: player.userId, reason: warnReason.trim() });
      setWarnings(res.warnings || []);
      setWarnReason('');
      if (res.escalation) {
        showToast(
          t('moderation.modal.warnEscalated', {
            id: res.warning.id,
            action: res.escalation.action,
          }),
          'warn',
        );
      } else {
        showToast(t('moderation.modal.warnIssued', { id: res.warning.id }));
      }
      await syncAfterAction();
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteWarning = async (warningId: number) => {
    if (!player) return;
    setBusy(true);
    try {
      const res = await moderationApi.deleteWarning(player.userId, warningId);
      setWarnings(res.warnings || []);
      showToast(t('moderation.modal.warningDeleted', { id: warningId }));
      await syncAfterAction();
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleClearWarnings = async () => {
    if (!player) return;
    const ok = await confirm({
      title: t('moderation.modal.clearAllTitle'),
      message: t('moderation.modal.clearAllMessage', { name: player.displayName }),
    });
    if (!ok) return;

    setBusy(true);
    try {
      await moderationApi.clearWarnings(player.userId);
      setWarnings([]);
      showToast(t('moderation.modal.warningsCleared'));
      await syncAfterAction();
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleTimeout = async (mins: number) => {
    if (!player) return;
    setBusy(true);
    try {
      const res = await moderationApi.timeout({
        userId: player.userId,
        durationMinutes: mins,
        reason: timeoutReason.trim() || undefined,
      });
      setTimeoutReason('');
      showToast(
        mins === 0
          ? t('moderation.modal.timeoutRemoved')
          : t('moderation.modal.timeoutApplied', { duration: res.durationLabel || `${mins}m` }),
      );
      await syncAfterAction();
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleKick = async () => {
    if (!player) return;
    const ok = await confirm({
      title: t('moderation.modal.kickTitle'),
      message: t('moderation.modal.kickMessage', { name: player.displayName }),
      confirmLabel: t('moderation.modal.kickBtn'),
    });
    if (!ok) return;

    setBusy(true);
    try {
      await moderationApi.kick({
        userId: player.userId,
        reason: actionReason.trim() || undefined,
      });
      showToast(t('moderation.modal.kickedToast', { name: player.displayName }));
      await syncAfterAction();
      onClose();
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleBan = async () => {
    if (!player) return;
    const ok = await confirm({
      title: t('moderation.modal.banTitle'),
      message: t('moderation.modal.banMessage', { name: player.displayName }),
      confirmLabel: t('moderation.modal.banBtn'),
    });
    if (!ok) return;

    setBusy(true);
    try {
      await moderationApi.ban({
        userId: player.userId,
        deleteMessageSeconds: banDeleteSec,
        reason: actionReason.trim() || undefined,
      });
      showToast(t('moderation.modal.bannedToast', { name: player.displayName }));
      await Promise.all([syncAfterAction(), refreshBans().catch(() => null)]);
      onClose();
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={Boolean(player)}
      onClose={onClose}
      maxWidthClass="max-w-3xl"
      title={
        player ? (
          <div className="flex items-center gap-3 min-w-0">
            <img
              src={player.avatarUrl}
              alt={player.displayName}
              className="w-10 h-10 rounded-full object-cover bg-bg-elevated shrink-0"
            />
            <div className="min-w-0">
              <h3 className="text-lg font-semibold text-white truncate">{player.displayName}</h3>
              <p className="text-xs text-slate-400 truncate">
                @{player.username} · {player.userId}
              </p>
            </div>
          </div>
        ) : null
      }
      headerRight={
        player ? (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => onOpenDetail(player.userId)}
            icon={<User className="w-3.5 h-3.5 text-sky-300" />}
          >
            {t('common.detail')}
          </Button>
        ) : null
      }
    >
      {!player ? null : player.isOwner ? (
        <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-sm text-amber-200">
          {t('moderation.modal.cannotModerateOwner')}
        </div>
      ) : loading ? (
        <SkeletonCard rows={3} />
      ) : (
        <div className="space-y-5">
          {player.isTimedOut && player.timeoutUntil && (
            <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/35 flex items-center justify-between gap-3">
              <div className="text-xs text-amber-200 font-medium">
                {t('moderation.modal.activeTimeout', {
                  date: formatDateTime(player.timeoutUntil, lang),
                })}
              </div>
              <Button
                size="sm"
                variant="secondary"
                loading={busy}
                onClick={() => void handleTimeout(0)}
                icon={<Volume2 className="w-3.5 h-3.5 text-emerald-400" />}
              >
                {t('moderation.modal.removeTimeout')}
              </Button>
            </div>
          )}

          {/* Warnings */}
          <div className="p-4 rounded-xl bg-bg-elevated/60 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-semibold text-white flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                <span>{t('moderation.modal.warningsHeading', { count: warnings.length })}</span>
              </div>
              {warnings.length > 0 && (
                <Button size="sm" variant="danger" loading={busy} onClick={() => void handleClearWarnings()}>
                  {t('moderation.modal.clearAll')}
                </Button>
              )}
            </div>

            {warnings.length === 0 ? (
              <p className="text-xs text-slate-400">{t('moderation.modal.noWarnings')}</p>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {warnings.map((w) => (
                  <div
                    key={w.id}
                    className="p-2.5 rounded-lg bg-bg-base/70 border border-slate-800 flex items-start justify-between gap-2 text-xs"
                  >
                    <div className="min-w-0">
                      <div className="text-slate-200 font-medium">
                        #{w.id} · {w.reason}
                      </div>
                      <div className="text-slate-500 mt-0.5">
                        {w.moderatorTag ?? t('common.unknown')} · {formatDateTime(w.createdAt, lang)}
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void handleDeleteWarning(w.id)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 transition shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <input
                type="text"
                value={warnReason}
                onChange={(e) => setWarnReason(e.target.value)}
                placeholder={t('moderation.modal.warnReasonPlaceholder')}
                className="input-field flex-1 min-w-0"
              />
              <Button
                variant="primary"
                loading={busy}
                disabled={!warnReason.trim()}
                onClick={() => void handleWarn()}
                className="whitespace-nowrap shrink-0 h-[42px]"
              >
                {t('moderation.modal.issueWarn')}
              </Button>
            </div>
          </div>

          {/* Timeout */}
          {player.inGuild && (
            <div className="p-4 rounded-xl bg-bg-elevated/60 border border-slate-800 space-y-3">
              <div className="text-sm font-semibold text-white flex items-center gap-2">
                <Clock className="w-4 h-4 text-orange-400" />
                <span>{t('moderation.modal.timeoutHeading')}</span>
              </div>

              <div className="flex flex-col sm:flex-row gap-2">
                <DurationUnitInput
                  minutes={timeoutMinutes}
                  onChangeMinutes={setTimeoutMinutes}
                  disabled={busy}
                />

                <input
                  type="text"
                  value={timeoutReason}
                  onChange={(e) => setTimeoutReason(e.target.value)}
                  placeholder={t('moderation.modal.timeoutReasonPlaceholder')}
                  className="input-field flex-1 min-w-0"
                />
              </div>

              <Button
                variant="secondary"
                loading={busy}
                onClick={() => void handleTimeout(timeoutMinutes)}
              >
                {t('moderation.modal.timeoutApply')}
              </Button>
            </div>
          )}

          {/* Kick & Ban */}
          <div className="p-4 rounded-xl bg-red-500/5 border border-red-500/25 space-y-3">
            <div className="text-sm font-semibold text-white flex items-center gap-2">
              <Ban className="w-4 h-4 text-red-400" />
              <span>{t('moderation.modal.kickBanHeading')}</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input
                type="text"
                value={actionReason}
                onChange={(e) => setActionReason(e.target.value)}
                placeholder={t('moderation.modal.timeoutReasonPlaceholder')}
                className="input-field"
              />
              <select
                value={banDeleteSec}
                onChange={(e) => setBanDeleteSec(Number(e.target.value))}
                className="input-field"
              >
                {BAN_DELETE_PRESETS.map((p) => (
                  <option key={p.seconds} value={p.seconds}>
                    {t('moderation.modal.deleteMessages')}: {t(p.labelKey)}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-wrap gap-2">
              {player.inGuild && (
                <Button
                  variant="danger"
                  loading={busy}
                  onClick={() => void handleKick()}
                  icon={<UserX className="w-4 h-4" />}
                >
                  {t('moderation.modal.kickBtn')}
                </Button>
              )}
              <Button
                variant="danger"
                loading={busy}
                onClick={() => void handleBan()}
                icon={<Ban className="w-4 h-4" />}
              >
                {t('moderation.modal.banBtn')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
