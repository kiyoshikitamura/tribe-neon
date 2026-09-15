"use client";

import { useRef, useState } from "react";
import { useGame } from "../context/GameContext";
import { supabase } from "@/utils/supabase";
import CharacterPresentation from "./character/CharacterPresentation";
import TypewriterText from "./tutorial/TypewriterText";
import "./TutorialWorldIntro.css";

export default function TutorialWorldIntro() {
  const { onboardingState, setOnboardingState, navigateTab, playCyberSe, handleFirstUserInteraction, setErrorMessage, username, setupUsername } = useGame();
  const [advancing, setAdvancing] = useState(false);
  const advancingRef = useRef(false);
  if (onboardingState?.tutorial_step !== "WORLD_INTRO") return null;

  const continueTutorial = async () => {
    if (advancingRef.current) return;
    advancingRef.current = true;
    setAdvancing(true);
    try {
      handleFirstUserInteraction();
      playCyberSe("click");
      const { error } = await supabase.rpc("advance_tutorial_progress", {
        p_expected_step: "WORLD_INTRO", p_next_step: "FREE_GACHA",
      });
      let authoritativeStep = error ? null : "FREE_GACHA";
      if (error) {
        const { data: refreshedState, error: refreshError } = await supabase.rpc("get_current_onboarding_state");
        if (refreshError) throw error;
        authoritativeStep = refreshedState?.tutorial_step ?? null;
      }
      if (authoritativeStep !== "FREE_GACHA") throw error || new Error("Tutorial state did not advance");
      setErrorMessage(null);
      setOnboardingState((current: any) => current ? { ...current, tutorial_step: authoritativeStep } : current);
      navigateTab("gacha");
    } catch {
      setErrorMessage("チュートリアルを再開できませんでした。通信状態を確認して、もう一度お試しください。");
    } finally {
      advancingRef.current = false;
      setAdvancing(false);
    }
  };

  return (
    <div className="tutorial-world" role="dialog" aria-modal="true" aria-label="アゲハからの案内">
      <div className="tutorial-world-content">
        <div className="tutorial-world-shade" />
        <div className="tutorial-world-ageha" aria-hidden="true"><CharacterPresentation src="/characters/ageha_transparent_asset.png" alt="" variant="dialogue-bust" /></div>
        <div className="tutorial-world-dialogue"><strong>アゲハ</strong><TypewriterText text={`よろしく、${username || setupUsername}！\nこの街、一人でやってくのは結構大変なんだ。\nまずは仲間を集めよっか。`} speedMs={34} /></div>
        <button
          className="semantic-cta semantic-cta--primary tutorial-world-next-cta"
          data-cta-state={advancing ? "busy" : "ready"}
          style={advancing ? undefined : {
            opacity: 1,
            color: "#031014",
            borderColor: "#8effff",
            background: "linear-gradient(135deg, #19dce9, #69f3ff)",
            boxShadow: "inset 0 1px 0 rgba(255,255,255,.58), 0 0 20px rgba(25,220,233,.48)",
            filter: "none",
          }}
          onClick={() => void continueTutorial()}
          disabled={advancing}
          aria-busy={advancing}
        >
          次へ
        </button>
      </div>
    </div>
  );
}
