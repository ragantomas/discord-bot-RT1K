import { Archive, Sliders, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { backupApi } from '@/api/backup';
import { Modal } from '@/components/ui/Modal';

interface BackupModalProps {
  open: boolean;
  onClose: () => void;
}

export function BackupModal({ open, onClose }: BackupModalProps) {
  const { t } = useTranslation();

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
      <div className="space-y-2.5">
        <a
          href={backupApi.getDownloadUrl('all')}
          onClick={onClose}
          className="flex items-start gap-3 p-4 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/35 transition"
        >
          <div className="w-9 h-9 rounded-lg bg-emerald-500/20 text-emerald-300 flex items-center justify-center shrink-0 mt-0.5">
            <Archive className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-white">{t('backup.full')}</div>
            <div className="text-xs text-slate-300 mt-0.5">{t('backup.fullDesc')}</div>
          </div>
        </a>

        <a
          href={backupApi.getDownloadUrl('settings')}
          onClick={onClose}
          className="flex items-start gap-3 p-4 rounded-xl bg-bg-elevated hover:bg-bg-hover border border-slate-700/80 transition"
        >
          <div className="w-9 h-9 rounded-lg bg-brand/15 text-brand flex items-center justify-center shrink-0 mt-0.5">
            <Sliders className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-white">{t('backup.settings')}</div>
            <div className="text-xs text-slate-400 mt-0.5">{t('backup.settingsDesc')}</div>
          </div>
        </a>

        <a
          href={backupApi.getDownloadUrl('users')}
          onClick={onClose}
          className="flex items-start gap-3 p-4 rounded-xl bg-bg-elevated hover:bg-bg-hover border border-slate-700/80 transition"
        >
          <div className="w-9 h-9 rounded-lg bg-sky-500/15 text-sky-300 flex items-center justify-center shrink-0 mt-0.5">
            <Users className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-white">{t('backup.players')}</div>
            <div className="text-xs text-slate-400 mt-0.5">{t('backup.playersDesc')}</div>
          </div>
        </a>
      </div>
    </Modal>
  );
}
