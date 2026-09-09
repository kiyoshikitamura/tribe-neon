"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  text: string;
  className?: string;
  speedMs?: number;
  highlightTerms?: string[];
  onComplete?: () => void;
};

export default function TypewriterText({ text, className = "", speedMs = 34, highlightTerms = [], onComplete }: Props) {
  const [visibleLength, setVisibleLength] = useState(0);
  const onCompleteRef = useRef(onComplete);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion) {
      setVisibleLength(text.length);
      onCompleteRef.current?.();
      return;
    }

    setVisibleLength(0);
    let currentLength = 0;
    const timer = window.setInterval(() => {
      if (currentLength >= text.length) {
        window.clearInterval(timer);
        onCompleteRef.current?.();
        return;
      }
      currentLength += 1;
      setVisibleLength(currentLength);
    }, speedMs);
    return () => window.clearInterval(timer);
  }, [speedMs, text]);

  const visibleText = text.slice(0, visibleLength);
  const escapedTerms = highlightTerms.map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const highlighted = escapedTerms.length === 0
    ? visibleText
    : visibleText.split(new RegExp(`(${escapedTerms.join("|")})`, "g")).map((part, index) => (
      highlightTerms.includes(part) ? <em key={`${part}-${index}`}>{part}</em> : part
    ));

  return (
    <span className={`tutorial-typewriter ${className}`.trim()} aria-label={text}>
      <span aria-hidden="true">{highlighted}</span>
      <span className="tutorial-typewriter-caret" aria-hidden="true" />
    </span>
  );
}
