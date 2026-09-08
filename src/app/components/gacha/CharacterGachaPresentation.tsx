"use client";

import React, { useEffect, useRef, useState, useSyncExternalStore } from "react";
import CharacterPresentation from "../character/CharacterPresentation";
import OutlawButton from "../ui/OutlawButton";
import { CHARACTERS_MASTER } from "@/utils/game_constants";
import { getCharacterLocationBackground } from "@/utils/characterVisualAssets";
import { resolveCharacterGachaQuote } from "@/domain/presentation/characterGachaQuotes";
import "./CharacterGachaPresentation.css";

export type CharacterGachaResult = {
  type: string; characterId: string; name: string; rarity: string; imageUrl: string;
  attributeKey?: string; attribute?: string; role?: string;
  hp?: number; atk?: number; def?: number; convertReward?: string; awakeningLevel?: number;
};
type Props = {
  results: CharacterGachaResult[];
  tutorial: boolean;
  onReveal: () => void;
  onClose: () => void;
  playSound: (sound: "GACHA_REVEAL" | "GACHA_SR" | "GACHA_SSR") => void;
};
type Stage = "OPENING" | "BURST" | "QUOTE" | "REVEAL" | "SETTLED" | "SUMMARY";
const motionQuery = "(prefers-reduced-motion: reduce)";
const subscribeMotion = (notify: () => void) => {
  const media = window.matchMedia(motionQuery);
  media.addEventListener("change", notify);
  return () => media.removeEventListener("change", notify);
};
const rank: Record<string, number> = { N: 0, R: 1, SR: 2, SSR: 3 };
const town = (result: CharacterGachaResult) => getCharacterLocationBackground(CHARACTERS_MASTER.find((entry) => entry.id === result.characterId)?.homeTown);
const outcome = (result: CharacterGachaResult) => result.convertReward === "新規獲得" ? "NEW" : result.convertReward || "獲得";
const number = (value: number | undefined) => typeof value === "number" && Number.isFinite(value) ? value.toLocaleString("ja-JP") : "—";

