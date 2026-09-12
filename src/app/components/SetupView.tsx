"use client";

import React, { useEffect, useRef, useState } from "react";
import { useGame } from "../context/GameContext";
import CharacterPresentation from "./character/CharacterPresentation";
import TypewriterText from "./tutorial/TypewriterText";
import { userFacingErrorMessage } from "../lib/userFacingError";
import "./SetupView.css";
import { featureUiExposure } from "@/domain/operations/operations";
import { recordAcquisitionObservation } from "@/utils/kpiInstrumentation";
import OutlawButton from "./ui/OutlawButton";
import { recordWorldIntroObservation } from "@/utils/acquisitionAttribution";
import { useAssetTierPreloader } from "../hooks/useImagePreloader";

type EntryPresentationState = "WORLD_INFORMATION" | "WORLD_TO_AGEHA" | "AGEHA_INTRO" | "NAME_INPUT";
type WorldCharacter = { name: string; src: string };
type WorldStage = { text: string; highlights: readonly string[]; characters: readonly WorldCharacter[] };

export const WORLD_STAGES: readonly WorldStage[] = [
  {
    text: "この街には、\nいろんな生き方をしてる奴がいる。",
    highlights: [],
    characters: [
      { name: "レイジ", src: "/characters/reiji_transparent_asset.png" },
      { name: "アゲハ", src: "/characters/ageha_transparent_asset.png" },
      { name: "ゴウ", src: "/characters/go_transparent_asset.png" },
    ],
  },
  {
    text: "見た目も、性格も、戦い方も違う。\n誰と出会うかは、お前次第だ。",
    highlights: [],
    characters: [
      { name: "カレン", src: "/characters/karen_transparent_asset.png" },
      { name: "カエデ", src: "/characters/kaede_transparent_asset.png" },
    ],
  },
  { text: "この街で、お前のTRIBEが始まる。", highlights: [], characters: [] },
] as const;

const AGEHA_INTRO_COPY = `ようこそ、TRIBE NEONへ！
私はアゲハ。まず、キミの名前を教えて？`;
const WORLD_INTRO_ASSETS = [
  "/branding/tutorial/tutorial_world_street_bg.png",
  "/characters/reiji_transparent_asset.png",
  "/characters/ageha_transparent_asset.png",
  "/characters/go_transparent_asset.png",
  "/characters/karen_transparent_asset.png",
  "/characters/kaede_transparent_asset.png",
  "/branding/tribe-neon-logo.png",
].map((src) => ({ src, required: true }));
const BACKGROUND_HOLD_MS = 450;
const CHARACTER_REVEAL_INTERVAL_MS = 850;
const LOGO_HOLD_MS = 650;
const entryStateKey = (userId?: string) => `tribe_entry_presentation:${userId || "anonymous"}`;
const worldStageKey = (userId?: string) => `tribe_world_page:${userId || "anonymous"}`;

