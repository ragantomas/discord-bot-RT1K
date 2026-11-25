import {
  Archive,
  Award,
  Plus,
  Radio,
  RefreshCw,
  Save,
  Settings as SettingsIcon,
  Trash2,
  Upload,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { backupApi } from '@/api/backup';
import { settingsApi } from '@/api/settings';
import { Button } from '@/components/ui/Button';
import { RoleListEditor, RoleSelect, TextChannelSelect } from '@/components/ui/DiscordSelects';
import { SkeletonCard } from '@/components/ui/Feedback';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { API_LIMITS, BOT_STATUS_VARIABLES, RANK_UPDATER_LIMITS } from '@/config/constants';
import { useConfirm } from '@/context/ConfirmContext';
import { useDashboard } from '@/context/DashboardContext';
import { useToast } from '@/context/ToastContext';
import { BackupModal } from '@/features/overview/BackupModal';
import { useDirtyForm } from '@/hooks/useDirtyForm';
import { getAppLanguage } from '@/i18n';
import type { RankUpdaterSettings } from '@/types/api';
import { formatHexColor, resolveBotStatusPreview } from '@/utils/format';

interface EditableRankRow {
  min: number;
  roleId: string;
  color: string;
}

export function SettingsPage() {
  const { t } = useTranslation();
  const lang = getAppLanguage();
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const {
    settings,
    overview,
    meta,
    steamApiKeyConfigured,
    rankUpdaterStatus,
    initialLoading,
    replaceSettings,
    setRankUpdaterStatus,
    refreshOverview,
    reloadAll,
  } = useDashboard();

  const [dashboardRoleIds, setDashboardRoleIds] = useState<string[]>(() => [
    ...(settings?.dashboardRoleIds || []),
  ]);
  const [allowedChannelId, setAllowedChannelId] = useState<string | null>(
    () => settings?.allowedChannelId ?? null,
  );
  const [bypassRoleIds, setBypassRoleIds] = useState<string[]>(() => [
    ...(settings?.allowedChannelBypassRoleIds || []),
  ]);
  const [botStatusText, setBotStatusText] = useState(() => settings?.botStatus?.text || '');
  const [rankUpdater, setRankUpdater] = useState<RankUpdaterSettings>(() =>
    settings?.rankUpdater
      ? { ...settings.rankUpdater }
      : {
          activeIntervalMinutes: 5,
          postMatchDelayMinutes: 4,
          backgroundIntervalMinutes: 60,
          inactiveIntervalHours: 12,
          useSteamApi: true,
          useDiscordPresence: true,
        },
  );
  const [unrankedRoleId, setUnrankedRoleId] = useState<string | null>(
    () => settings?.unrankedRoleId ?? null,
  );
  const [rankRoles, setRankRoles] = useState<EditableRankRow[]>(() =>
    (settings?.rankRoles || []).map((r) => ({
      min: r.min,
      roleId: r.roleId,
      color: formatHexColor(r.color, '#808080'),
    })),
  );
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [backupOpen, setBackupOpen] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const syncedSettingsRef = useRef(settings);

  const syncFromSettings = useCallback(() => {
    if (!settings) return;
    setDashboardRoleIds([...(settings.dashboardRoleIds || [])]);
    setAllowedChannelId(settings.allowedChannelId ?? null);
    setBypassRoleIds([...(settings.allowedChannelBypassRoleIds || [])]);
    setBotStatusText(settings.botStatus?.text || '');
    setRankUpdater({ ...settings.rankUpdater });
    setUnrankedRoleId(settings.unrankedRoleId ?? null);
    setRankRoles(
      (settings.rankRoles || []).map((r) => ({
        min: r.min,
        roleId: r.roleId,
        color: formatHexColor(r.color, '#808080'),
      })),
    );
    setDirty(false);
  }, [settings]);

  useEffect(() => {
    if (settings && syncedSettingsRef.current !== settings) {
      syncedSettingsRef.current = settings;
      syncFromSettings();
    }
  }, [settings, syncFromSettings]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const res = await settingsApi.saveGeneral({
        dashboardRoleIds: dashboardRoleIds.filter(Boolean),
        allowedChannelId,
        allowedChannelBypassRoleIds: bypassRoleIds.filter(Boolean),
        unrankedRoleId,
        rankRoles,
        rankUpdater,
        botStatus: { text: botStatusText },
      });
      replaceSettings(res.settings);
      setRankUpdaterStatus(res.rankUpdaterStatus);
      setDirty(false);
      await refreshOverview();
      showToast(t('settings.savedToast'));
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setSaving(false);
    }
  }, [
    dashboardRoleIds,
    allowedChannelId,
    bypassRoleIds,
    unrankedRoleId,
    rankRoles,
    rankUpdater,
    botStatusText,
    replaceSettings,
    setRankUpdaterStatus,
    refreshOverview,
    showToast,
    t,
  ]);

  useDirtyForm(dirty, handleSave, syncFromSettings);

  const handleRestoreFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    let parsed: unknown;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      showToast(t('backup.invalidJson'), 'error');
      return;
    }

    const ok = await confirm({
      title: t('backup.restoreTitle'),
      message: t('backup.restoreMessage', { name: file.name }),
      confirmLabel: t('backup.restore'),
    });
    if (!ok) return;

    setRestoring(true);
    try {
      const res = await backupApi.restore(parsed);
      showToast(t('backup.restored', { labels: res.restored.join(' + ') }));
      await reloadAll();
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setRestoring(false);
    }
  };

  if (initialLoading || !settings) return <SkeletonCard rows={6} />;

  const statusPreview = resolveBotStatusPreview(botStatusText, overview, lang);
  const isRateLimited = Boolean(
    rankUpdaterStatus?.rateLimitedUntil && rankUpdaterStatus.rateLimitedUntil > Date.now(),
  );

  return (
    <div className="space-y-6">
      <form
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          void handleSave();
        }}
        className="space-y-6"
      >
        {/* Access & commands */}
        <div className="card p-6 space-y-5">
          <h3 className="text-base font-semibold text-white flex items-center gap-2">
            <SettingsIcon className="w-4 h-4 text-brand" />
            <span>{t('settings.accessTitle')}</span>
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-xs font-medium text-slate-400">
                {t('settings.dashboardAccess')}
              </label>
              <RoleListEditor
                roles={meta?.roles ?? []}
                value={dashboardRoleIds}
                onChange={(next) => {
                  setDashboardRoleIds(next);
                  setDirty(true);
                }}
              />
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-400">
                  {t('settings.allowedChannel')}
                </label>
                <TextChannelSelect
                  channels={meta?.textChannels ?? []}
                  value={allowedChannelId}
                  onChange={(val) => {
                    setAllowedChannelId(val);
                    setDirty(true);
                  }}
                  noneLabel={t('common.none')}
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium text-slate-400">
                  {t('settings.bypassRoles')}
                </label>
                <RoleListEditor
                  roles={meta?.roles ?? []}
                  value={bypassRoleIds}
                  onChange={(next) => {
                    setBypassRoleIds(next);
                    setDirty(true);
                  }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Bot status */}
        <div className="card p-6 space-y-4">
          <h3 className="text-base font-semibold text-white flex items-center gap-2">
            <Radio className="w-4 h-4 text-emerald-400" />
            <span>{t('settings.botStatusTitle')}</span>
          </h3>

          <input
            type="text"
            maxLength={API_LIMITS.BOT_STATUS_MAX}
            value={botStatusText}
            onChange={(e) => {
              setBotStatusText(e.target.value);
              setDirty(true);
            }}
            placeholder={t('settings.botStatusPlaceholder')}
            className="input-field"
          />

          <div className="flex flex-wrap gap-2">
            {BOT_STATUS_VARIABLES.map((item) => (
              <button
                key={item.token}
                type="button"
                onClick={() => {
                  setBotStatusText((prev) =>
                    `${prev}${prev && !prev.endsWith(' ') ? ' ' : ''}${item.token}`.slice(
                      0,
                      API_LIMITS.BOT_STATUS_MAX,
                    ),
                  );
                  setDirty(true);
                }}
                className="px-2.5 py-1 rounded-lg bg-bg-elevated hover:bg-bg-hover border border-slate-700 text-xs text-slate-200 transition"
              >
                <code className="text-sky-300">{item.token}</code> · {t(item.labelKey)}
              </button>
            ))}
          </div>

          <div className="text-xs text-slate-400">
            {t('settings.botStatusPluralHint')}{' '}
            <code className="text-sky-300">{t('settings.botStatusPluralExample')}</code>
          </div>

          {statusPreview && (
            <div className="p-3 rounded-xl bg-bg-elevated/60 border border-slate-800 text-xs">
              <span className="text-slate-400">{t('settings.botStatusPreview')}: </span>
              <span className="text-white font-medium">{statusPreview}</span>
            </div>
          )}
        </div>

        {/* Rank updater */}
        <div className="card p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-base font-semibold text-white flex items-center gap-2">
              <RefreshCw className="w-4 h-4 text-sky-400" />
              <span>{t('settings.rankUpdaterTitle')}</span>
            </h3>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-1 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-xs font-medium text-emerald-300">
                {t('settings.inCs2', { count: rankUpdaterStatus?.playingCount ?? 0 })}
              </span>
              {isRateLimited && (
                <span className="px-2.5 py-1 rounded-lg bg-amber-500/15 border border-amber-500/30 text-xs font-medium text-amber-300">
                  {t('settings.rateLimited')}
                </span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-400">
                {t('settings.activeInterval')}
              </label>
              <input
                type="number"
                min={RANK_UPDATER_LIMITS.activeMin}
                max={RANK_UPDATER_LIMITS.activeMax}
                value={rankUpdater.activeIntervalMinutes}
                onChange={(e) => {
                  setRankUpdater((p) => ({ ...p, activeIntervalMinutes: Number(e.target.value) }));
                  setDirty(true);
                }}
                className="input-field"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-400">
                {t('settings.postMatchDelay')}
              </label>
              <input
                type="number"
                min={RANK_UPDATER_LIMITS.postMatchMin}
                max={RANK_UPDATER_LIMITS.postMatchMax}
                value={rankUpdater.postMatchDelayMinutes}
                onChange={(e) => {
                  setRankUpdater((p) => ({ ...p, postMatchDelayMinutes: Number(e.target.value) }));
                  setDirty(true);
                }}
                className="input-field"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-400">
                {t('settings.backgroundInterval')}
              </label>
              <input
                type="number"
                min={RANK_UPDATER_LIMITS.backgroundMin}
                max={RANK_UPDATER_LIMITS.backgroundMax}
                value={rankUpdater.backgroundIntervalMinutes}
                onChange={(e) => {
                  setRankUpdater((p) => ({
                    ...p,
                    backgroundIntervalMinutes: Number(e.target.value),
                  }));
                  setDirty(true);
                }}
                className="input-field"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-400">
                {t('settings.inactiveInterval')}
              </label>
              <input
                type="number"
                min={RANK_UPDATER_LIMITS.inactiveMin}
                max={RANK_UPDATER_LIMITS.inactiveMax}
                value={rankUpdater.inactiveIntervalHours}
                onChange={(e) => {
                  setRankUpdater((p) => ({ ...p, inactiveIntervalHours: Number(e.target.value) }));
                  setDirty(true);
                }}
                className="input-field"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="flex items-center justify-between gap-3 p-3.5 rounded-xl bg-bg-elevated/60 border border-slate-800">
              <div>
                <div className="text-sm font-medium text-white">{t('settings.useSteamApi')}</div>
                {!steamApiKeyConfigured && (
                  <div className="text-xs text-amber-300 mt-0.5">
                    {t('settings.steamKeyMissing')}
                  </div>
                )}
              </div>
              <ToggleSwitch
                checked={rankUpdater.useSteamApi}
                onChange={(v) => {
                  setRankUpdater((p) => ({ ...p, useSteamApi: v }));
                  setDirty(true);
                }}
              />
            </div>

            <div className="flex items-center justify-between gap-3 p-3.5 rounded-xl bg-bg-elevated/60 border border-slate-800">
              <span className="text-sm font-medium text-white">
                {t('settings.useDiscordPresence')}
              </span>
              <ToggleSwitch
                checked={rankUpdater.useDiscordPresence}
                onChange={(v) => {
                  setRankUpdater((p) => ({ ...p, useDiscordPresence: v }));
                  setDirty(true);
                }}
              />
            </div>
          </div>
        </div>

        {/* CS2 Rank roles */}
        <div className="card p-6 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-base font-semibold text-white flex items-center gap-2">
              <Award className="w-4 h-4 text-brand-gold" />
              <span>{t('settings.rankRolesTitle')}</span>
            </h3>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setRankRoles((prev) => [...prev, { min: 0, roleId: '', color: '#5865F2' }]);
                setDirty(true);
              }}
              icon={<Plus className="w-3.5 h-3.5" />}
            >
              {t('settings.addTier')}
            </Button>
          </div>

          <div className="space-y-1.5 max-w-md">
            <label className="text-xs font-medium text-slate-400">
              {t('settings.unrankedRole')}
            </label>
            <RoleSelect
              roles={meta?.roles ?? []}
              value={unrankedRoleId}
              onChange={(val) => {
                setUnrankedRoleId(val);
                setDirty(true);
              }}
            />
          </div>

          <div className="space-y-2.5">
            {rankRoles.map((row, idx) => (
              <div
                key={idx}
                className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-center p-3 rounded-xl bg-bg-elevated/60 border border-slate-800"
              >
                <div className="sm:col-span-3">
                  <input
                    type="number"
                    min={0}
                    value={row.min}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setRankRoles((prev) =>
                        prev.map((r, i) => (i === idx ? { ...r, min: val } : r)),
                      );
                      setDirty(true);
                    }}
                    placeholder={t('settings.minElo')}
                    className="input-field"
                  />
                </div>
                <div className="sm:col-span-6">
                  <RoleSelect
                    roles={meta?.roles ?? []}
                    value={row.roleId}
                    onChange={(val) => {
                      setRankRoles((prev) =>
                        prev.map((r, i) => (i === idx ? { ...r, roleId: val ?? '' } : r)),
                      );
                      setDirty(true);
                    }}
                  />
                </div>
                <div className="sm:col-span-2">
                  <input
                    type="color"
                    value={row.color}
                    onChange={(e) => {
                      const val = e.target.value;
                      setRankRoles((prev) =>
                        prev.map((r, i) => (i === idx ? { ...r, color: val } : r)),
                      );
                      setDirty(true);
                    }}
                    className="input-field h-[42px] p-1 cursor-pointer"
                  />
                </div>
                <div className="sm:col-span-1 flex justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setRankRoles((prev) => prev.filter((_, i) => i !== idx));
                      setDirty(true);
                    }}
                    className="p-2.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-300 transition"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
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
        </div>
      </form>

      {/* Backup & Restore */}
      <div className="card p-6 space-y-4">
        <h3 className="text-base font-semibold text-white flex items-center gap-2">
          <Archive className="w-4 h-4 text-emerald-400" />
          <span>{t('settings.backupTitle')}</span>
        </h3>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="secondary"
            onClick={() => setBackupOpen(true)}
            icon={<Archive className="w-4 h-4 text-emerald-400" />}
          >
            {t('backup.title')}
          </Button>

          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            onChange={(e) => void handleRestoreFile(e)}
            className="hidden"
          />
          <Button
            variant="secondary"
            loading={restoring}
            onClick={() => fileInputRef.current?.click()}
            icon={<Upload className="w-4 h-4 text-amber-400" />}
          >
            {t('backup.restore')}
          </Button>
        </div>
      </div>

      <BackupModal open={backupOpen} onClose={() => setBackupOpen(false)} />
    </div>
  );
}
