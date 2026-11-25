import { X } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  headerRight?: ReactNode;
  maxWidthClass?: string;
  children: ReactNode;
}

export function Modal({
  open,
  onClose,
  title,
  headerRight,
  maxWidthClass = 'max-w-lg',
  children,
}: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-8 sm:pt-14 px-4 pb-8 bg-black/75 backdrop-blur-sm overflow-hidden"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`bg-bg-surface border border-slate-700/70 rounded-2xl w-full ${maxWidthClass} shadow-2xl flex flex-col max-h-[calc(100vh-5rem)] overflow-hidden`}
      >
        {(title || headerRight) && (
          <div className="flex items-center justify-between gap-3 px-6 pt-6 pb-4 shrink-0">
            <div className="min-w-0 flex-1">{title}</div>
            <div className="flex items-center gap-2 shrink-0">
              {headerRight}
              <button
                type="button"
                onClick={onClose}
                className="p-2 rounded-xl bg-bg-elevated hover:bg-bg-hover border border-slate-700 text-slate-300 hover:text-white transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
        <div
          className={`flex-1 min-h-0 overflow-y-auto px-6 pb-6 ${
            title || headerRight ? 'pt-1' : 'pt-6'
          }`}
        >
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}
