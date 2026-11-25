import {
  AlertTriangle,
  Ban,
  Lock,
  Mic,
  Save,
  Send,
  ShieldCheck,
  Tag,
  UserMinus,
  UserPlus,
  VolumeX,
} from 'lucide-react';
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { settingsApi } from '@/api/settings';
import { Button } from '@/components/ui/Button';
import { TextChannelSelect } from '@/components/ui/DiscordSelects';
import { SkeletonCard } from '@/components/ui/Feedback';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { useDashboard } from '@/context/DashboardContext';
import { useToast } from '@/context/ToastContext';
import { useDirtyForm } from '@/hooks/useDirtyForm';
import type { AdminLogEvents } from '@/types/api';

const DEFAULT_EVENTS: AdminLogEvents = {
  memberJoin: true,
  memberLeave: true,
  bans: true,
  timeouts: true,
  warnings: true,
  channelActions: true,
  roleChanges: true,
  voiceActivity: false,
};

export function AdminLogPage() {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const { settings, overview, meta, initialLoading, setSettingsSlice, refreshOverview } =
    useDashboard();

  const [enabled, setEnabled] = useState(false);
  const [channelId, setChannelId] = useState<string | null>(null);
  const [events, setEvents] = useState<AdminLogEvents>(DEFAULT_EVENTS);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  const syncFromSettings = useCallback(() => {
    if (!settings) return;
    setEnabled(Boolean(settings.adminLog.enabled));
    setChannelId(settings.adminLog.channelId ?? null);
    setEvents({ ...DEFAULT_EVENTS, ...(settings.adminLog.events || {}) });
    setDirty(false);
  }, [settings]);

  useEffect(() => {
    syncFromSettings();
  }, [syncFromSettings]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const res = await settingsApi.saveAdminLog({ enabled, channelId, events });
      setSettingsSlice('adminLog', res.adminLog);
      setDirty(false);
      await refreshOverview();
      showToast(t('adminlog.savedToast'));
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setSaving(false);
    }
  }, [enabled, channelId, events, setSettingsSlice, refreshOverview, showToast, t]);

  useDirtyForm(dirty, handleSave, syncFromSettings);

  const handleTest = async () => {
    setTesting(true);
    try {
      await settingsApi.testAdminLog();
      showToast(t('adminlog.testSent'));
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setTesting(false);
    }
  };

  if (initialLoading || !settings) return <SkeletonCard rows={5} />;

  const hasAudit = Boolean(overview?.viewAuditLogGranted);

  const eventRows: Array<{ key: keyof AdminLogEvents; labelKey: string; icon: ReactNode }> = [
    { key: 'memberJoin', labelKey: 'adminlog.ev.memberJoin', icon: <UserPlus className="w-4 h-4 text-emerald-400 shrink-0" /> },
    { key: 'memberLeave', labelKey: 'adminlog.ev.memberLeave', icon: <UserMinus className="w-4 h-4 text-amber-400 shrink-0" /> },
    { key: 'bans', labelKey: 'adminlog.ev.bans', icon: <Ban className="w-4 h-4 text-red-400 shrink-0" /> },
    { key: 'timeouts', labelKey: 'adminlog.ev.timeouts', icon: <VolumeX className="w-4 h-4 text-orange-400 shrink-0" /> },
    { key: 'warnings', labelKey: 'adminlog.ev.warnings', icon: <AlertTriangle className="w-4 h-4 text-amber-300 shrink-0" /> },
    { key: 'channelActions', labelKey: 'adminlog.ev.channelActions', icon: <Lock className="w-4 h-4 text-indigo-400 shrink-0" /> },
    { key: 'roleChanges', labelKey: 'adminlog.ev.roleChanges', icon: <Tag className="w-4 h-4 text-sky-400 shrink-0" /> },
    { key: 'voiceActivity', labelKey: 'adminlog.ev.voiceActivity', icon: <Mic className="w-4 h-4 text-brand shrink-0" /> },
  ];

  return (
    <form
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        void handleSave();
      }}
      className="card p-6 space-y-5"
    >
      <h3 className="text-base font-semibold text-white flex items-center gap-2">
        <ShieldCheck className="w-4 h-4 text-sky-400" />
        <span>Admin Log</span>
      </h3>

      <div className="flex items-center justify-between gap-4 p-4 rounded-xl bg-bg-elevated border border-slate-800">
        <span className="text-sm font-semibold text-white">{t('adminlog.enable')}</span>
        <ToggleSwitch
          checked={enabled}
          onChange={(v) => {
            setEnabled(v);
            setDirty(true);
          }}
        />
      </div>

      {!hasAudit && (
        <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-200 flex items-center gap-2.5">
          <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
          <span>
            {t('adminlog.auditMissingPrefix')}{' '}
            <strong>{t('adminlog.auditMissingBold')}</strong>{' '}
            {t('adminlog.auditMissingSuffix')}
          </span>
        </div>
      )}

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

      <div className="space-y-2.5">
        <label className="text-xs font-medium text-slate-400 block">{t('adminlog.events')}</label>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {eventRows.map((ev) => (
            <div
              key={ev.key}
              className="flex items-center justify-between gap-3 p-3.5 rounded-xl bg-bg-elevated/60 border border-slate-800"
            >
              <div className="text-sm font-medium text-white inline-flex items-center gap-2">
                {ev.icon}
                <span>{t(ev.labelKey)}</span>
              </div>
              <ToggleSwitch
                checked={Boolean(events[ev.key])}
                onChange={(v) => {
                  setEvents((prev) => ({ ...prev, [ev.key]: v }));
                  setDirty(true);
                }}
              />
            </div>
          ))}
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