export default function SetupView() {
  const [presentationState, setPresentationState] = useState<EntryPresentationState>("WORLD_INFORMATION");
  const [worldStage, setWorldStage] = useState(0);
  const [visibleCharacterCount, setVisibleCharacterCount] = useState(0);
  const [worldStageComplete, setWorldStageComplete] = useState(false);
  const submitRef = useRef(false);
  const nameEntryRef = useRef(false);
  const { session, setupUsername, setSetupUsername, setSetupGiftCode, setupLoading, handleInitializeUser, handleFirstUserInteraction, errorMessage, setErrorMessage } = useGame();
  const worldAssets = useAssetTierPreloader(WORLD_INTRO_ASSETS, "TUTORIAL_CRITICAL");

  useEffect(() => {
    let stored: string | null = null;
    let storedStage = 0;
    try {
      stored = window.sessionStorage.getItem(entryStateKey(session?.user?.id));
      storedStage = Number(window.sessionStorage.getItem(worldStageKey(session?.user?.id)) || 0);
    } catch { /* 画面内の遷移は維持する。 */ }
    nameEntryRef.current = stored === "NAME_INPUT";
    if (stored === "AGEHA_INTRO" || stored === "NAME_INPUT") setPresentationState(stored);
    if (Number.isInteger(storedStage) && storedStage >= 0 && storedStage < WORLD_STAGES.length) setWorldStage(storedStage);
    void recordAcquisitionObservation("WORLD_INTRO_STARTED");
    if (stored !== "NAME_INPUT") recordWorldIntroObservation("WORLD_INTRO_VIEWED");
  }, [session?.user?.id]);

  useEffect(() => {
    if (featureUiExposure("INVITE") !== "ACTIVE") return;
    const invitationCode = new URLSearchParams(window.location.search).get("invite");
    if (invitationCode) setSetupGiftCode(invitationCode.toUpperCase().slice(0, 8));
  }, [setSetupGiftCode]);

  useEffect(() => {
    if (presentationState !== "WORLD_TO_AGEHA") return;
    const timer = window.setTimeout(() => {
      if (nameEntryRef.current) return;
      try { window.sessionStorage.setItem(entryStateKey(session?.user?.id), "AGEHA_INTRO"); } catch { /* 画面内の遷移は維持する。 */ }
      setPresentationState("AGEHA_INTRO");
    }, 520);
    return () => window.clearTimeout(timer);
  }, [presentationState, session?.user?.id]);

  useEffect(() => {
    if (presentationState === "NAME_INPUT") setSetupUsername("");
  }, [presentationState, setSetupUsername]);

  useEffect(() => {
    if (presentationState !== "WORLD_INFORMATION") return;
    setVisibleCharacterCount(0);
    setWorldStageComplete(false);
  }, [presentationState, worldStage]);

  useEffect(() => {
    if (presentationState !== "WORLD_INFORMATION" || !worldAssets.ready || worldStageComplete) return;
    const characters = WORLD_STAGES[worldStage].characters;
    if (characters.length === 0) {
      const timer = window.setTimeout(() => setWorldStageComplete(true), LOGO_HOLD_MS);
      return () => window.clearTimeout(timer);
    }
    const timer = window.setTimeout(() => {
      if (visibleCharacterCount < characters.length) setVisibleCharacterCount((current) => current + 1);
      else setWorldStageComplete(true);
    }, visibleCharacterCount === 0 ? BACKGROUND_HOLD_MS : CHARACTER_REVEAL_INTERVAL_MS);
    return () => window.clearTimeout(timer);
  }, [presentationState, visibleCharacterCount, worldAssets.ready, worldStage, worldStageComplete]);

  const advancePresentation = (nextState: EntryPresentationState) => {
    if (nameEntryRef.current) return;
    if (nextState === "NAME_INPUT") nameEntryRef.current = true;
    handleFirstUserInteraction();
    if (nextState === "WORLD_TO_AGEHA") void recordAcquisitionObservation("WORLD_INTRO_COMPLETED");
    try { window.sessionStorage.setItem(entryStateKey(session?.user?.id), nextState); } catch { /* 画面内の遷移は維持する。 */ }
    setPresentationState(nextState);
  };

  const advanceWorldStage = () => {
    if (!worldStageComplete) return;
    handleFirstUserInteraction();
    if (worldStage < WORLD_STAGES.length - 1) {
      const nextStage = worldStage + 1;
      try { window.sessionStorage.setItem(worldStageKey(session?.user?.id), String(nextStage)); } catch { /* 画面内の遷移は維持する。 */ }
      setWorldStage(nextStage);
      return;
    }
    advancePresentation("WORLD_TO_AGEHA");
  };

  const skipWorldIntro = () => {
    if (nameEntryRef.current) return;
    recordWorldIntroObservation("WORLD_INTRO_SKIPPED");
    advancePresentation(presentationState === "AGEHA_INTRO" ? "NAME_INPUT" : "AGEHA_INTRO");
  };

  const submitName = async () => {
    if (submitRef.current) return;
    submitRef.current = true;
    try { await handleInitializeUser(); } finally { submitRef.current = false; }
  };

  const stage = WORLD_STAGES[worldStage];
  const visibleCharacters = stage.characters.slice(0, visibleCharacterCount);
  const activeCharacter = visibleCharacters.at(-1);

  if (!worldAssets.ready) {
    return <div className="setup-preload-screen" role="status" aria-live="polite">
      {worldAssets.settled && worldAssets.requiredFailed ? <>
        <strong>チュートリアル画像を読み込めませんでした</strong>
        <button className="semantic-cta semantic-cta--primary" onClick={() => window.location.reload()}>再読み込み</button>
      </> : <span>画面を準備中</span>}
    </div>;
  }

  return (
    <div className={`setup-container scroll-container ${presentationState === "NAME_INPUT" ? "is-registration" : "is-world-entry"}`} onClick={handleFirstUserInteraction} data-entry-state={presentationState}>
      <div className="setup-world-shade" aria-hidden="true" />
      {presentationState !== "NAME_INPUT" && <OutlawButton type="button" variant="ghost" className="setup-world-skip" aria-label="SKIP" onClick={skipWorldIntro}>SKIP</OutlawButton>}
      {presentationState === "WORLD_INFORMATION" ? (
        <section className={`setup-world-presentation is-stage-${worldStage + 1}`} aria-label={`World Introduction Page ${worldStage + 1}`} data-world-stage={worldStage + 1} data-character={activeCharacter?.name || "none"}>
          <div className="setup-world-motion" aria-hidden="true" />
          <div className="setup-world-cast" aria-live="polite">
            {visibleCharacters.map((character, index) => (
              <div key={`${worldStage}-${character.name}`} className={`setup-world-character is-character-${index}`}>
                <CharacterPresentation src={character.src} alt={character.name} variant="dialogue-bust" metadata={false} />
              </div>
            ))}
          </div>
          {worldStage === 2 && <img className="setup-world-logo" src="/branding/tribe-neon-logo.png" alt="TRIBE NEON" />}
          <div className="setup-world-copy"><TypewriterText key={worldStage} text={stage.text} speedMs={34} /></div>
          <div className="setup-world-progress" aria-label={`${worldStage + 1} / ${WORLD_STAGES.length}`}>{WORLD_STAGES.map((_, index) => <i key={index} className={index === worldStage ? "is-active" : ""} />)}</div>
          <button className="setup-world-tap" onClick={advanceWorldStage} disabled={!worldStageComplete} aria-label={`Page ${worldStage + 1} を進む`}>TAP <span aria-hidden="true">⌄</span></button>
        </section>
      ) : presentationState === "WORLD_TO_AGEHA" ? (
        <section className="setup-world-transition" aria-label="アゲハの案内へ移動中"><span aria-hidden="true" /></section>
      ) : presentationState === "AGEHA_INTRO" ? (
        <section className="setup-ageha-presentation" aria-label="アゲハの自己紹介">
          <div className="setup-ageha-character" aria-hidden="true"><CharacterPresentation src="/characters/ageha_transparent_asset.png" alt="" variant="dialogue-bust" /></div>
          <div className="setup-ageha-dialogue"><div className="setup-ageha-name">アゲハ</div><TypewriterText text={AGEHA_INTRO_COPY} speedMs={34} /></div>
          <button type="button" className="semantic-cta semantic-cta--primary setup-primary-action is-actionable" onClick={() => advancePresentation("NAME_INPUT")}>名前を入力する</button>
        </section>
      ) : (
        <section className="setup-name-scene" aria-label="名前入力">
          <div className="setup-name-ageha" aria-hidden="true"><CharacterPresentation src="/characters/ageha_transparent_asset.png" alt="" variant="dialogue-bust" /></div>
          <div className="setup-box setup-name-dialog auth-box" role="dialog" aria-modal="true" aria-labelledby="setup-name-title">
            <div className="setup-name-guidance"><strong>アゲハ</strong><span>キミの名前を教えて？</span></div>
            <h2 id="setup-name-title" className="setup-title ui-type-screen-title">プレイヤー名</h2>
            <label htmlFor="setup-player-name">プレイヤー名（8文字まで）</label>
            <input id="setup-player-name" name="tribe-neon-new-player-name" type="text" autoComplete="off" autoCorrect="off" spellCheck={false} placeholder="プレイヤー名を入力" value={setupUsername} onChange={event => setSetupUsername(event.target.value)} maxLength={8} className="setup-name-input width-100" />
            <button onClick={() => void submitName()} aria-busy={setupLoading} disabled={setupLoading || !setupUsername.trim()} className="semantic-cta semantic-cta--primary setup-primary-action">{setupLoading ? "登録中..." : "この名前で始める"}</button>
          </div>
        </section>
      )}
      {errorMessage && <div className="modal-overlay setup-error-overlay" role="presentation"><div className="modal-card border-danger" role="alertdialog" aria-modal="true" aria-labelledby="setup-error-title"><div id="setup-error-title" className="modal-title text-color-danger">エラー</div><div className="modal-desc">{userFacingErrorMessage(errorMessage)}</div><button className="semantic-cta semantic-cta--danger" onClick={() => setErrorMessage(null)}>閉じる</button></div></div>}
    </div>
  );
}
