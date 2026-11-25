import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useConfirm } from '@/context/ConfirmContext';
import { useDashboard } from '@/context/DashboardContext';
import { useToast, type ToastVariant } from '@/context/ToastContext';

const TOAST_STYLES: Record<ToastVariant, string> = {
  success: 'bg-emerald-950/95 border-emerald-500/40 text-emerald-100',
  error: 'bg-red-950/95 border-red-500/40 text-red-100',
  warn: 'bg-amber-950/95 border-amber-500/40 text-amber-100',
  info: 'bg-slate-900/95 border-sky-500/40 text-sky-100',
};

function ToastIcon({ variant }: { variant: ToastVariant }) {
  if (variant === 'success') return <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />;
  if (variant === 'error') return <XCircle className="w-4 h-4 text-red-400 shrink-0" />;
  if (variant === 'warn') return <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />;
  return <Info className="w-4 h-4 text-sky-400 shrink-0" />;
}

export function ToastStack() {
  const { toasts, dismissToast } = useToast();
  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none px-4 sm:px-0">
      {toasts.map((item) => (
        <div
          key={item.id}
          className={`toast-enter pointer-events-auto flex items-start gap-2.5 px-4 py-3 rounded-xl border shadow-2xl backdrop-blur text-sm ${TOAST_STYLES[item.variant]}`}
        >
          <div className="mt-0.5">
            <ToastIcon variant={item.variant} />
          </div>
          <span className="flex-1 break-words">{item.message}</span>
          <button
            type="button"
            onClick={() => dismissToast(item.id)}
            className="text-slate-400 hover:text-white transition shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  );
}

export function ConfirmDialog() {
  const { state, resolveConfirm } = useConfirm();
  const { t } = useTranslation();

  if (!state?.open) return null;

  const isDanger = state.danger !== false;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) resolveConfirm(false);
      }}
    >
      <div className="bg-bg-surface border border-slate-700/70 rounded-2xl max-w-md w-full p-6 shadow-2xl">
        <div className="flex items-start gap-3">
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
              isDanger ? 'bg-red-500/15 text-red-400' : 'bg-brand/15 text-brand'
            }`}
          >
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-semibold text-white">{state.title}</h3>
            <p className="text-sm text-slate-300 mt-1">{state.message}</p>
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 mt-6">
          <button
            type="button"
            onClick={() => resolveConfirm(false)}
            className="px-4 py-2 rounded-xl text-sm font-medium bg-bg-elevated hover:bg-bg-hover text-slate-200 border border-slate-700 transition"
          >
            {state.cancelLabel ?? t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={() => resolveConfirm(true)}
            className={`px-4 py-2 rounded-xl text-sm font-medium text-white transition ${
              isDanger ? 'bg-red-600 hover:bg-red-500' : 'bg-brand hover:bg-brand-hover'
            }`}
          >
            {state.confirmLabel ?? t('common.confirm')}
          </button>
        </div>
      </div>
    </div>
  );
}

export function UnsavedBanner() {
  const { isDirty, triggerDirtySave, triggerDirtyDiscard } = useDashboard();
  const { t } = useTranslation();
  const [saving, setSaving] = useState(false);

  if (!isDirty) return null;

  const handleSave = async () => {
    setSaving(true);
    try {
      await triggerDirtySave();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed bottom-5 right-5 z-40 bg-bg-surface/95 backdrop-blur border border-amber-500/45 shadow-2xl rounded-2xl px-4 py-3 flex items-center gap-3">
      <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse shrink-0" />
      <span className="text-sm text-amber-100 font-medium">{t('common.unsavedChanges')}</span>
      <button
        type="button"
        onClick={triggerDirtyDiscard}
        disabled={saving}
        className="px-3 py-1.5 rounded-xl bg-bg-elevated hover:bg-bg-hover border border-slate-700 text-slate-200 text-xs font-medium transition disabled:opacity-50"
      >
        {t('common.discard')}
      </button>
      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="px-3.5 py-1.5 rounded-xl bg-brand hover:bg-brand-hover text-white text-xs font-semibold transition disabled:opacity-50"
      >
        {saving ? t('common.saving') : t('common.save')}
      </button>
    </div>
  );
}

export function SkeletonCard({ rows = 4 }: { rows?: number }) {
  return (
    <div className="card p-6 space-y-4 animate-pulse">
      <div className="h-5 w-44 rounded-lg bg-bg-elevated" />
      <div className="space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="h-11 w-full rounded-xl bg-bg-elevated/80" />
        ))}
      </div>
    </div>
  );
}

export function EmptyState({ icon, message }: { icon?: ReactNode; message: string }) {
  return (
    <div className="py-10 px-4 text-center text-sm text-slate-400 flex flex-col items-center gap-2">
      {icon && <div className="text-slate-500">{icon}</div>}
      <span>{message}</span>
    </div>
  );
}
