"use client";

import React, { useEffect, useRef, useState } from "react";
import { useGame } from "../context/GameContext";
import CharacterPresentation from "./character/CharacterPresentation";
import TypewriterText from "./tutorial/TypewriterText";
import { userFacingErrorMessage } from "../lib/userFacingError";
import "./SetupView.css";
import { featureUiExposure } from "@/domain/operations/operations";
import { recordAcquisitionObservation } from "@/utils/kpiInstrumentation";

type EntryPresentationState = "WORLD_INFORMATION" | "WORLD_TO_AGEHA" | "AGEHA_INTRO" | "NAME_INPUT";

export const WORLD_STAGES = [
  { text: "ここは、誰のルールも\n通用しない街。\n\n力を持つ奴が、\nすべてを決める。", highlights: ["力を持つ奴が"] },
  { text: "ここで生き残るために、\nTRIBE\nを作れ。\n\n誰とつるむか。", highlights: ["TRIBE"] },
  { text: "仲間を信じ、裏切りを見抜き、\nこの街の頂点を目指せ。\n\nどこまで上へ行くか。\nすべては、お前の選択だ。", highlights: ["どこまで上へ行くか。"] },
  { text: "この街で生きる覚悟はあるか。\n\n― TRIBE NEON", highlights: ["TRIBE NEON"] },
] as const;

const AGEHA_INTRO_COPY = `はじめまして。アゲハだよ。
この街のこと、少しだけ案内するね。`;

const entryStateKey = (userId?: string) => `tribe_entry_presentation:${userId || "anonymous"}`;

