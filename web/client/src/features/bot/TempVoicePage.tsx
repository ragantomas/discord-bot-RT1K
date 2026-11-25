import { Edit3, Lock, Mic, Plus, RefreshCw, Save, Trash2, Unlock, UserX } from 'lucide-react';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { tempVoiceApi } from '@/api/tempvoice';
import { Button } from '@/components/ui/Button';
import {
  CategorySelect,
  RoleListEditor,
  VoiceChannelSelect,
} from '@/components/ui/DiscordSelects';
import { EmptyState, SkeletonCard } from '@/components/ui/Feedback';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { API_LIMITS, DEFAULT_TEMPVOICE_SETUP_FACTORY } from '@/config/constants';
import { useConfirm } from '@/context/ConfirmContext';
import { useDashboard } from '@/context/DashboardContext';
import { useToast } from '@/context/ToastContext';
import { RenameRoomModal } from '@/features/bot/RenameRoomModal';
import { useDirtyForm } from '@/hooks/useDirtyForm';
import type { TempVoiceRoom, TempVoiceSetup } from '@/types/api';

export function TempVoicePage() {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const {
    settings,
    meta,
    tempRooms,
    initialLoading,
    setSettingsSlice,
    refreshTempRooms,
    refreshOverview,
    refreshMeta,
  } = useDashboard();

  const [enabled, setEnabled] = useState(false);
  const [setups, setSetups] = useState<TempVoiceSetup[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [refreshingRooms, setRefreshingRooms] = useState(false);
  const [renamingRoom, setRenamingRoom] = useState<TempVoiceRoom | null>(null);

  const syncFromSettings = useCallback(() => {
    if (!settings) return;
    setEnabled(Boolean(settings.tempVoice.enabled));
    setSetups(
      (settings.tempVoice.setups || []).map((s) => ({
        ...s,
        lockRoleIds: [...(s.lockRoleIds || [])],
        createTriggerChannel: false,
      })),
    );
    setDirty(false);
  }, [settings]);

  useEffect(() => {
    syncFromSettings();
  }, [syncFromSettings]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const res = await tempVoiceApi.saveSettings({ enabled, setups });
      setSettingsSlice('tempVoice', res.tempVoice);
      setDirty(false);
      await Promise.all([refreshOverview(), refreshMeta()]);
      showToast(t('tempvoice.savedToast'));
      for (const warn of res.warnings || []) {
        showToast(warn, 'warn');
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setSaving(false);
    }
  }, [enabled, setups, setSettingsSlice, refreshOverview, refreshMeta, showToast, t]);

  useDirtyForm(dirty, handleSave, syncFromSettings);

  const updateSetup = (idx: number, patch: Partial<TempVoiceSetup>) => {
    setSetups((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
    setDirty(true);
  };

  const removeSetup = async (idx: number) => {
    const ok = await confirm({
      title: t('tempvoice.removeSetupTitle', { index: idx + 1 }),
      message: t('tempvoice.removeSetupMessage', { index: idx + 1 }),
      confirmLabel: t('common.remove'),
    });
    if (!ok) return;
    setSetups((prev) => prev.filter((_, i) => i !== idx));
    setDirty(true);
  };

  const handleToggleLock = async (room: TempVoiceRoom) => {
    try {
      await tempVoiceApi.toggleLock(room.channelId);
      await refreshTempRooms();
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), 'error');
    }
  };

  const handleCloseRoom = async (room: TempVoiceRoom) => {
    const ok = await confirm({
      title: t('tempvoice.closeTitle'),
      message: t('tempvoice.closeMessage', { name: room.name }),
      confirmLabel: t('common.close'),
    });
    if (!ok) return;
    try {
      await tempVoiceApi.closeRoom(room.channelId);
      showToast(t('tempvoice.closedToast', { name: room.name }));
      await Promise.all([refreshTempRooms(), refreshOverview()]);
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), 'error');
    }
  };

  const handleKickMember = async (room: TempVoiceRoom, userId: string, name: string) => {
    const ok = await confirm({
      title: t('tempvoice.kickTitle'),
      message: t('tempvoice.kickMessage', { name }),
    });
    if (!ok) return;
    try {
      await tempVoiceApi.kickMember(room.channelId, userId);
      showToast(t('tempvoice.kickedToast', { name }));
      await refreshTempRooms();
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), 'error');
    }
  };

  const handleRenameSubmit = async (newName: string) => {
    if (!renamingRoom) return;
    try {
      const res = await tempVoiceApi.renameRoom(renamingRoom.channelId, newName);
      showToast(t('tempvoice.renamedToast', { name: res.name }));
      await refreshTempRooms();
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), 'error');
    }
  };

  const onFormSubmit = (e: FormEvent) => {
    e.preventDefault();
    void handleSave();
  };

  if (initialLoading || !settings) return <SkeletonCard rows={6} />;

  const maxBitrate = meta?.maxBitrateKbps ?? API_LIMITS.TEMPVOICE_MAX_BITRATE;

  return (
    <div className="space-y-6">
      {/* Active rooms */}
      <div className="card p-6 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-base font-semibold text-white flex items-center gap-2">
            <Mic className="w-4 h-4 text-brand" />
            <span>
              {t('tempvoice.activeRooms')} ({tempRooms.length})
            </span>
          </h3>
          <Button
            size="sm"
            variant="secondary"
            loading={refreshingRooms}
            onClick={async () => {
              setRefreshingRooms(true);
              try {
                await refreshTempRooms();
              } finally {
                setRefreshingRooms(false);
              }
            }}
            icon={<RefreshCw className="w-3.5 h-3.5" />}
          >
            {t('common.refresh')}
          </Button>
        </div>

        {tempRooms.length === 0 ? (
          <EmptyState message={t('tempvoice.noRooms')} />
        ) : (
          <div className="space-y-3">
            {tempRooms.map((room) => (
              <div
                key={room.channelId}
                className="p-4 rounded-xl bg-bg-elevated/60 border border-slate-800 space-y-3"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-white truncate">
                        🔊 {room.name}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-md text-[11px] font-medium border ${
                          room.locked
                            ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                            : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                        }`}
                      >
                        {room.locked ? t('tempvoice.locked') : t('tempvoice.unlocked')}
                      </span>
                    </div>
                    <div className="text-xs text-slate-400 mt-1">
                      {t('common.owner')}: {room.ownerName} ·{' '}
                      {t('tempvoice.membersCount', {
                        count: room.memberCount,
                        limit: room.userLimit > 0 ? room.userLimit : t('tempvoice.unlimited'),
                      })}{' '}
                      · {room.bitrateKbps} kbps
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => void handleToggleLock(room)}
                      icon={
                        room.locked ? (
                          <Unlock className="w-3.5 h-3.5" />
                        ) : (
                          <Lock className="w-3.5 h-3.5" />
                        )
                      }
                    >
                      {room.locked ? t('tempvoice.unlock') : t('tempvoice.lock')}
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setRenamingRoom(room)}
                      icon={<Edit3 className="w-3.5 h-3.5" />}
                    >
                      {t('common.rename')}
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => void handleCloseRoom(room)}
                      icon={<Trash2 className="w-3.5 h-3.5" />}
                    >
                      {t('common.close')}
                    </Button>
                  </div>
                </div>

                {room.members.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-1 border-t border-slate-800/80">
                    {room.members.map((m) => (
                      <div
                        key={m.id}
                        className="inline-flex items-center gap-2 px-2.5 py-1 rounded-lg bg-bg-base/70 border border-slate-800 text-xs"
                      >
                        <img
                          src={m.avatarUrl}
                          alt={m.displayName}
                          className="w-5 h-5 rounded-full object-cover"
                        />
                        <span className="text-slate-200">{m.displayName}</span>
                        <button
                          type="button"
                          onClick={() => void handleKickMember(room, m.id, m.displayName)}
                          className="text-slate-400 hover:text-red-400 transition"
                          title={t('tempvoice.kickTitle')}
                        >
                          <UserX className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Config form */}
      <form onSubmit={onFormSubmit} className="card p-6 space-y-5">
        <div className="flex items-center justify-between gap-4 p-4 rounded-xl bg-bg-elevated border border-slate-800">
          <span className="text-sm font-semibold text-white">{t('tempvoice.enableModule')}</span>
          <ToggleSwitch
            checked={enabled}
            onChange={(v) => {
              setEnabled(v);
              setDirty(true);
            }}
          />
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-white">{t('tempvoice.setups')}</h4>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setSetups((prev) => [...prev, DEFAULT_TEMPVOICE_SETUP_FACTORY(prev.length)]);
                setDirty(true);
              }}
              icon={<Plus className="w-3.5 h-3.5" />}
            >
              {t('tempvoice.addSetup')}
            </Button>
          </div>

          {setups.length === 0 ? (
            <EmptyState message={t('tempvoice.noSetups')} />
          ) : (
            setups.map((setup, idx) => (
              <div
                key={setup.id}
                className="p-5 rounded-2xl bg-bg-elevated/60 border border-slate-800 space-y-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold text-white">
                      {t('tempvoice.setupLabel', { index: idx + 1 })}
                    </span>
                    <ToggleSwitch
                      checked={setup.enabled}
                      onChange={(v) => updateSetup(idx, { enabled: v })}
                    />
                  </div>
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => void removeSetup(idx)}
                    icon={<Trash2 className="w-3.5 h-3.5" />}
                  >
                    {t('common.remove')}
                  </Button>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => updateSetup(idx, { createTriggerChannel: false })}
                    className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition ${
                      !setup.createTriggerChannel
                        ? 'bg-brand text-white border-brand'
                        : 'bg-bg-base text-slate-300 border-slate-700'
                    }`}
                  >
                    {t('tempvoice.triggerModeExisting')}
                  </button>
                  <button
                    type="button"
                    onClick={() => updateSetup(idx, { createTriggerChannel: true })}
                    className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition ${
                      setup.createTriggerChannel
                        ? 'bg-brand text-white border-brand'
                        : 'bg-bg-base text-slate-300 border-slate-700'
                    }`}
                  >
                    {t('tempvoice.triggerModeCreate')}
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {setup.createTriggerChannel ? (
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-slate-400">
                        {t('tempvoice.triggerName')}
                      </label>
                      <input
                        type="text"
                        maxLength={API_LIMITS.ROOM_NAME_MAX}
                        value={setup.triggerName}
                        onChange={(e) => updateSetup(idx, { triggerName: e.target.value })}
                        className="input-field"
                      />
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-slate-400">
                        {t('tempvoice.triggerChannel')}
                      </label>
                      <VoiceChannelSelect
                        channels={meta?.voiceChannels ?? []}
                        value={setup.triggerChannelId}
                        onChange={(val) => updateSetup(idx, { triggerChannelId: val })}
                      />
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-400">
                      {t('common.category')}
                    </label>
                    <CategorySelect
                      categories={meta?.categories ?? []}
                      value={setup.categoryId}
                      onChange={(val) => updateSetup(idx, { categoryId: val })}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-400">
                      {t('tempvoice.roomTemplate')}
                    </label>
                    <input
                      type="text"
                      maxLength={API_LIMITS.ROOM_NAME_MAX}
                      value={setup.roomNameTemplate}
                      onChange={(e) => updateSetup(idx, { roomNameTemplate: e.target.value })}
                      className="input-field"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-slate-400">
                        {t('tempvoice.bitrate')} (kbps)
                      </label>
                      <input
                        type="number"
                        min={API_LIMITS.TEMPVOICE_MIN_BITRATE}
                        max={maxBitrate}
                        value={setup.bitrateKbps}
                        onChange={(e) => updateSetup(idx, { bitrateKbps: Number(e.target.value) })}
                        className="input-field"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-slate-400">
                        {t('tempvoice.userLimit')}
                      </label>
                      <input
                        type="number"
                        min={API_LIMITS.TEMPVOICE_MIN_LIMIT}
                        max={API_LIMITS.TEMPVOICE_MAX_LIMIT}
                        value={setup.userLimit}
                        onChange={(e) => updateSetup(idx, { userLimit: Number(e.target.value) })}
                        className="input-field"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-3 pt-2 border-t border-slate-800/80">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium text-slate-200">
                      {t('tempvoice.lockOnDisable')}
                    </span>
                    <ToggleSwitch
                      checked={setup.lockOnDisable}
                      onChange={(v) => updateSetup(idx, { lockOnDisable: v })}
                    />
                  </div>

                  {setup.lockOnDisable && (
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-slate-400">
                        {t('tempvoice.lockRoles')}
                      </label>
                      <RoleListEditor
                        roles={meta?.roles ?? []}
                        value={setup.lockRoleIds}
                        onChange={(next) => updateSetup(idx, { lockRoleIds: next })}
                        allowEveryone
                      />
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="flex justify-end pt-2">
          <Button
            type="submit"
            variant="primary"
            loading={saving}
            loadingText={t('common.saving')}
            icon={<Save className="w-4 h-4" />}
          >
            {t('common.save')}
          </Button>
        </div>
      </form>

      <RenameRoomModal
        open={Boolean(renamingRoom)}
        currentName={renamingRoom?.name ?? ''}
        onClose={() => setRenamingRoom(null)}
        onSubmit={handleRenameSubmit}
      />
    </div>
  );
}
