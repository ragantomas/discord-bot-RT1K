import {
  Activity,
  AlertTriangle,
  Archive,
  Check,
  Gavel,
  ScrollText,
  Sliders,
  Users,
} from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { backupApi } from '@/api/backup';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { BACKUP_PARTS, type BackupPart } from '@/config/constants';

interface BackupModalProps {
  open: boolean;
  onClose: () => void;
}

const PART_META: Record<
  BackupPart,
  { titleKey: string; descKey: string; icon: ReactNode; accent: string }
> = {
  settings: {
    titleKey: 'backup.parts.settings',
    descKey: 'backup.parts.settingsDesc',
    icon: <Sliders className="w-4 h-4" />,
    accent: 'bg-brand/15 text-brand',
  },
  users: {
    titleKey: 'backup.parts.users',
    descKey: 'backup.parts.usersDesc',
    icon: <Users className="w-4 h-4" />,
    accent: 'bg-sky-500/15 text-sky-300',
  },
  warnings: {
    titleKey: 'backup.parts.warnings',
    descKey: 'backup.parts.warningsDesc',
    icon: <AlertTriangle className="w-4 h-4" />,
    accent: 'bg-amber-500/15 text-amber-300',
  },
  moderation: {
    titleKey: 'backup.parts.moderation',
    descKey: 'backup.parts.moderationDesc',
    icon: <Gavel className="w-4 h-4" />,
    accent: 'bg-red-500/15 text-red-300',
  },
  playerActivity: {
    titleKey: 'backup.parts.playerActivity',
    descKey: 'backup.parts.playerActivityDesc',
    icon: <Activity className="w-4 h-4" />,
    accent: 'bg-emerald-500/15 text-emerald-300',
  },
  activityLog: {
    titleKey: 'backup.parts.activityLog',
    descKey: 'backup.parts.activityLogDesc',
    icon: <ScrollText className="w-4 h-4" />,
    accent: 'bg-violet-500/15 text-violet-300',
  },
};

export function BackupModal({ open, onClose }: BackupModalProps) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<Set<BackupPart>>(() => new Set(BACKUP_PARTS));

  useEffect(() => {
    if (open) {
      setSelected(new Set(BACKUP_PARTS));
    }
  }, [open]);

  const togglePart = (part: BackupPart) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(part)) {
        next.delete(part);
      } else {
        next.add(part);
      }
      return next;
    });
  };

  const handleDownload = () => {
    const chosen = BACKUP_PARTS.filter((p) => selected.has(p));
    if (chosen.length === 0) return;
    window.location.href = backupApi.getDownloadUrl(chosen);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
          <Archive className="w-5 h-5 text-emerald-400" />
          <span>{t('backup.title')}</span>
        </h3>
      }
    >
      <div className="space-y-4">
        <div className="space-y-2">
          {BACKUP_PARTS.map((part) => {
            const meta = PART_META[part];
            const checked = selected.has(part);
            return (
              <button
                key={part}
                type="button"
                role="checkbox"
                aria-checked={checked}
                onClick={() => togglePart(part)}
                className={`w-full text-left flex items-center gap-3 p-3.5 rounded-xl border transition ${
                  checked
                    ? 'bg-brand/10 border-brand/50 hover:bg-brand/15'
                    : 'bg-bg-elevated/60 border-slate-800 hover:bg-bg-hover/60'
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition ${
                    checked
                      ? 'bg-brand border-brand text-white'
                      : 'bg-bg-base border-slate-600 text-transparent'
                  }`}
                >
                  <Check className="w-3.5 h-3.5" />
                </div>

                <div
                  className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${meta.accent}`}
                >
                  {meta.icon}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-white">{t(meta.titleKey)}</div>
                  <div className="text-xs text-slate-400 mt-0.5">{t(meta.descKey)}</div>
                </div>
              </button>
            );
          })}
        </div>

        <div className="flex justify-end pt-1">
          <Button
            variant="primary"
            disabled={selected.size === 0}
            onClick={handleDownload}
            icon={<Archive className="w-4 h-4" />}
          >
            {t('backup.downloadBtn')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
