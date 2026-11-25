import { Save, Send, TrendingDown, TrendingUp } from 'lucide-react';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { settingsApi } from '@/api/settings';
import { Button } from '@/components/ui/Button';
import { TextChannelSelect } from '@/components/ui/DiscordSelects';
import { SkeletonCard } from '@/components/ui/Feedback';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { useDashboard } from '@/context/DashboardContext';
import { useToast } from '@/context/ToastContext';
import { useDirtyForm } from '@/hooks/useDirtyForm';

export function RankFeedPage() {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const { settings, meta, initialLoading, setSettingsSlice, refreshOverview } = useDashboard();

  const [enabled, setEnabled] = useState(false);
  const [channelId, setChannelId] = useState<string | null>(null);
  const [notifyRankUp, setNotifyRankUp] = useState(true);
  const [notifyDerank, setNotifyDerank] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  const syncFromSettings = useCallback(() => {
    if (!settings) return;
    setEnabled(Boolean(settings.rankFeed.enabled));
    setChannelId(settings.rankFeed.channelId ?? null);
    setNotifyRankUp(settings.rankFeed.notifyRankUp !== false);
    setNotifyDerank(settings.rankFeed.notifyDerank !== false);
    setDirty(false);
  }, [settings]);

  useEffect(() => {
    syncFromSettings();
  }, [syncFromSettings]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const res = await settingsApi.saveRankFeed({
        enabled,
        channelId,
        notifyRankUp,
        notifyDerank,
      });
      setSettingsSlice('rankFeed', res.rankFeed);
      setDirty(false);
      await refreshOverview();
      showToast(t('rankfeed.savedToast'));
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setSaving(false);
    }
  }, [enabled, channelId, notifyRankUp, notifyDerank, setSettingsSlice, refreshOverview, showToast, t]);

  useDirtyForm(dirty, handleSave, syncFromSettings);

  const handleTest = async () => {
    setTesting(true);
    try {
      await settingsApi.testRankFeed();
      showToast(t('rankfeed.testSent'));
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setTesting(false);
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
        <TrendingUp className="w-4 h-4 text-emerald-400" />
        <span>{t('nav.rankfeed')}</span>
      </h3>

      <div className="flex items-center justify-between gap-4 p-4 rounded-xl bg-bg-elevated border border-slate-800">
        <span className="text-sm font-semibold text-white">{t('rankfeed.enable')}</span>
        <ToggleSwitch
          checked={enabled}
          onChange={(v) => {
            setEnabled(v);
            setDirty(true);
          }}
        />
      </div>

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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="flex items-center justify-between gap-3 p-4 rounded-xl bg-bg-elevated/60 border border-slate-800">
          <div className="text-sm font-medium text-white inline-flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-emerald-400" />
            <span>{t('rankfeed.notifyRankUp')}</span>
          </div>
          <ToggleSwitch
            checked={notifyRankUp}
            onChange={(v) => {
              setNotifyRankUp(v);
              setDirty(true);
            }}
          />
        </div>

        <div className="flex items-center justify-between gap-3 p-4 rounded-xl bg-bg-elevated/60 border border-slate-800">
          <div className="text-sm font-medium text-white inline-flex items-center gap-2">
            <TrendingDown className="w-4 h-4 text-red-400" />
            <span>{t('rankfeed.notifyDerank')}</span>
          </div>
          <ToggleSwitch
            checked={notifyDerank}
            onChange={(v) => {
              setNotifyDerank(v);
              setDirty(true);
            }}
          />
        </div>
      </div>

      <div className="flex items-center justify-between flex-wrap gap-3 pt-2">
        <Button
          variant="secondary"
          loading={testing}
          loadingText={t('common.sending')}
          onClick={() => void handleTest()}
          icon={<Send className="w-4 h-4" />}
        >
          {t('common.test')}
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
