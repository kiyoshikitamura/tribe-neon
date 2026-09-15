"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { LEGAL_SETTINGS_RETURN_QUERY, LEGAL_SETTINGS_RETURN_VALUE } from "@/utils/legalSettingsReturn";
import "./legal.css";

type LegalPageProps = {
  title: string;
  updatedAt: string;
  children: React.ReactNode;
  returnToGame?: boolean;
};

export default function LegalPage({ title, updatedAt, children, returnToGame = false }: LegalPageProps) {
  const scrollRef = useRef<HTMLElement>(null);
  const [scrollProgress, setScrollProgress] = useState({ top: 0, height: 100 });

  const updateScrollProgress = useCallback(() => {
    const element = scrollRef.current;
    if (!element) return;
    const maxScroll = Math.max(0, element.scrollHeight - element.clientHeight);
    const height = Math.max(12, Math.min(100, (element.clientHeight / element.scrollHeight) * 100));
    const top = maxScroll === 0 ? 0 : (element.scrollTop / maxScroll) * (100 - height);
    setScrollProgress({ top, height });
  }, []);

  useEffect(() => {
    updateScrollProgress();
    const element = scrollRef.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(updateScrollProgress);
    observer.observe(element);
    const card = element.querySelector(".legal-page-card");
    if (card) observer.observe(card);
    return () => observer.disconnect();
  }, [updateScrollProgress]);

  const legalHref = (path: string) => returnToGame ? `${path}?from=settings` : path;
  const closeToGame = () => {
    window.location.replace(`/?${LEGAL_SETTINGS_RETURN_QUERY}=${LEGAL_SETTINGS_RETURN_VALUE}`);
  };

  return (
    <main
      ref={scrollRef}
      className={`legal-page${returnToGame ? " legal-page--from-game" : ""}`}
      onScroll={updateScrollProgress}
    >
      <section className="legal-page-card" aria-labelledby="legal-page-title">
        {!returnToGame && <Link href="/" className="legal-page-back">← タイトルへ戻る</Link>}
        <p className="legal-page-brand">TRIBE NEON</p>
        <h1 id="legal-page-title">{title}</h1>
        <p className="legal-page-updated">制定日：{updatedAt}</p>
        <div className="legal-page-content">{children}</div>
        <nav className="legal-page-nav" aria-label="法的情報">
          <Link href={legalHref("/legal/terms")} replace={returnToGame}>利用規約</Link>
          <Link href={legalHref("/legal/privacy")} replace={returnToGame}>プライバシーポリシー</Link>
          <Link href={legalHref("/legal/tokusho")} replace={returnToGame}>特定商取引法に基づく表記</Link>
        </nav>
        <p className="legal-page-copyright">© 2026 TRIBE NEON</p>
      </section>
      <div className="legal-page-scroll-track" aria-hidden="true">
        <span
          className="legal-page-scroll-thumb"
          style={{ top: `${scrollProgress.top}%`, height: `${scrollProgress.height}%` }}
        />
      </div>
      {returnToGame && (
        <div className="legal-page-close-bar">
          <button type="button" className="legal-page-close active-scale-effect" onClick={closeToGame}>
            閉じる
          </button>
        </div>
      )}
    </main>
  );
}
