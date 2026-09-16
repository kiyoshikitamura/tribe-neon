'use client';
import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import CanonicalDialog, { type CanonicalDialogAction } from './CanonicalDialog';
import { hasPresentedDialog, usePresentedDialog } from './dialogPresence';
import TutorialNavigator from '../TutorialNavigator';

/** Beginners' prompts share one presentation and wait for receipts/animations. */
export default function GuideDialog({ title, message, children, actions, onClose, blocked = false }: {
  title: string;
  message: ReactNode;
  children?: ReactNode;
  actions: CanonicalDialogAction[];
  onClose?: () => unknown;
  blocked?: boolean;
}) {
  const presented = usePresentedDialog();
  const [admitted, setAdmitted] = useState(false);
  useEffect(() => {
    if (blocked) { setAdmitted(false); return; }
    // Once admitted, the registered dialog is our own: never hide it because
    // its presence changed. New prompts queue behind already mounted dialogs.
    if (!admitted && !presented && !hasPresentedDialog()) setAdmitted(true);
  }, [admitted, blocked, presented]);
  if (blocked || !admitted) return null;
  return createPortal(<CanonicalDialog title={title} onClose={onClose} actions={actions}>
    <TutorialNavigator message={message} />
    {children}
  </CanonicalDialog>, document.body);
}
