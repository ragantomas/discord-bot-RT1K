import { Hand, LogOut, Mail, MessageSquare, Save, Send } from 'lucide-react';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { settingsApi } from '@/api/settings';
import { Button } from '@/components/ui/Button';
import { TextChannelSelect } from '@/components/ui/DiscordSelects';
import { SkeletonCard } from '@/components/ui/Feedback';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { WELCOME_VARIABLES } from '@/config/constants';
import { useDashboard } from '@/context/DashboardContext';
import { useToast } from '@/context/ToastContext';
import { useDirtyForm } from '@/hooks/useDirtyForm';
import type { WelcomeSettings } from '@/types/api';

export function WelcomePage() {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const { settings, meta, initialLoading, setSettingsSlice, refreshOverview } = useDashboard();

  const [form, setForm] = useState<WelcomeSettings | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testingTarget, setTestingTarget] = useState<string | null>(null);

  const syncFromSettings = useCallback(() => {
    if (!settings) return;
    setForm({ ...settings.welcome });
    setDirty(false);
  }, [settings]);

  useEffect(() => {
    syncFromSettings();
  }, [syncFromSettings]);

  const updateField = <K extends keyof WelcomeSettings>(key: K, value: WelcomeSettings[K]) => {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
    setDirty(true);
  };

  const handleSave = useCallback(async () => {
    if (!form) return;
    setSaving(true);
    try {
      const res = await settingsApi.saveWelcome(form);
      setSettingsSlice('welcome', res.welcome);
      setDirty(false);
      await refreshOverview();
      showToast(t('welcome.savedToast'));
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setSaving(false);
    }
  }, [form, setSettingsSlice, refreshOverview, showToast, t]);

  useDirtyForm(dirty, handleSave, syncFromSettings);

  const handleTest = async (target: 'channel' | 'dm' | 'goodbye') => {
    setTestingTarget(target);
    try {
      await settingsApi.testWelcome(target);
      showToast(target === 'dm' ? t('welcome.testDmSent') : t('welcome.testChannelSent'));
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setTestingTarget(null);
    }
  };

  if (initialLoading || !form) return <SkeletonCard rows={6} />;

  return (
    <form
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        void handleSave();
      }}
      className="card p-6 space-y-5"
    >
      <h3 className="text-base font-semibold text-white flex items-center gap-2">
        <Hand className="w-4 h-4 text-pink-400" />
        <span>{t('nav.welcome')}</span>
      </h3>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="flex items-center justify-between gap-4 p-4 rounded-xl bg-bg-elevated border border-slate-800">
          <span className="text-sm font-semibold text-white">{t('welcome.enable')}</span>
          <ToggleSwitch
            checked={form.enabled}
            onChange={(v) => updateField('enabled', v)}
          />
        </div>
        <div className="flex items-center justify-between gap-4 p-4 rounded-xl bg-bg-elevated border border-slate-800">
          <span className="text-sm font-semibold text-white">{t('welcome.ignoreBots')}</span>
          <ToggleSwitch
            checked={form.ignoreBots}
            onChange={(v) => updateField('ignoreBots', v)}
          />
        </div>
      </div>

      {/* Variables bar */}
      <div className="p-3.5 rounded-xl bg-bg-elevated/50 border border-slate-800 text-xs text-slate-300 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-slate-400 font-medium">{t('common.variables')}</span>
          {WELCOME_VARIABLES.map((v) => (
            <span
              key={v.token}
              className="px-2 py-0.5 rounded-md bg-bg-base border border-slate-700 text-slate-200"
            >
              <code className="text-sky-300">{v.token}</code> {t(v.labelKey)}
            </span>
          ))}
        </div>
        <div className="text-slate-400">
          {t('welcome.pluralHint')}{' '}
          <code className="text-sky-300">{t('welcome.pluralExample')}</code>
        </div>
      </div>

      {/* In channel */}
      <div className="p-5 rounded-2xl bg-bg-elevated/60 border border-slate-800 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-white">
            <MessageSquare className="w-4 h-4 text-brand" />
            <span>{t('welcome.inChannel')}</span>
          </div>
          <ToggleSwitch
            checked={form.channelEnabled}
            onChange={(v) => updateField('channelEnabled', v)}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2 space-y-1.5">
            <label className="text-xs font-medium text-slate-400">{t('common.channel')}</label>
            <TextChannelSelect
              channels={meta?.textChannels ?? []}
              value={form.channelId}
              onChange={(val) => updateField('channelId', val)}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-400">{t('common.color')}</label>
            <input
              type="color"
              value={form.channelColor}
              onChange={(e) => updateField('channelColor', e.target.value)}
              className="input-field h-[42px] p-1 cursor-pointer"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-slate-400">{t('common.title')}</label>
          <input
            type="text"
            value={form.channelTitle}
            onChange={(e) => updateField('channelTitle', e.target.value)}
            className="input-field"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-slate-400">{t('common.description')}</label>
          <textarea
            rows={3}
            value={form.channelDescription}
            onChange={(e) => updateField('channelDescription', e.target.value)}
            className="input-field"
          />
        </div>

        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="inline-flex items-center gap-2.5 text-sm text-slate-200">
            <ToggleSwitch
              checked={form.channelShowAvatar}
              onChange={(v) => updateField('channelShowAvatar', v)}
            />
            <span>{t('welcome.showAvatar')}</span>
          </div>
          <Button
            size="sm"
            variant="secondary"
            loading={testingTarget === 'channel'}
            onClick={() => void handleTest('channel')}
            icon={<Send className="w-3.5 h-3.5" />}
          >
            {t('welcome.testChannel')}
          </Button>
        </div>
      </div>

      {/* Direct message */}
      <div className="p-5 rounded-2xl bg-bg-elevated/60 border border-slate-800 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-white">
            <Mail className="w-4 h-4 text-emerald-400" />
            <span>{t('welcome.directMessage')}</span>
          </div>
          <ToggleSwitch
            checked={form.dmEnabled}
            onChange={(v) => updateField('dmEnabled', v)}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="md:col-span-3 space-y-1.5">
            <label className="text-xs font-medium text-slate-400">{t('common.title')}</label>
            <input
              type="text"
              value={form.dmTitle}
              onChange={(e) => updateField('dmTitle', e.target.value)}
              className="input-field"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-400">{t('common.color')}</label>
            <input
              type="color"
              value={form.dmColor}
              onChange={(e) => updateField('dmColor', e.target.value)}
              className="input-field h-[42px] p-1 cursor-pointer"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-slate-400">{t('common.description')}</label>
          <textarea
            rows={3}
            value={form.dmDescription}
            onChange={(e) => updateField('dmDescription', e.target.value)}
            className="input-field"
          />
        </div>

        <div className="flex justify-end">
          <Button
            size="sm"
            variant="secondary"
            loading={testingTarget === 'dm'}
            onClick={() => void handleTest('dm')}
            icon={<Send className="w-3.5 h-3.5" />}
          >
            {t('welcome.testDm')}
          </Button>
        </div>
      </div>

      {/* Goodbye */}
      <div className="p-5 rounded-2xl bg-bg-elevated/60 border border-slate-800 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-white">
            <LogOut className="w-4 h-4 text-red-400" />
            <span>{t('welcome.goodbye')}</span>
          </div>
          <ToggleSwitch
            checked={form.goodbyeEnabled}
            onChange={(v) => updateField('goodbyeEnabled', v)}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2 space-y-1.5">
            <label className="text-xs font-medium text-slate-400">{t('common.channel')}</label>
            <TextChannelSelect
              channels={meta?.textChannels ?? []}
              value={form.goodbyeChannelId}
              onChange={(val) => updateField('goodbyeChannelId', val)}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-400">{t('common.color')}</label>
            <input
              type="color"
              value={form.goodbyeColor}
              onChange={(e) => updateField('goodbyeColor', e.target.value)}
              className="input-field h-[42px] p-1 cursor-pointer"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-slate-400">{t('common.title')}</label>
          <input
            type="text"
            value={form.goodbyeTitle}
            onChange={(e) => updateField('goodbyeTitle', e.target.value)}
            className="input-field"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-slate-400">{t('common.description')}</label>
          <textarea
            rows={3}
            value={form.goodbyeDescription}
            onChange={(e) => updateField('goodbyeDescription', e.target.value)}
            className="input-field"
          />
        </div>

        <div className="flex justify-end">
          <Button
            size="sm"
            variant="secondary"
            loading={testingTarget === 'goodbye'}
            onClick={() => void handleTest('goodbye')}
            icon={<Send className="w-3.5 h-3.5" />}
          >
            {t('welcome.testGoodbye')}
          </Button>
        </div>
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
  );
}