export default function SetupView() {
  const [presentationState, setPresentationState] = useState<EntryPresentationState>("WORLD_INFORMATION");
  const [worldStage, setWorldStage] = useState(0);
  const [worldStageComplete, setWorldStageComplete] = useState(false);
  const submitRef = useRef(false);
  const { session,setupUsername,setSetupUsername,setSetupGiftCode,setupLoading,handleInitializeUser,handleFirstUserInteraction,errorMessage,setErrorMessage } = useGame();

  useEffect(() => {
    const stored = window.sessionStorage.getItem(entryStateKey(session?.user?.id));
    if (stored === "AGEHA_INTRO" || stored === "NAME_INPUT") setPresentationState(stored);
    void recordAcquisitionObservation("WORLD_INTRO_STARTED");
  }, [session?.user?.id]);

  useEffect(() => {
    if (featureUiExposure("INVITE") !== "ACTIVE") return;
    const invitationCode = new URLSearchParams(window.location.search).get("invite");
    if (invitationCode) setSetupGiftCode(invitationCode.toUpperCase().slice(0,8));
  }, [setSetupGiftCode]);

  useEffect(() => {
    if (presentationState !== "WORLD_TO_AGEHA") return;
    const timer = window.setTimeout(() => {
      window.sessionStorage.setItem(entryStateKey(session?.user?.id), "AGEHA_INTRO");
      setPresentationState("AGEHA_INTRO");
    }, 800);
    return () => window.clearTimeout(timer);
  }, [presentationState, session?.user?.id]);

  useEffect(() => {
    if (presentationState === "NAME_INPUT") setSetupUsername("");
  }, [presentationState, setSetupUsername]);

  useEffect(() => {
    if (presentationState !== "WORLD_INFORMATION" || !worldStageComplete || worldStage >= WORLD_STAGES.length - 1) return;
    const timer = window.setTimeout(() => {
      setWorldStageComplete(false);
      setWorldStage((current) => current + 1);
    }, 2300);
    return () => window.clearTimeout(timer);
  }, [presentationState, worldStage, worldStageComplete]);

  const advancePresentation = (nextState: EntryPresentationState) => {
    handleFirstUserInteraction();
    window.sessionStorage.setItem(entryStateKey(session?.user?.id), nextState);
    setPresentationState(nextState);
  };

  const submitName = async () => {
    if (submitRef.current) return;
    submitRef.current=true;
    try { await handleInitializeUser(); }
    finally { submitRef.current=false; }
  };

  return (
    <div className={`setup-container scroll-container ${presentationState === "NAME_INPUT" ? "is-registration" : "is-world-entry"}`} onClick={handleFirstUserInteraction} data-entry-state={presentationState}>
      <div className="setup-world-shade" aria-hidden="true" />
      {presentationState === "WORLD_INFORMATION" ? (
        <section className={`setup-world-presentation is-stage-${worldStage + 1}`} aria-label="TRIBE NEON プロローグ" data-world-stage={worldStage + 1}>
          <div key={`world-motion-${worldStage}`} className="setup-world-motion" aria-hidden="true"><i /><i /></div>
          <div className="setup-world-brand">TRIBE NEON <small>PROLOGUE</small></div>
          <img className="setup-world-emblem" src="/branding/tribe-neon-logo.png" alt="" aria-hidden="true" />
          <div className="setup-world-copy" key={worldStage}>
            <TypewriterText
              text={WORLD_STAGES[worldStage].text}
              speedMs={46}
              highlightTerms={[...WORLD_STAGES[worldStage].highlights]}
              onComplete={() => setWorldStageComplete(true)}
            />
          </div>
          <div className="setup-world-progress" aria-hidden="true">
            {WORLD_STAGES.map((_, index) => <i key={index} className={index <= worldStage ? "is-active" : ""} />)}
          </div>
          {worldStage === WORLD_STAGES.length - 1 && worldStageComplete && (
            <button className="setup-world-tap" onClick={() => { handleFirstUserInteraction(); void recordAcquisitionObservation("WORLD_INTRO_COMPLETED"); setPresentationState("WORLD_TO_AGEHA"); }}>
              TAP TO CONTINUE <span aria-hidden="true">⌄</span>
            </button>
          )}
        </section>
      ) : presentationState === "WORLD_TO_AGEHA" ? (
        <section className="setup-world-transition" aria-label="アゲハの案内へ移動中"><span aria-hidden="true" /></section>
      ) : presentationState === "AGEHA_INTRO" ? (
        <section className="setup-ageha-presentation">
          <div className="setup-ageha-character" aria-hidden="true">
            <CharacterPresentation src="/characters/ageha_transparent_asset.png" alt="" variant="dialogue-bust" />
          </div>
          <div className="setup-ageha-dialogue">
            <div className="setup-ageha-name">アゲハ</div>
            <TypewriterText text={AGEHA_INTRO_COPY} speedMs={38} />
          </div>
          <button type="button" className="semantic-cta semantic-cta--primary setup-primary-action is-actionable" onClick={() => advancePresentation("NAME_INPUT")}>次へ</button>
        </section>
      ) : (
        <div className="setup-box setup-name-dialog auth-box" role="dialog" aria-modal="true" aria-labelledby="setup-name-title">
          <div className="setup-name-guidance"><strong>アゲハ</strong><span>その前に、名前聞いていい？<br />ここでなんて呼べばいい？</span></div>
          <h2 id="setup-name-title" className="setup-title ui-type-screen-title">プレイヤー名</h2>
          <label htmlFor="setup-player-name">プレイヤー名（8文字まで）</label>
          <input id="setup-player-name" name="tribe-neon-new-player-name" type="text" autoComplete="off" autoCorrect="off" spellCheck={false} placeholder="プレイヤー名を入力" value={setupUsername} onChange={event=>setSetupUsername(event.target.value)} maxLength={8} className="setup-name-input width-100" />
          <button onClick={()=>void submitName()} aria-busy={setupLoading} disabled={setupLoading||!setupUsername.trim()} className="semantic-cta semantic-cta--primary setup-primary-action">{setupLoading ? "登録中..." : "この名前で始める"}</button>
        </div>
      )}

      {errorMessage && <div className="modal-overlay setup-error-overlay" role="presentation"><div className="modal-card border-danger" role="alertdialog" aria-modal="true" aria-labelledby="setup-error-title"><div id="setup-error-title" className="modal-title text-color-danger">エラー</div><div className="modal-desc">{userFacingErrorMessage(errorMessage)}</div><button className="semantic-cta semantic-cta--danger" onClick={()=>setErrorMessage(null)}>閉じる</button></div></div>}
    </div>
  );
}
