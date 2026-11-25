import { Save, Send, Shield, Ticket, XCircle } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { ticketsApi } from '@/api/tickets';
import { Button } from '@/components/ui/Button';
import { CategorySelect, RoleListEditor, TextChannelSelect } from '@/components/ui/DiscordSelects';
import { EmptyState, SkeletonCard } from '@/components/ui/Feedback';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { useConfirm } from '@/context/ConfirmContext';
import { useDashboard } from '@/context/DashboardContext';
import { useToast } from '@/context/ToastContext';
import { useDirtyForm } from '@/hooks/useDirtyForm';
import { getAppLanguage } from '@/i18n';
import type { OpenTicket } from '@/types/api';
import { formatDateTime } from '@/utils/format';

export function TicketsPage() {
  const { t } = useTranslation();
  const lang = getAppLanguage();
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const {
    settings,
    meta,
    openTickets,
    initialLoading,
    setSettingsSlice,
    refreshOpenTickets,
    refreshOverview,
  } = useDashboard();

  const [enabled, setEnabled] = useState(() => Boolean(settings?.tickets.enabled));
  const [categoryId, setCategoryId] = useState<string | null>(
    () => settings?.tickets.categoryId ?? null,
  );
  const [logChannelId, setLogChannelId] = useState<string | null>(
    () => settings?.tickets.logChannelId ?? null,
  );
  const [panelChannelId, setPanelChannelId] = useState<string | null>(
    () => settings?.tickets.panelChannelId ?? null,
  );
  const [supportRoleIds, setSupportRoleIds] = useState<string[]>(() => [
    ...(settings?.tickets.supportRoleIds || []),
  ]);
  const [panelTitle, setPanelTitle] = useState(() => settings?.tickets.panelTitle || '');
  const [panelDescription, setPanelDescription] = useState(
    () => settings?.tickets.panelDescription || '',
  );
  const [panelColor, setPanelColor] = useState(() => settings?.tickets.panelColor || '#5865F2');
  const [panelButtonLabel, setPanelButtonLabel] = useState(
    () => settings?.tickets.panelButtonLabel || '',
  );
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sendingPanel, setSendingPanel] = useState(false);
  const syncedSettingsRef = useRef(settings);

  const syncFromSettings = useCallback(() => {
    if (!settings) return;
    const tk = settings.tickets;
    setEnabled(Boolean(tk.enabled));
    setCategoryId(tk.categoryId ?? null);
    setLogChannelId(tk.logChannelId ?? null);
    setPanelChannelId(tk.panelChannelId ?? null);
    setSupportRoleIds([...(tk.supportRoleIds || [])]);
    setPanelTitle(tk.panelTitle || '');
    setPanelDescription(tk.panelDescription || '');
    setPanelColor(tk.panelColor || '#5865F2');
    setPanelButtonLabel(tk.panelButtonLabel || '');
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
      const res = await ticketsApi.saveSettings({
        enabled,
        categoryId,
        logChannelId,
        panelChannelId,
        supportRoleIds: supportRoleIds.filter(Boolean),
        panelTitle,
        panelDescription,
        panelColor,
        panelButtonLabel,
      });
      setSettingsSlice('tickets', res.tickets);
      setDirty(false);
      await refreshOverview();
      showToast(t('tickets.savedToast'));
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setSaving(false);
    }
  }, [
    enabled,
    categoryId,
    logChannelId,
    panelChannelId,
    supportRoleIds,
    panelTitle,
    panelDescription,
    panelColor,
    panelButtonLabel,
    setSettingsSlice,
    refreshOverview,
    showToast,
    t,
  ]);

  useDirtyForm(dirty, handleSave, syncFromSettings);

  const handleSendPanel = async () => {
    setSendingPanel(true);
    try {
      const res = await ticketsApi.sendPanel();
      setSettingsSlice('tickets', res.tickets);
      showToast(t('tickets.panelSentToast'));
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setSendingPanel(false);
    }
  };

  const handleCloseTicket = async (ticket: OpenTicket) => {
    const ok = await confirm({
      title: t('tickets.closeTitle', { number: ticket.number }),
      message: t('tickets.closeMessage'),
      confirmLabel: t('tickets.closeTicket'),
    });
    if (!ok) return;

    try {
      await ticketsApi.close(ticket.channelId);
      showToast(t('tickets.closedToast', { number: ticket.number }));
      await Promise.all([refreshOpenTickets(), refreshOverview()]);
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), 'error');
    }
  };

  if (initialLoading || !settings) return <SkeletonCard rows={6} />;

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
          <Ticket className="w-4 h-4 text-violet-400" />
          <span>{t('nav.tickets')}</span>
        </h3>

        <div className="flex items-center justify-between gap-4 p-4 rounded-xl bg-bg-elevated border border-slate-800">
          <span className="text-sm font-semibold text-white">{t('tickets.enable')}</span>
          <ToggleSwitch
            checked={enabled}
            onChange={(v) => {
              setEnabled(v);
              setDirty(true);
            }}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-400">{t('common.category')}</label>
            <CategorySelect
              categories={meta?.categories ?? []}
              value={categoryId}
              onChange={(val) => {
                setCategoryId(val);
                setDirty(true);
              }}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-400">
              {t('tickets.transcriptChannel')}
            </label>
            <TextChannelSelect
              channels={meta?.textChannels ?? []}
              value={logChannelId}
              onChange={(val) => {
                setLogChannelId(val);
                setDirty(true);
              }}
              noneLabel={t('common.none')}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-400">
              {t('tickets.panelChannel')}
            </label>
            <TextChannelSelect
              channels={meta?.textChannels ?? []}
              value={panelChannelId}
              onChange={(val) => {
                setPanelChannelId(val);
                setDirty(true);
              }}
            />
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-bg-elevated/60 border border-slate-800 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-white">
            <Shield className="w-4 h-4 text-sky-400" />
            <span>{t('tickets.supportRoles')}</span>
          </div>
          <RoleListEditor
            roles={meta?.roles ?? []}
            value={supportRoleIds}
            onChange={(next) => {
              setSupportRoleIds(next);
              setDirty(true);
            }}
          />
        </div>

        <div className="p-4 rounded-2xl bg-bg-elevated/60 border border-slate-800 space-y-4">
          <div className="text-sm font-semibold text-white">{t('tickets.panelConfig')}</div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="md:col-span-3 space-y-1.5">
              <label className="text-xs font-medium text-slate-400">{t('common.title')}</label>
              <input
                type="text"
                value={panelTitle}
                onChange={(e) => {
                  setPanelTitle(e.target.value);
                  setDirty(true);
                }}
                className="input-field"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-400">{t('common.color')}</label>
              <input
                type="color"
                value={panelColor}
                onChange={(e) => {
                  setPanelColor(e.target.value);
                  setDirty(true);
                }}
                className="input-field h-[42px] p-1 cursor-pointer"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-400">{t('common.description')}</label>
            <textarea
              rows={3}
              value={panelDescription}
              onChange={(e) => {
                setPanelDescription(e.target.value);
                setDirty(true);
              }}
              className="input-field"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-400">{t('tickets.buttonLabel')}</label>
            <input
              type="text"
              maxLength={80}
              value={panelButtonLabel}
              onChange={(e) => {
                setPanelButtonLabel(e.target.value);
                setDirty(true);
              }}
              className="input-field"
            />
          </div>
        </div>

        <div className="flex items-center justify-between flex-wrap gap-3 pt-2">
          <Button
            variant="secondary"
            loading={sendingPanel}
            loadingText={t('common.sending')}
            onClick={() => void handleSendPanel()}
            icon={<Send className="w-4 h-4" />}
          >
            {settings.tickets.panelMessageId ? t('tickets.updatePanel') : t('tickets.sendPanel')}
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

      {/* Open tickets */}
      <div className="card p-6 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-base font-semibold text-white">
            {t('tickets.openTickets')} ({openTickets.length})
          </h3>
        </div>

        {openTickets.length === 0 ? (
          <EmptyState message={t('tickets.noOpenTickets')} />
        ) : (
          <div className="space-y-3">
            {openTickets.map((tk) => (
              <div
                key={tk.channelId}
                className="p-4 rounded-xl bg-bg-elevated/60 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <img
                    src={tk.userAvatar}
                    alt={tk.userName}
                    className="w-9 h-9 rounded-full object-cover shrink-0"
                  />
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-white truncate">
                      #{tk.number} · #{tk.channelName}
                    </div>
                    <div className="text-xs text-slate-400 truncate">
                      {tk.userName} · {tk.subject} ·{' '}
                      {tk.claimedByName
                        ? t('tickets.claimedBy', { name: tk.claimedByName })
                        : t('tickets.unclaimed')}{' '}
                      · {formatDateTime(tk.createdAt, lang)}
                    </div>
                  </div>
                </div>

                <Button
                  size="sm"
                  variant="danger"
                  onClick={() => void handleCloseTicket(tk)}
                  icon={<XCircle className="w-3.5 h-3.5" />}
                >
                  {t('tickets.closeTicket')}
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
