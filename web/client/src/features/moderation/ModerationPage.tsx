import {
  AlertTriangle,
  Ban,
  Eraser,
  Gavel,
  Lock,
  Plus,
  RefreshCw,
  Save,
  Timer,
  Trash2,
  UserCheck,
  UserX,
  VolumeX,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { moderationApi } from '@/api/moderation';
import { Button } from '@/components/ui/Button';
import { RoleListEditor } from '@/components/ui/DiscordSelects';
import { DurationUnitInput } from '@/components/ui/DurationUnitInput';
import { EmptyState, SkeletonCard } from '@/components/ui/Feedback';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { API_LIMITS, ESCALATION_ACTIONS } from '@/config/constants';
import { useConfirm } from '@/context/ConfirmContext';
import { useDashboard } from '@/context/DashboardContext';
import { useToast } from '@/context/ToastContext';
import { useDirtyForm } from '@/hooks/useDirtyForm';
import { getAppLanguage } from '@/i18n';
import type { AutoEscalationRule, BanEntry, EscalationAction, ModerationCase, ModerationCommandsConfig } from '@/types/api';
import { formatDateTime } from '@/utils/format';

const DEFAULT_COMMANDS: ModerationCommandsConfig = {
  warn: true,
  timeout: true,
  kick: true,
  ban: true,
  clear: true,
  lock: true,
  slowmode: true,
};

export function ModerationPage() {
  const { t } = useTranslation();
  const lang = getAppLanguage();
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const {
    settings,
    meta,
    bans,
    initialLoading,
    setSettingsSlice,
    refreshBans,
    refreshOverview,
  } = useDashboard();

  const [enabled, setEnabled] = useState(() => Boolean(settings?.moderation.enabled));
  const [adminRoleIds, setAdminRoleIds] = useState<string[]>(() => [
    ...(settings?.moderation.adminRoleIds || []),
  ]);
  const [dmUser, setDmUser] = useState(() => settings?.moderation.dmUser !== false);
  const [commands, setCommands] = useState<ModerationCommandsConfig>(() => ({
    ...DEFAULT_COMMANDS,
    ...(settings?.moderation.commands || {}),
  }));
  const [aeEnabled, setAeEnabled] = useState(() =>
    Boolean(settings?.moderation.autoEscalation?.enabled),
  );
  const [rules, setRules] = useState<AutoEscalationRule[]>(() =>
    (settings?.moderation.autoEscalation?.rules || []).map((r) => ({ ...r })),
  );
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [refreshingBans, setRefreshingBans] = useState(false);
  const [cases, setCases] = useState<ModerationCase[]>([]);
  const [refreshingCases, setRefreshingCases] = useState(false);
  const syncedSettingsRef = useRef(settings);

  const loadCases = useCallback(async () => {
    setRefreshingCases(true);
    try {
      const res = await moderationApi.listCases(50);
      setCases(res.cases || []);
    } catch {
      // Ignore transient errors loading cases list
    } finally {
      setRefreshingCases(false);
    }
  }, []);

  useEffect(() => {
    void loadCases();
  }, [loadCases]);

  const syncFromSettings = useCallback(() => {
    if (!settings) return;
    const mod = settings.moderation;
    setEnabled(Boolean(mod.enabled));
    setAdminRoleIds([...(mod.adminRoleIds || [])]);
    setDmUser(mod.dmUser !== false);
    setCommands({ ...DEFAULT_COMMANDS, ...(mod.commands || {}) });
    setAeEnabled(Boolean(mod.autoEscalation?.enabled));
    setRules((mod.autoEscalation?.rules || []).map((r) => ({ ...r })));
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
      const res = await moderationApi.saveSettings({
        enabled,
        adminRoleIds: adminRoleIds.filter(Boolean),
        dmUser,
        commands,
        autoEscalation: {
          enabled: aeEnabled,
          rules,
        },
      });
      setSettingsSlice('moderation', res.moderation);
      setDirty(false);
      await refreshOverview();
      showToast(t('moderation.savedToast'));
      for (const warn of res.warnings || []) {
        showToast(warn, 'warn');
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setSaving(false);
    }
  }, [
    enabled,
    adminRoleIds,
    dmUser,
    commands,
    aeEnabled,
    rules,
    setSettingsSlice,
    refreshOverview,
    showToast,
    t,
  ]);

  useDirtyForm(dirty, handleSave, syncFromSettings);

  const handleUnban = async (ban: BanEntry) => {
    const ok = await confirm({
      title: t('moderation.unbanTitle'),
      message: t('moderation.unbanMessage', { name: ban.tag }),
      confirmLabel: t('moderation.unban'),
      danger: false,
    });
    if (!ok) return;

    try {
      await moderationApi.unban(ban.userId);
      showToast(t('moderation.unbannedToast', { name: ban.tag }));
      await Promise.all([refreshBans(), loadCases()]);
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), 'error');
    }
  };

  if (initialLoading || !settings) return <SkeletonCard rows={6} />;

  const commandRows: Array<{
    key: keyof ModerationCommandsConfig;
    labelKey: string;
    icon: ReactNode;
  }> = [
    { key: 'warn', labelKey: 'moderation.cmd.warn', icon: <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" /> },
    { key: 'timeout', labelKey: 'moderation.cmd.timeout', icon: <VolumeX className="w-4 h-4 text-orange-400 shrink-0" /> },
    { key: 'kick', labelKey: 'moderation.cmd.kick', icon: <UserX className="w-4 h-4 text-red-400 shrink-0" /> },
    { key: 'ban', labelKey: 'moderation.cmd.ban', icon: <Ban className="w-4 h-4 text-red-500 shrink-0" /> },
    { key: 'clear', labelKey: 'moderation.cmd.clear', icon: <Eraser className="w-4 h-4 text-sky-400 shrink-0" /> },
    { key: 'lock', labelKey: 'moderation.cmd.lock', icon: <Lock className="w-4 h-4 text-amber-300 shrink-0" /> },
    { key: 'slowmode', labelKey: 'moderation.cmd.slowmode', icon: <Timer className="w-4 h-4 text-indigo-400 shrink-0" /> },
  ];

  const updateRule = (idx: number, patch: Partial<AutoEscalationRule>) => {
    setRules((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
    setDirty(true);
  };

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
          <Gavel className="w-4 h-4 text-amber-400" />
          <span>{t('nav.moderation')}</span>
        </h3>

        <div className="flex items-center justify-between gap-4 p-4 rounded-xl bg-bg-elevated border border-slate-800">
          <span className="text-sm font-semibold text-white">{t('moderation.enable')}</span>
          <ToggleSwitch
            checked={enabled}
            onChange={(v) => {
              setEnabled(v);
              setDirty(true);
            }}
          />
        </div>

        <div className="p-4 rounded-2xl bg-bg-elevated/60 border border-slate-800 space-y-3">
          <label className="text-sm font-semibold text-white block">
            {t('moderation.adminRoles')}
          </label>
          <RoleListEditor
            roles={meta?.roles ?? []}
            value={adminRoleIds}
            onChange={(next) => {
              setAdminRoleIds(next);
              setDirty(true);
            }}
          />
          <p className="text-xs text-slate-500">{t('moderation.ownerAlways')}</p>
        </div>

        <div className="space-y-2.5">
          <label className="text-xs font-medium text-slate-400 block">
            {t('moderation.commands')}
          </label>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {commandRows.map((c) => (
              <div
                key={c.key}
                className="flex items-center justify-between gap-3 p-3.5 rounded-xl bg-bg-elevated/60 border border-slate-800"
              >
                <div className="text-sm font-medium text-white inline-flex items-center gap-2">
                  {c.icon}
                  <span>{t(c.labelKey)}</span>
                </div>
                <ToggleSwitch
                  checked={commands[c.key] !== false}
                  onChange={(v) => {
                    setCommands((prev) => ({ ...prev, [c.key]: v }));
                    setDirty(true);
                  }}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-2.5">
          <label className="text-xs font-medium text-slate-400 block">
            {t('moderation.behavior')}
          </label>
          <div className="flex items-center justify-between gap-3 p-3.5 rounded-xl bg-bg-elevated/60 border border-slate-800">
            <span className="text-sm font-medium text-white">{t('moderation.dmUser')}</span>
            <ToggleSwitch
              checked={dmUser}
              onChange={(v) => {
                setDmUser(v);
                setDirty(true);
              }}
            />
          </div>
        </div>

        {/* Auto-escalation */}
        <div className="p-4 rounded-2xl bg-bg-elevated/60 border border-slate-800 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-semibold text-white">
              {t('moderation.autoEscalation')}
            </span>
            <ToggleSwitch
              checked={aeEnabled}
              onChange={(v) => {
                setAeEnabled(v);
                setDirty(true);
              }}
            />
          </div>

          {aeEnabled && (
            <div className="space-y-3">
              {rules.length === 0 ? (
                <p className="text-xs text-slate-400">{t('moderation.noRules')}</p>
              ) : (
                rules.map((rule, idx) => (
                  <div
                    key={idx}
                    className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end p-3 rounded-xl bg-bg-base/60 border border-slate-800"
                  >
                    <div className="sm:col-span-2 space-y-1">
                      <label className="text-[11px] text-slate-400">
                        {t('moderation.warningsCount')}
                      </label>
                      <input
                        type="number"
                        min={API_LIMITS.ESCALATION_MIN_THRESHOLD}
                        max={API_LIMITS.ESCALATION_MAX_THRESHOLD}
                        value={rule.threshold}
                        onChange={(e) => updateRule(idx, { threshold: Number(e.target.value) })}
                        className="input-field"
                      />
                    </div>

                    <div className="sm:col-span-3 space-y-1">
                      <label className="text-[11px] text-slate-400">{t('moderation.action')}</label>
                      <select
                        value={rule.action}
                        onChange={(e) =>
                          updateRule(idx, { action: e.target.value as EscalationAction })
                        }
                        className="input-field"
                      >
                        {ESCALATION_ACTIONS.map((act) => (
                          <option key={act} value={act}>
                            {act === 'timeout' ? 'Timeout' : act === 'kick' ? 'Kick' : 'Ban'}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="sm:col-span-6 space-y-1">
                      {rule.action === 'timeout' && (
                        <>
                          <label className="text-[11px] text-slate-400 block">
                            {t('moderation.duration')}
                          </label>
                          <DurationUnitInput
                            minutes={rule.durationMinutes}
                            onChangeMinutes={(mins) =>
                              updateRule(idx, { durationMinutes: mins })
                            }
                          />
                        </>
                      )}
                    </div>

                    <div className="sm:col-span-1 flex justify-end">
                      <button
                        type="button"
                        onClick={() => {
                          setRules((prev) => prev.filter((_, i) => i !== idx));
                          setDirty(true);
                        }}
                        className="p-2.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-300 transition"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))
              )}

              <Button
                size="sm"
                variant="dashed"
                onClick={() => {
                  const nextThreshold =
                    rules.length > 0 ? Math.max(...rules.map((r) => r.threshold)) + 1 : 3;
                  setRules((prev) => [
                    ...prev,
                    { threshold: nextThreshold, action: 'timeout', durationMinutes: 60 },
                  ]);
                  setDirty(true);
                }}
                icon={<Plus className="w-3.5 h-3.5" />}
              >
                {t('moderation.addRule')}
              </Button>
            </div>
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

      {/* Bans list */}
      <div className="card p-6 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-base font-semibold text-white">
            {t('moderation.bannedUsers', { count: bans.length })}
          </h3>
          <Button
            size="sm"
            variant="secondary"
            loading={refreshingBans}
            onClick={async () => {
              setRefreshingBans(true);
              try {
                await refreshBans();
                showToast(t('moderation.bansRefreshed'));
              } catch (err) {
                showToast(err instanceof Error ? err.message : String(err), 'error');
              } finally {
                setRefreshingBans(false);
              }
            }}
            icon={<RefreshCw className="w-3.5 h-3.5" />}
          >
            {t('common.refresh')}
          </Button>
        </div>

        {bans.length === 0 ? (
          <EmptyState message={t('moderation.noBans')} />
        ) : (
          <div className="space-y-2.5">
            {bans.map((b) => (
              <div
                key={b.userId}
                className="p-3.5 rounded-xl bg-bg-elevated/60 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <img
                    src={b.avatarUrl}
                    alt={b.tag}
                    className="w-8 h-8 rounded-full object-cover shrink-0"
                  />
                  <div className="min-w-0">
                    <div className="flex items-center flex-wrap gap-2">
                      <span className="text-sm font-medium text-white truncate">{b.tag}</span>
                      {b.caseId && (
                        <span className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-[11px] font-mono text-slate-300">
                          #{b.caseId}
                        </span>
                      )}
                      {b.expiresAt && (
                        <span className="px-2 py-0.5 rounded-md bg-amber-500/15 border border-amber-500/30 text-[11px] text-amber-300">
                          {t('moderation.tempBanUntil', { date: formatDateTime(b.expiresAt, lang) })}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-400 truncate mt-0.5">
                      {b.userId}
                      {b.reason ? ` · ${b.reason}` : ''}
                    </div>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => void handleUnban(b)}
                  icon={<UserCheck className="w-3.5 h-3.5 text-emerald-400" />}
                >
                  {t('moderation.unban')}
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Moderation cases */}
      <div className="card p-6 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-base font-semibold text-white">
            {t('moderation.casesTitle', { count: cases.length })}
          </h3>
          <Button
            size="sm"
            variant="secondary"
            loading={refreshingCases}
            onClick={() => void loadCases()}
            icon={<RefreshCw className="w-3.5 h-3.5" />}
          >
            {t('common.refresh')}
          </Button>
        </div>

        {cases.length === 0 ? (
          <EmptyState message={t('moderation.noCases')} />
        ) : (
          <div className="space-y-2">
            {cases.map((c) => {
              const badgeCls =
                c.action === 'ban' || c.action === 'tempban'
                  ? 'bg-red-500/15 border-red-500/30 text-red-300'
                  : c.action === 'kick' || c.action === 'timeout' || c.action === 'warn'
                    ? 'bg-amber-500/15 border-amber-500/30 text-amber-300'
                    : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300';
              return (
                <div
                  key={c.caseId}
                  className="p-3.5 rounded-xl bg-bg-elevated/60 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center flex-wrap gap-2">
                      <span className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-[11px] font-mono text-slate-300">
                        #{c.caseId}
                      </span>
                      <span className={`px-2 py-0.5 rounded-md border text-[11px] font-medium ${badgeCls}`}>
                        {t(`moderation.caseActions.${c.action}`, { defaultValue: c.action })}
                      </span>
                      <span className="text-sm font-medium text-white truncate">{c.userTag}</span>
                      <span className="text-xs text-slate-500">← {c.moderatorTag}</span>
                    </div>
                    <div className="text-xs text-slate-400 truncate">{c.reason}</div>
                  </div>
                  <div className="text-xs text-slate-500 whitespace-nowrap shrink-0">
                    {formatDateTime(c.createdAt, lang)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
