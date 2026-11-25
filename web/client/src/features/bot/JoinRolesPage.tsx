import { Save, UserPlus } from 'lucide-react';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { settingsApi } from '@/api/settings';
import { Button } from '@/components/ui/Button';
import { RoleListEditor } from '@/components/ui/DiscordSelects';
import { SkeletonCard } from '@/components/ui/Feedback';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { useDashboard } from '@/context/DashboardContext';
import { useToast } from '@/context/ToastContext';
import { useDirtyForm } from '@/hooks/useDirtyForm';

export function JoinRolesPage() {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const { settings, meta, initialLoading, setSettingsSlice, refreshOverview } = useDashboard();

  const [enabled, setEnabled] = useState(false);
  const [memberRoleIds, setMemberRoleIds] = useState<string[]>([]);
  const [botRoleIds, setBotRoleIds] = useState<string[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  const syncFromSettings = useCallback(() => {
    if (!settings) return;
    setEnabled(Boolean(settings.joinRoles.enabled));
    setMemberRoleIds([...(settings.joinRoles.memberRoleIds || [])]);
    setBotRoleIds([...(settings.joinRoles.botRoleIds || [])]);
    setDirty(false);
  }, [settings]);

  useEffect(() => {
    syncFromSettings();
  }, [syncFromSettings]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const res = await settingsApi.saveJoinRoles({
        enabled,
        memberRoleIds: memberRoleIds.filter(Boolean),
        botRoleIds: botRoleIds.filter(Boolean),
      });
      setSettingsSlice('joinRoles', res.joinRoles);
      setDirty(false);
      await refreshOverview();
      showToast(t('joinroles.savedToast'));
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setSaving(false);
    }
  }, [enabled, memberRoleIds, botRoleIds, setSettingsSlice, refreshOverview, showToast, t]);

  useDirtyForm(dirty, handleSave, syncFromSettings);

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
        <UserPlus className="w-4 h-4 text-emerald-400" />
        <span>{t('nav.joinroles')}</span>
      </h3>

      <div className="flex items-center justify-between gap-4 p-4 rounded-xl bg-bg-elevated border border-slate-800">
        <span className="text-sm font-semibold text-white">{t('joinroles.enable')}</span>
        <ToggleSwitch
          checked={enabled}
          onChange={(v) => {
            setEnabled(v);
            setDirty(true);
          }}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <label className="text-xs font-medium text-slate-400">
            {t('joinroles.memberRoles')}
          </label>
          <RoleListEditor
            roles={meta?.roles ?? []}
            value={memberRoleIds}
            onChange={(next) => {
              setMemberRoleIds(next);
              setDirty(true);
            }}
            onlyEditable
            emptyLabel={t('joinroles.noRoles')}
          />
        </div>

        <div className="space-y-2">
          <label className="text-xs font-medium text-slate-400">{t('joinroles.botRoles')}</label>
          <RoleListEditor
            roles={meta?.roles ?? []}
            value={botRoleIds}
            onChange={(next) => {
              setBotRoleIds(next);
              setDirty(true);
            }}
            onlyEditable
            emptyLabel={t('joinroles.noRoles')}
          />
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
