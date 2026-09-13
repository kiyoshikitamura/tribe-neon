import { useSyncExternalStore } from 'react';

// Canonical dialogs register after commit. Journey prompts wait for the existing
// experience/receipt to close rather than covering it with another dialog.
const dialogs = new Set<symbol>();
const listeners = new Set<() => void>();
export const hasPresentedDialog = () => dialogs.size > 0;
export function registerPresentedDialog() {
  const id = Symbol('dialog');
  dialogs.add(id);
  listeners.forEach(listener => listener());
  return () => { dialogs.delete(id); listeners.forEach(listener => listener()); };
}
export function usePresentedDialog() {
  return useSyncExternalStore(listener => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    hasPresentedDialog, () => false);
}
