import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { API_LIMITS } from '@/config/constants';

interface RenameRoomModalProps {
  open: boolean;
  currentName: string;
  onClose: () => void;
  onSubmit: (newName: string) => Promise<void>;
}

export function RenameRoomModal({ open, currentName, onClose, onSubmit }: RenameRoomModalProps) {
  const { t } = useTranslation();
  const [name, setName] = useState(currentName);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setName(currentName);
  }, [open, currentName]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const cleaned = name.trim();
    if (!cleaned) return;
    setSaving(true);
    try {
      await onSubmit(cleaned);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      maxWidthClass="max-w-md"
      title={<h3 className="text-lg font-semibold text-white">{t('tempvoice.renameRoom')}</h3>}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-slate-400">{t('tempvoice.newName')}</label>
          <input
            type="text"
            maxLength={API_LIMITS.ROOM_NAME_MAX}
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="input-field"
          />
        </div>
        <div className="flex items-center justify-end gap-3 pt-2">
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" variant="primary" loading={saving}>
            {t('common.rename')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
