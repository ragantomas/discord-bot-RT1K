import { useEffect, useRef } from 'react';
import { useDashboard } from '@/context/DashboardContext';

export function useDirtyForm(isDirty: boolean, onSave: () => Promise<void> | void, onDiscard: () => void): void {
  const { registerDirty, clearDirty } = useDashboard();
  const saveRef = useRef(onSave);
  const discardRef = useRef(onDiscard);

  saveRef.current = onSave;
  discardRef.current = onDiscard;

  useEffect(() => {
    if (isDirty) {
      registerDirty({
        onSave: () => saveRef.current(),
        onDiscard: () => discardRef.current(),
      });
    } else {
      clearDirty();
    }
  }, [isDirty, registerDirty, clearDirty]);

  useEffect(() => {
    return () => clearDirty();
  }, [clearDirty]);
}
