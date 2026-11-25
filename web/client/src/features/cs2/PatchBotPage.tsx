import { Newspaper, Save, Send } from 'lucide-react';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { settingsApi } from '@/api/settings';
import { Button } from '@/components/ui/Button';
import { ChannelListEditor, RoleSelect } from '@/components/ui/DiscordSelects';
import { SkeletonCard } from '@/components/ui/Feedback';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { useDashboard } from '@/context/DashboardContext';
import { useToast } from '@/context/ToastContext';
import { useDirtyForm } from '@/hooks/useDirtyForm';
import { getAppLanguage } from '@/i18n';
import { formatDateTime } from '@/utils/format';

export function PatchBotPage() {
  const { t } = useTranslation();
  const lang = getAppLanguage();
  const { showToast } = useToast();
  const { settings, meta, initialLoading, setSettingsSlice, refreshOverview } = useDashboard();

  const [enabled, setEnabled] = useState(false);
  const [channelIds, setChannelIds] = useState<string[]>([]);
  const [mode, setMode] = useState<'all' | 'patchnotes'>('all');
  const [roleId, setRoleId] = useState<string | null>(null);
  const [withPing, setWithPing] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sendingLatest, setSendingLatest] = useState(false);

  const syncFromSettings = useCallback(() => {
    if (!settings) return;
    setEnabled(Boolean(settings.patchBot.enabled));
    setChannelIds([...(settings.patchBot.channelIds || [])]);
    setMode(settings.patchBot.mode === 'patchnotes' ? 'patchnotes' : 'all');
    setRoleId(settings.patchBot.roleId ?? null);
    setDirty(false);
  }, [settings]);

  useEffect(() => {
    syncFromSettings();
  }, [syncFromSettings]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const res = await settingsApi.savePatchBot({
        enabled,
        channelIds: channelIds.filter(Boolean),
        roleId,
        mode,
      });
      setSettingsSlice('patchBot', res.patchBot);
      setDirty(false);
      await refreshOverview();
      showToast(t('patchbot.savedToast'));
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setSaving(false);
    }
  }, [enabled, channelIds, roleId, mode, setSettingsSlice, refreshOverview, showToast, t]);

  useDirtyForm(dirty, handleSave, syncFromSettings);

  const handleSendLatest = async () => {
    setSendingLatest(true);
    try {
      const res = await settingsApi.sendLatestPatch(withPing);
      setSettingsSlice('patchBot', res.patchBot);
      showToast(t('patchbot.sentToast', { count: res.sentCount, title: res.title }));
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setSendingLatest(false);
    }
  };

  if (initialLoading || !settings) return <SkeletonCard rows={5} />;

  return (
    <div className="space-y-6">
      <form
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          void handleSave();
        }}
        className="card p-6 space-y-5"
      >
        <h3 className="text-base font-semibold text-white flex items-center gap-2">
          <Newspaper className="w-4 h-4 text-amber-400" />
          <span>PatchBot</span>
        </h3>

        <div className="flex items-center justify-between gap-4 p-4 rounded-xl bg-bg-elevated border border-slate-800">
          <span className="text-sm font-semibold text-white">{t('patchbot.enable')}</span>
          <ToggleSwitch
            checked={enabled}
            onChange={(v) => {
              setEnabled(v);
              setDirty(true);
            }}
          />
        </div>

        <div className="space-y-2">
          <label className="text-xs font-medium text-slate-400">{t('patchbot.channels')}</label>
          <ChannelListEditor
            channels={meta?.textChannels ?? []}
            value={channelIds}
            onChange={(next) => {
              setChannelIds(next);
              setDirty(true);
            }}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-400">{t('patchbot.mode')}</label>
            <select
              value={mode}
              onChange={(e) => {
                setMode(e.target.value === 'patchnotes' ? 'patchnotes' : 'all');
                setDirty(true);
              }}
              className="input-field"
            >
              <option value="all">{t('patchbot.modeAll')}</option>
              <option value="patchnotes">{t('patchbot.modePatchnotes')}</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-400">{t('patchbot.pingRole')}</label>
            <RoleSelect
              roles={meta?.roles ?? []}
              value={roleId}
              onChange={(val) => {
                setRoleId(val);
                setDirty(true);
              }}
              allowEveryone
              noneLabel={t('common.none')}
            />
          </div>
        </div>

        {settings.patchBot.lastPostedTitle && (
          <div className="p-3.5 rounded-xl bg-bg-elevated/60 border border-slate-800 text-xs text-slate-300">
            <span className="text-slate-400">{t('patchbot.lastPosted')}: </span>
            <span className="font-medium text-white">{settings.patchBot.lastPostedTitle}</span>
            {settings.patchBot.lastPostedAt && (
              <span className="text-slate-500">
                {' '}
                · {formatDateTime(settings.patchBot.lastPostedAt, lang)}
              </span>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <div className="flex items-center gap-3">
            <Button
              variant="secondary"
              loading={sendingLatest}
              loadingText={t('common.sending')}
              onClick={() => void handleSendLatest()}
              icon={<Send className="w-4 h-4" />}
            >
              {t('patchbot.sendLatest')}
            </Button>
            <div className="inline-flex items-center gap-2 text-xs text-slate-300">
              <ToggleSwitch checked={withPing} onChange={setWithPing} />
              <span>{t('patchbot.includePing')}</span>
            </div>
          </div>

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
    </div>
  );
}