/** 確定済み結果だけを表示する。抽選・所持更新・チュートリアル進行は呼び出し元の責務。 */
export default function CharacterGachaPresentation({ results, tutorial, onReveal, onClose, playSound }: Props) {
  const [stage, setStage] = useState<Stage>("OPENING");
  const [index, setIndex] = useState(0);
  const [reviewing, setReviewing] = useState(false);
  const [letters, setLetters] = useState(0);
  const reducedMotion = useSyncExternalStore(subscribeMotion, () => window.matchMedia(motionQuery).matches, () => false);
  const shell = useRef<HTMLDivElement>(null);
  const lastTap = useRef(Number.NEGATIVE_INFINITY);
  const announced = useRef(false);
  const callbacks = useRef({ onReveal, onClose, playSound });
  useEffect(() => { callbacks.current = { onReveal, onClose, playSound }; }, [onReveal, onClose, playSound]);
  const current = results[index];
  const rarity = current?.rarity.toUpperCase() || "N";
  const quote = current ? resolveCharacterGachaQuote(current.characterId) || "" : "";
  const highest = results.reduce((best, result) => (rank[result.rarity.toUpperCase()] ?? 0) > (rank[best] ?? 0) ? result.rarity.toUpperCase() : best, "N");

  useEffect(() => {
    const originalFocus = document.activeElement as HTMLElement | null;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    shell.current?.focus();
    return () => { document.body.style.overflow = originalOverflow; originalFocus?.focus(); };
  }, []);

  useEffect(() => { shell.current?.focus({ preventScroll: true }); }, [stage]);
  useEffect(() => { if (shell.current) shell.current.scrollTop = 0; }, [index, reviewing]);

  useEffect(() => {
    if (stage !== "BURST") return;
    const timer = window.setTimeout(() => {
      setLetters(0);
      setStage(rarity === "SSR" && quote ? "QUOTE" : "REVEAL");
    }, reducedMotion ? 0 : 620);
    return () => window.clearTimeout(timer);
  }, [stage, rarity, quote, reducedMotion]);

  useEffect(() => {
    if (stage !== "QUOTE") return;
    if (reducedMotion || letters >= quote.length) {
      const timer = window.setTimeout(() => setStage("REVEAL"), reducedMotion ? 0 : 600);
      return () => window.clearTimeout(timer);
    }
    const timer = window.setTimeout(() => setLetters((length) => length + 1), 38);
    return () => window.clearTimeout(timer);
  }, [stage, letters, quote, reducedMotion]);

  useEffect(() => {
    if (stage !== "REVEAL") return;
    callbacks.current.playSound(rarity === "SSR" ? "GACHA_SSR" : rarity === "SR" ? "GACHA_SR" : "GACHA_REVEAL");
    const timer = window.setTimeout(() => setStage("SETTLED"), reducedMotion ? 0 : rarity === "SSR" ? 1050 : rarity === "SR" ? 750 : 450);
    return () => window.clearTimeout(timer);
  }, [stage, rarity, index, reducedMotion]);

  const announce = () => {
    if (!announced.current) { announced.current = true; callbacks.current.onReveal(); }
  };
  const skip = () => { announce(); setReviewing(false); setStage("SUMMARY"); };
  const tap = () => {
    // 同じタップの二重配送・ダブルタップでカードを飛ばさない。
    const now = performance.now();
    if (now - lastTap.current < 220) return;
    lastTap.current = now;
    if (stage === "OPENING") { announce(); setStage("BURST"); }
    else if (stage === "QUOTE") { if (letters < quote.length) setLetters(quote.length); else setStage("REVEAL"); }
    else if (stage === "REVEAL") setStage("SETTLED");
    else if (stage === "SETTLED") {
      if (reviewing || index + 1 >= results.length) { setReviewing(false); setStage("SUMMARY"); }
      else { const next = results[index + 1]; setIndex(index + 1); setLetters(0); setStage(next.rarity.toUpperCase() === "SSR" && resolveCharacterGachaQuote(next.characterId) ? "QUOTE" : "REVEAL"); }
    }
  };
  const showDetail = (nextIndex: number) => { setIndex(nextIndex); setReviewing(true); setStage("SETTLED"); };
  const opening = stage === "OPENING" || stage === "BURST";

  return <div className="cg-overlay" data-gacha-transition-state={opening ? "ready" : "show_results"}>
    <div ref={shell} tabIndex={-1} role="dialog" aria-modal="true" aria-label="ガチャ結果" className={`cg-shell cg-${opening ? highest.toLowerCase() : rarity.toLowerCase()} cg-stage-${stage.toLowerCase()}`} data-gacha-presentation="v3" data-stage={stage} onKeyDown={(event) => {
      if (event.key === "Escape" && !opening) { event.preventDefault(); skip(); }
      if (event.key !== "Tab") return;
      const buttons = Array.from(shell.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") || []);
      const first = buttons[0], last = buttons[buttons.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === shell.current)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === shell.current)) { event.preventDefault(); first?.focus(); }
    }}>
      <div className="cg-city" aria-hidden="true" style={{ backgroundImage: `url('${opening || stage === "SUMMARY" || stage === "QUOTE" ? "/bg/bg_street_shibuya.jpg" : town(current)}')` }} />
      <div className="cg-atmosphere" aria-hidden="true" />
      {stage !== "SUMMARY" && <header className="cg-top"><span>{opening ? `${results.length}連ガチャ` : `${index + 1} / ${results.length}`}</span><button type="button" onClick={skip}>{reviewing ? "一覧へ戻る" : "SKIP"}</button></header>}
      {opening ? <button type="button" className="cg-opening" onClick={tap} disabled={stage === "BURST"} aria-label="ガチャ結果を開く">
        <img className="cg-logo" src="/branding/tribe-neon-logo.png" alt="TRIBE NEON" />
        <div className="cg-fan" aria-hidden="true">{results.map((_, i) => <div className="cg-card-back" key={i} style={{ "--fan-angle": `${(i - (results.length - 1) / 2) * (results.length === 1 ? 0 : 6)}deg`, "--fan-offset": `${(i - (results.length - 1) / 2) * 12}px`, "--fan-delay": `${i * 24}ms` } as React.CSSProperties}><div><img src="/branding/tribe-neon-logo.png" alt="" /><span>TRIBE NEON</span></div></div>)}</div>
        <div className="cg-opening-copy"><strong>TAP TO OPEN</strong><small>タップして仲間を迎える</small></div>
      </button> : stage === "SUMMARY" ? <section className="cg-summary">
        <header><small>TRIBE NEON</small><h2>ガチャ結果</h2><p>{tutorial ? "この仲間たちでチームを組もう" : `${results.length}人の獲得結果`}</p></header>
        <div className={`cg-grid ${results.length === 1 ? "cg-single" : ""}`}>
          {results.map((result, i) => <button type="button" key={`${result.characterId}-${i}`} onClick={() => showDetail(i)} className={`cg-mini cg-${result.rarity.toLowerCase()}`} data-result-index={i} data-character-id={result.characterId} aria-label={`${result.rarity} ${result.name} ${outcome(result)} 詳細を見る`}>
            <CharacterPresentation src={result.imageUrl} alt={result.name} variant="gacha-result-compact" rarity={result.rarity} backgroundSrc={town(result)} frameKind={false} metadata={false} />
            <b className="cg-mini-rarity">{result.rarity}</b><span className="cg-mini-name">{result.name}</span><small className={outcome(result) === "NEW" ? "cg-new" : ""}>{outcome(result)}</small>
          </button>)}
        </div>
        <p className="cg-summary-hint">カードをタップして詳細を見る</p>
        <OutlawButton variant="primary" className="cg-continue" onClick={() => callbacks.current.onClose()}>{tutorial ? "編成へ進む" : "ガチャへ戻る"}</OutlawButton>
      </section> : <button type="button" className={`cg-reveal ${stage === "SETTLED" ? "is-settled" : ""}`} onClick={tap} aria-label={stage === "QUOTE" ? "セリフを表示して登場演出へ" : `${current.name} ${reviewing ? "一覧へ戻る" : "タップして次へ"}`} data-character-id={stage === "QUOTE" ? undefined : current.characterId} data-presentation-state={stage === "QUOTE" ? "SSR_QUOTE" : `${rarity}_REVEAL`}>
        {stage === "QUOTE" ? <div className="cg-quote-intro"><span aria-hidden="true">SSR</span><blockquote aria-label={quote}><span aria-hidden="true">{quote.slice(0, reducedMotion ? quote.length : letters)}</span></blockquote><small>{letters < quote.length ? "タップで全文表示" : "TAP"}</small></div> : <div className="cg-reveal-content" key={index}>
          <div className="cg-portrait"><CharacterPresentation src={current.imageUrl} alt={current.name} variant="reveal" rarity={rarity} attribute={current.attributeKey} backgroundSrc={town(current)} frameKind={false} metadata={false} /><i className="cg-metal-glint" aria-hidden="true" /></div>
          <div className="cg-reveal-copy"><div className="cg-rarity-line"><b>{rarity}</b><span className={outcome(current) === "NEW" ? "cg-new" : ""}>{outcome(current)}</span></div>
            <h2>{current.name}</h2><p className="cg-origin">{[current.role, current.attribute].filter(Boolean).join(" / ")}</p>
            {quote && <blockquote>{quote}</blockquote>}
            <dl className="cg-stats" aria-label="初期パラメータ">{(["hp", "atk", "def"] as const).map((key) => <div key={key}><dt>{key.toUpperCase()}</dt><dd>{number(current[key])}</dd></div>)}</dl>
            <small className="cg-tap-hint">{reviewing ? "タップして一覧へ戻る" : stage === "REVEAL" ? "タップで表示を完了" : "タップして次へ"}</small>
          </div>
        </div>}
      </button>}
    </div>
  </div>;
}
