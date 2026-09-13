"use client";

import React, { useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { registerPresentedDialog } from "./dialogPresence";
import OutlawButton from "./OutlawButton";
import "./CanonicalDialog.css";

export type CanonicalDialogAction = {
  label: string;
  onClick: () => unknown;
  semantic?: "primary" | "secondary" | "danger";
  disabled?: boolean;
};

export default function CanonicalDialog({
  title,
  children,
  onClose,
  actions = [],
  size = "standard",
  ariaLabel,
  loading = false,
}: {
  title?: string;
  children: React.ReactNode;
  onClose?: () => unknown;
  actions?: CanonicalDialogAction[];
  size?: "standard" | "large";
  ariaLabel?: string;
  loading?: boolean;
}) {
  const busy = useRef(false);
  const [pending, setPending] = useState(false);
  useLayoutEffect(registerPresentedDialog, []);
  const runAction = (action: () => unknown) => {
    if (busy.current) return;
    busy.current = true;
    let result: unknown;
    try {
      flushSync(() => { setPending(true); result = action(); });
    } catch {
      busy.current = false;
      setPending(false);
      return;
    }
    // The caller owns close/replacement; no timeout and no automatic closing
    // of a newly presented result dialog from the previous action.
    Promise.resolve(result).then(() => {
      busy.current = false;
      setPending(false);
    }, () => {
      busy.current = false;
      setPending(false);
    });
  };
  return <div className="canonical-dialog-overlay" onMouseDown={(event) => {
    if (event.target === event.currentTarget && onClose && !pending) runAction(onClose);
  }}>
    <section className={`canonical-dialog canonical-dialog--${size}`} role="dialog" aria-modal="true" aria-label={ariaLabel || title || "ダイアログ"}>
      <header className="canonical-dialog-header">
        {title ? <h2>{title}</h2> : <span />}
        {onClose && <button type="button" className="canonical-dialog-close" disabled={pending} onClick={() => runAction(onClose)} aria-label="閉じる">×</button>}
      </header>
      <div className={`canonical-dialog-body ${loading ? "is-loading" : ""}`}>{children}</div>
      {actions.length > 0 && <footer className="canonical-dialog-actions">
        {actions.map((action) => <OutlawButton
          key={action.label}
          variant={action.semantic === "danger" ? "danger" : action.semantic === "primary" ? "primary" : "secondary"}
          disabled={action.disabled || pending}
          onClick={() => runAction(action.onClick)}
        >{action.label}</OutlawButton>)}
      </footer>}
    </section>
  </div>;
}
