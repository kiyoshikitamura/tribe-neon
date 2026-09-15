import React, { useEffect } from "react";
import "./GlobalInteractionBlocker.css";

interface GlobalInteractionBlockerProps {
  isBlocking: boolean;
}

export default function GlobalInteractionBlocker({ isBlocking }: GlobalInteractionBlockerProps) {
  useEffect(() => {
    if (!isBlocking) return;
    const preventKeyboardActivation = (event: KeyboardEvent) => {
      if (["Enter", " ", "Spacebar"].includes(event.key)) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    };
    document.addEventListener("keydown", preventKeyboardActivation, true);
    return () => document.removeEventListener("keydown", preventKeyboardActivation, true);
  }, [isBlocking]);

  if (!isBlocking) return null;

  return <div className="outlaw-interaction-blocker" role="status" aria-live="polite" aria-label="処理中" />;
}
