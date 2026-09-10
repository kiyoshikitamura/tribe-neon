"use client";

import React, { useEffect, useRef } from "react";
import { useGame } from "../context/GameContext";
import { userFacingErrorMessage } from "../lib/userFacingError";
import "./SetupView.css";
import { featureUiExposure } from "@/domain/operations/operations";
import { recordAcquisitionObservation } from "@/utils/kpiInstrumentation";
import { recordWorldIntroObservation } from "@/utils/acquisitionAttribution";

export const WORLD_STAGES = [
  { text: "ここは、誰のルールも\n通用しない街。\n\n力を持つ奴が、\nすべてを決める。", highlights: ["力を持つ奴が"] },
  { text: "ここで生き残るために、\nTRIBE\nを作れ。\n\n誰とつるむか。", highlights: ["TRIBE"] },
  { text: "仲間を信じ、裏切りを見抜き、\nこの街の頂点を目指せ。\n\nどこまで上へ行くか。\nすべては、お前の選択だ。", highlights: ["どこまで上へ行くか。"] },
  { text: "この街で生きる覚悟はあるか。\n\n― TRIBE NEON", highlights: ["TRIBE NEON"] },
] as const;

const entryStateKey = (userId?: string) => `tribe_entry_presentation:${userId || "anonymous"}`;

export default function SetupView() {
  const submitRef = useRef(false);
  const { session,setupUsername,setSetupUsername,setSetupGiftCode,setupLoading,handleInitializeUser,handleFirstUserInteraction,errorMessage,setErrorMessage } = useGame();

  useEffect(() => {
    const key = entryStateKey(session?.user?.id);
    let recorded = false;
    try { recorded = window.sessionStorage.getItem(key) === "NAME_INPUT"; } catch { /* telemetry remains best-effort */ }
    if (recorded) return;
    try { window.sessionStorage.setItem(key, "NAME_INPUT"); } catch { /* the shortened route still continues */ }
    void recordAcquisitionObservation("WORLD_INTRO_STARTED");
    recordWorldIntroObservation("WORLD_INTRO_SKIPPED");
    void recordAcquisitionObservation("WORLD_INTRO_COMPLETED");
  }, [session?.user?.id]);

  useEffect(() => {
    if (featureUiExposure("INVITE") !== "ACTIVE") return;
    const invitationCode = new URLSearchParams(window.location.search).get("invite");
    if (invitationCode) setSetupGiftCode(invitationCode.toUpperCase().slice(0,8));
  }, [setSetupGiftCode]);

  const submitName = async () => {
    if (submitRef.current) return;
    submitRef.current=true;
    try { await handleInitializeUser(); }
    finally { submitRef.current=false; }
  };

  return (
    <div className="setup-container scroll-container is-registration" onClick={handleFirstUserInteraction} data-entry-state="NAME_INPUT">
      <div className="setup-box setup-name-dialog auth-box" role="dialog" aria-modal="true" aria-labelledby="setup-name-title">
          <div className="setup-name-guidance"><strong>アゲハ</strong><span>その前に、名前聞いていい？<br />ここでなんて呼べばいい？</span></div>
          <h2 id="setup-name-title" className="setup-title ui-type-screen-title">プレイヤー名</h2>
          <label htmlFor="setup-player-name">プレイヤー名（8文字まで）</label>
          <input id="setup-player-name" name="tribe-neon-new-player-name" type="text" autoComplete="off" autoCorrect="off" spellCheck={false} placeholder="プレイヤー名を入力" value={setupUsername} onChange={event=>setSetupUsername(event.target.value)} maxLength={8} className="setup-name-input width-100" />
          <button onClick={()=>void submitName()} aria-busy={setupLoading} disabled={setupLoading||!setupUsername.trim()} className="semantic-cta semantic-cta--primary setup-primary-action">{setupLoading ? "登録中..." : "この名前で始める"}</button>
      </div>

      {errorMessage && <div className="modal-overlay setup-error-overlay" role="presentation"><div className="modal-card border-danger" role="alertdialog" aria-modal="true" aria-labelledby="setup-error-title"><div id="setup-error-title" className="modal-title text-color-danger">エラー</div><div className="modal-desc">{userFacingErrorMessage(errorMessage)}</div><button className="semantic-cta semantic-cta--danger" onClick={()=>setErrorMessage(null)}>閉じる</button></div></div>}
    </div>
  );
}
