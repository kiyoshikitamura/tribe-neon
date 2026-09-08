"use client";

import React, { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { useScreenReadiness } from "../../hooks/useScreenReadiness";
import { getCharacterPresentationMetadata } from "../character/characterPresentationMetadata";
import "../character/CharacterPresentation.css";
import OutlawButton from "../ui/OutlawButton";
import { CHARACTERS_MASTER } from "@/utils/game_constants";
import { getCharacterLocationBackground } from "@/utils/characterVisualAssets";
import { resolveCharacterGachaQuote } from "@/domain/presentation/characterGachaQuotes";
import { getRarityBadgeAsset, getAcquisitionBadgeAsset } from "@/utils/rarityAssets";
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

const CITY_GROUPS = [["池袋", "秋葉原", "川崎", "横浜"], ["新宿", "渋谷", "六本木"]];
const CITIES = CITY_GROUPS.flat();
const ARRIVAL_BACKGROUND = getCharacterLocationBackground("渋谷");
const acquisitionBadge = (result: CharacterGachaResult) => getAcquisitionBadgeAsset(result.convertReward === "新規獲得" ? "NEW" : "AWAKENING", result.awakeningLevel);

function ResultBadges({ result }: { result: CharacterGachaResult }) {
  const acquired = acquisitionBadge(result);
  return <span className="cg-existing-badges">
    <img className="cg-rarity-badge" src={getRarityBadgeAsset(result.rarity)} alt={result.rarity} />
    {acquired && <img className="cg-acquisition-badge" src={acquired} alt={result.convertReward === "新規獲得" ? "NEW" : `覚醒 +${result.awakeningLevel}`} />}
  </span>;
}

// 全画面のデコード完了後にのみ描画。子要素ごとの非同期表示を作らない。
function StandingArt({ result, variant = "reveal", background = false }: { result: CharacterGachaResult; variant?: "reveal" | "gacha-result-compact"; background?: boolean }) {
  const framing = getCharacterPresentationMetadata(result.imageUrl);
  return <figure className={`character-presentation character-presentation-${variant} cg-standing`} style={{
    "--character-compact-x": `${framing.compactX}%`,
    "--character-compact-y": `${framing.compactY}%`,
    "--character-compact-scale": framing.compactScale,
  } as React.CSSProperties}>
    <div className="character-presentation-art">
      {background && <img className="character-presentation-background" src={town(result)} alt="" />}
      <img className="character-presentation-character" src={result.imageUrl} alt={result.name} />
    </div>
  </figure>;
}

/** 抽選結果・報酬更新は呼び出し元で確定。再試行は画像取得のみ。 */
export default function CharacterGachaPresentation(props: Props) {
  const [textOnly, setTextOnly] = useState(false);
  const [fontReady, setFontReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const done = () => { if (!cancelled) setFontReady(true); };
    const timer = window.setTimeout(done, 4000);
    void document.fonts.load('20px TNTetsubin', '新宿 TAP').then(done, done);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, []);
  const readiness = useScreenReadiness({ assets: [
    ...CITIES.map((city) => ({ src: getCharacterLocationBackground(city) })),
    ...props.results.flatMap((result) => [{ src: result.imageUrl }, { src: town(result) }, { src: getRarityBadgeAsset(result.rarity) }, ...(acquisitionBadge(result) ? [{ src: acquisitionBadge(result)! }] : [])]),
  ] });
  if (textOnly) return <div className="cg-overlay"><section className="cg-loading" role="dialog" aria-modal="true" aria-label="獲得結果">
    <h2>獲得結果</h2><ol>{props.results.map((result, index) => <li key={index}>{result.rarity} {result.name} / {outcome(result)}</li>)}</ol>
    <OutlawButton onClick={props.onClose}>{props.tutorial ? "編成へ進む" : "ガチャへ戻る"}</OutlawButton>
  </section></div>;
  if (readiness.status !== "ready" || !fontReady) return <div className="cg-overlay"><section className="cg-loading" role="dialog" aria-modal="true" aria-label="ガチャ演出の準備">
    <p role="status">{readiness.status === "error" ? "画像を読み込めませんでした" : "仲間を迎える準備中…"}</p>
    {readiness.status === "error" && <OutlawButton onClick={readiness.retry}>画像を再読み込み</OutlawButton>}
    <button type="button" onClick={() => { props.onReveal(); setTextOnly(true); }}>獲得結果を文字で確認</button>
  </section></div>;
  return <ReadyCharacterGacha {...props} onTextOnly={() => { props.onReveal(); setTextOnly(true); }} />;
}

function ReadyCharacterGacha({ results, tutorial, onReveal, onClose, playSound, onTextOnly }: Props & { onTextOnly: () => void }) {
  const [stage, setStage] = useState<Stage>("OPENING");
  const [introComplete, setIntroComplete] = useState(false);
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

  const sceneKey = stage === "OPENING" || stage === "BURST" ? "opening" : stage === "SUMMARY" ? "summary" : stage === "QUOTE" ? `quote-${index}` : `person-${index}`;
  const [decodedScene, setDecodedScene] = useState("");
  const [failedScene, setFailedScene] = useState("");
  const [imageRetry, setImageRetry] = useState(0);
  const sceneReady = decodedScene === `${sceneKey}-${imageRetry}`;

  // キャッシュの有無に関係なく、実際に表示するDOM画像のデコードまで待つ。
  useLayoutEffect(() => {
    let cancelled = false;
    const key = `${sceneKey}-${imageRetry}`;
    const images = Array.from(shell.current?.querySelectorAll<HTMLImageElement>("img") || []);
    const timer = window.setTimeout(() => { if (!cancelled) setFailedScene(key); }, 12000);
    if (imageRetry) images.forEach((image) => { image.src = image.src; });
    void Promise.all(images.map(async (image) => {
      await image.decode();
      if (!image.naturalWidth) throw new Error("Image unavailable");
    })).then(() => {
      if (!cancelled) { window.clearTimeout(timer); setDecodedScene(key); }
    }).catch(() => { if (!cancelled) { window.clearTimeout(timer); setFailedScene(key); } });
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [sceneKey, imageRetry]);

  useEffect(() => {
    const originalFocus = document.activeElement as HTMLElement | null;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    shell.current?.focus();
    return () => { document.body.style.overflow = originalOverflow; originalFocus?.focus(); };
  }, []);

  useEffect(() => { if (sceneReady) shell.current?.focus({ preventScroll: true }); }, [stage, sceneReady]);
  useEffect(() => { if (shell.current) shell.current.scrollTop = 0; }, [index, reviewing]);

  useEffect(() => {
    if (stage !== "OPENING" || !sceneReady) return;
    const timer = window.setTimeout(() => setIntroComplete(true), reducedMotion ? 0 : 3000);
    return () => window.clearTimeout(timer);
  }, [stage, sceneReady, reducedMotion]);

  useEffect(() => {
    if (stage !== "BURST" || !sceneReady) return;
    const timer = window.setTimeout(() => {
      setLetters(0);
      setStage(rarity === "SSR" && quote ? "QUOTE" : "REVEAL");
    }, reducedMotion ? 0 : 620);
    return () => window.clearTimeout(timer);
  }, [stage, rarity, quote, reducedMotion, sceneReady]);

  useEffect(() => {
    if (stage !== "QUOTE" || !sceneReady) return;
    if (reducedMotion || letters >= quote.length) {
      const timer = window.setTimeout(() => setStage("REVEAL"), reducedMotion ? 0 : 600);
      return () => window.clearTimeout(timer);
    }
    const timer = window.setTimeout(() => setLetters((length) => length + 1), 38);
    return () => window.clearTimeout(timer);
  }, [stage, letters, quote, reducedMotion, sceneReady]);

  useEffect(() => {
    if (stage !== "REVEAL" || !sceneReady) return;
    callbacks.current.playSound(rarity === "SSR" ? "GACHA_SSR" : rarity === "SR" ? "GACHA_SR" : "GACHA_REVEAL");
    const timer = window.setTimeout(() => setStage("SETTLED"), reducedMotion ? 0 : rarity === "SSR" ? 750 : rarity === "SR" ? 750 : 450);
    return () => window.clearTimeout(timer);
  }, [stage, rarity, index, reducedMotion, sceneReady]);

  const announce = () => {
    if (!announced.current) { announced.current = true; callbacks.current.onReveal(); }
  };
  const skip = () => { announce(); setReviewing(false); setStage("SUMMARY"); };
  const tap = () => {
    // 同じタップの二重配送・ダブルタップでカードを飛ばさない。
    if (!sceneReady || (stage === "OPENING" && !introComplete)) return;
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
    {!sceneReady && <section className="cg-loading cg-scene-loading" role="status">
      <p>{failedScene === `${sceneKey}-${imageRetry}` ? "画像を読み込めませんでした" : "仲間を迎える準備中…"}</p>
      {failedScene === `${sceneKey}-${imageRetry}` && <button type="button" onClick={() => setImageRetry((value) => value + 1)}>画像を再読み込み</button>}
      <button type="button" onClick={onTextOnly}>獲得結果を文字で確認</button>
    </section>}
    <div ref={shell} aria-hidden={!sceneReady} inert={!sceneReady} tabIndex={-1} role="dialog" aria-modal="true" aria-label="ガチャ結果" className={`cg-shell ${sceneReady ? "" : "cg-waiting"} cg-${opening ? highest.toLowerCase() : rarity.toLowerCase()} cg-stage-${stage.toLowerCase()}`} data-gacha-presentation="arrival" data-stage={stage} onKeyDown={(event) => {
      if (event.key === "Escape" && !opening) { event.preventDefault(); skip(); }
      if (event.key !== "Tab") return;
      const buttons = Array.from(shell.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") || []);
      const first = buttons[0], last = buttons[buttons.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === shell.current)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === shell.current)) { event.preventDefault(); first?.focus(); }
    }}>
      <img className="cg-city" alt="" aria-hidden="true" src={opening || stage === "SUMMARY" || stage === "QUOTE" ? ARRIVAL_BACKGROUND : town(current)} />
      <div className="cg-atmosphere" aria-hidden="true" />
      {stage !== "SUMMARY" && <header className="cg-top"><span>{opening ? `${results.length}連ガチャ` : `${index + 1} / ${results.length}`}</span><button type="button" onClick={skip}>{reviewing ? "一覧へ戻る" : "SKIP"}</button></header>}
      {opening ? <button type="button" className="cg-opening" onClick={tap} disabled={stage === "BURST" || !introComplete} data-intro-complete={introComplete} aria-label="ガチャ結果を開く">
        <div className="cg-city-tour" aria-hidden="true">{CITY_GROUPS.map((cities, group) => <div className={`cg-city-group cg-city-group-${group}`} key={group}>{cities.map((city, i) => <div className="cg-city-scene" key={city} style={{ "--city-index": i, "--city-count": cities.length } as React.CSSProperties}><img src={getCharacterLocationBackground(city)} alt="" /><span>{city}</span></div>)}</div>)}</div>
        {introComplete && <div className="cg-opening-copy"><strong>TAP</strong><small>タップして仲間を迎える</small></div>}
      </button> : stage === "SUMMARY" ? <section className="cg-summary">
        <header><small>TRIBE NEON</small><h2>新たな仲間</h2><p>{tutorial ? "この仲間たちでチームを組もう" : `${results.length}人の獲得結果`}</p></header>
        <div className="cg-group" aria-hidden="true">{Array.from(new Map([...results].sort((a, b) => (rank[b.rarity] || 0) - (rank[a.rarity] || 0)).map((result) => [result.characterId, result])).values()).slice(0, 3).map((result, i) => <img key={result.characterId} src={result.imageUrl} alt="" style={{ "--person": i } as React.CSSProperties} />)}</div>
        <div className={`cg-grid ${results.length === 1 ? "cg-single" : ""}`}>
          {results.map((result, i) => <button type="button" key={`${result.characterId}-${i}`} onClick={() => showDetail(i)} className={`cg-mini cg-${result.rarity.toLowerCase()}`} data-result-index={i} data-character-id={result.characterId} aria-label={`${result.rarity} ${result.name} ${outcome(result)} 詳細を見る`}>
            <StandingArt result={result} variant="gacha-result-compact" />
            <ResultBadges result={result} /><span className="cg-mini-name">{result.name}</span>
          </button>)}
        </div>
        <p className="cg-summary-hint">仲間をタップして詳細を見る</p>
        <OutlawButton variant="primary" className="cg-continue" onClick={() => callbacks.current.onClose()}>{tutorial ? "編成へ進む" : "ガチャへ戻る"}</OutlawButton>
      </section> : <button type="button" className={`cg-reveal ${stage === "SETTLED" ? "is-settled" : ""}`} onClick={tap} aria-label={stage === "QUOTE" ? "セリフを表示して登場演出へ" : `${current.name} ${reviewing ? "一覧へ戻る" : "タップして次へ"}`} data-character-id={stage === "QUOTE" ? undefined : current.characterId} data-presentation-state={stage === "QUOTE" ? "SSR_QUOTE" : `${rarity}_REVEAL`}>
        {stage === "QUOTE" ? <div className="cg-quote-intro"><span aria-hidden="true">SSR</span><blockquote aria-label={quote}><span aria-hidden="true">{quote.slice(0, reducedMotion ? quote.length : letters)}</span></blockquote><small>{letters < quote.length ? "タップで全文表示" : "TAP"}</small></div> : <div className="cg-reveal-content" key={index}>
          <div className="cg-portrait"><StandingArt result={current} /></div>
          <div className="cg-reveal-copy"><div className="cg-rarity-line"><ResultBadges result={current} /></div>
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
