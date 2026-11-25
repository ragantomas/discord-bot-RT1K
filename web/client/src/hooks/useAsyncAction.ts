import { useCallback, useState } from 'react';
import { useToast } from '@/context/ToastContext';

export function useAsyncAction() {
  const [busy, setBusy] = useState(false);
  const { showToast } = useToast();

  const run = useCallback(
    async <T,>(fn: () => Promise<T>, onSuccessMessage?: string): Promise<T | null> => {
      if (busy) return null;
      setBusy(true);
      try {
        const result = await fn();
        if (onSuccessMessage) {
          showToast(onSuccessMessage, 'success');
        }
        return result;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        showToast(msg, 'error');
        return null;
      } finally {
        setBusy(false);
      }
    },
    [busy, showToast],
  );

  return { busy, run };
}
