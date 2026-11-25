import { Activity, RefreshCw, Save } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { settingsApi } from '@/api/settings';
import { Button } from '@/components/ui/Button';
import { TextChannelSelect } from '@/components/ui/DiscordSelects';
import { SkeletonCard } from '@/components/ui/Feedback';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { useDashboard } from '@/context/DashboardContext';
import { useToast } from '@/context/ToastContext';
import { useDirtyForm } from '@/hooks/useDirtyForm';
import { getAppLanguage } from '@/i18n';
import { formatDateTime, splitIntervalParts } from '@/utils/format';

export function CsStatusPage() {
  const { t } = useTranslation();
  const lang = getAppLanguage();
  const { showToast } = useToast();
  const { settings, meta, initialLoading, setSettingsSlice, refreshOverview } = useDashboard();

  const [enabled, setEnabled] = useState(() => Boolean(settings?.csStatus.enabled));
  const [channelId, setChannelId] = useState<string | null>(
    () => settings?.csStatus.channelId ?? null,
  );
  const [intervalVal, setIntervalVal] = useState(
    () => splitIntervalParts(settings?.csStatus.intervalSeconds ?? 300).value,
  );
  const [intervalUnit, setIntervalUnit] = useState<'s' | 'm'>(
    () => splitIntervalParts(settings?.csStatus.intervalSeconds ?? 300).unit,
  );
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const syncedSettingsRef = useRef(settings);

  const syncFromSettings = useCallback(() => {
    if (!settings) return;
    setEnabled(Boolean(settings.csStatus.enabled));
    setChannelId(settings.csStatus.channelId ?? null);
    const parts = splitIntervalParts(settings.csStatus.intervalSeconds);
    setIntervalVal(parts.value);
    setIntervalUnit(parts.unit);
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
      const res = await settingsApi.saveCsStatus({
        enabled,
        channelId,
        interval: `${intervalVal}${intervalUnit}`,
      });
      setSettingsSlice('csStatus', res.csStatus);
      setDirty(false);
      await refreshOverview();
      showToast(t('csstatus.savedToast'));
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setSaving(false);
    }
  }, [enabled, channelId, intervalVal, intervalUnit, setSettingsSlice, refreshOverview, showToast, t]);

  useDirtyForm(dirty, handleSave, syncFromSettings);

  const handleRefreshNow = async () => {
    setRefreshing(true);
    try {
      const res = await settingsApi.refreshCsStatus();
      setSettingsSlice('csStatus', res.csStatus);
      showToast(t('csstatus.refreshedToast'));
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setRefreshing(false);
    }
  };

  if (initialLoading || !settings) return <SkeletonCard rows={4} />;

  return (
    <form
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        void handleSave();
      }}
      className="card p-6 space-y-5"
    >
      <h3 className="text-base font-semibold text-white flex items-center gap-2">
        <Activity className="w-4 h-4 text-sky-400" />
        <span>{t('nav.csstatus')}</span>
      </h3>

      <div className="flex items-center justify-between gap-4 p-4 rounded-xl bg-bg-elevated border border-slate-800">
        <span className="text-sm font-semibold text-white">{t('csstatus.enable')}</span>
        <ToggleSwitch
          checked={enabled}
          onChange={(v) => {
            setEnabled(v);
            setDirty(true);
          }}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-slate-400">{t('common.channel')}</label>
          <TextChannelSelect
            channels={meta?.textChannels ?? []}
            value={channelId}
            onChange={(val) => {
              setChannelId(val);
              setDirty(true);
            }}
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-slate-400">{t('csstatus.interval')}</label>
          <div className="grid grid-cols-2 gap-2">
            <input
              type="number"
              min={1}
              max={3600}
              value={intervalVal}
              onChange={(e) => {
                setIntervalVal(Number(e.target.value));
                setDirty(true);
              }}
              className="input-field"
            />
            <select
              value={intervalUnit}
              onChange={(e) => {
                setIntervalUnit(e.target.value === 's' ? 's' : 'm');
                setDirty(true);
              }}
              className="input-field"
            >
              <option value="s">{t('csstatus.seconds')}</option>
              <option value="m">{t('csstatus.minutes')}</option>
            </select>
          </div>
        </div>
      </div>

      {settings.csStatus.lastUpdatedAt > 0 && (
        <div className="text-xs text-slate-400">
          {t('csstatus.lastUpdated')}:{' '}
          <span className="text-slate-200">
            {formatDateTime(settings.csStatus.lastUpdatedAt, lang)}
          </span>
        </div>
      )}

      <div className="flex items-center justify-between flex-wrap gap-3 pt-2">
        <Button
          variant="secondary"
          loading={refreshing}
          loadingText={t('common.refreshing')}
          onClick={() => void handleRefreshNow()}
          icon={<RefreshCw className="w-4 h-4" />}
        >
          {t('csstatus.refreshNow')}
        </Button>

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
  );
}
