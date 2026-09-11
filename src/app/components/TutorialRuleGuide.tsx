"use client";

import { useEffect, useRef, useState } from "react";
import { useGame } from "../context/GameContext";
import { supabase } from "@/utils/supabase";
import { getTutorialCompletionAssetStatus, preloadTutorialCompletionAssets } from "../lib/tutorialCompletionAssets";
import "./TutorialRuleGuide.css";

export default function TutorialRuleGuide() {
  const { onboardingState, setOnboardingState, playCyberSe } = useGame();
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const workingRef = useRef(false);
  const tutorialStep = onboardingState?.tutorial_step;

  useEffect(() => {
    if (tutorialStep === "RULE_GUIDE") void preloadTutorialCompletionAssets();
  }, [tutorialStep]);

  if (tutorialStep !== "RULE_GUIDE") return null;

  const complete = async () => {
    if (workingRef.current) return;
    workingRef.current = true;
    setWorking(true);
    setError(null);
    playCyberSe("click");
    try {
      const { error: progressError } = await supabase.rpc("advance_tutorial_progress", { p_expected_step: "RULE_GUIDE", p_next_step: "COMPLETE" });
      if (progressError) {
        setError("進行を保存できませんでした。通信状態を確認して、もう一度お試しください。");
        return;
      }
      setOnboardingState((current: any) => current ? { ...current, tutorial_step: "COMPLETE" } : current);
    } finally {
      workingRef.current = false;
      setWorking(false);
    }
  };

  return (
    <div className="tutorial-rule-screen" role="dialog" aria-modal="true" aria-label="チュートリアル最終案内" data-acceptance-state="FINAL_GUIDE" data-completion-assets={getTutorialCompletionAssetStatus()}>
      <section className="tutorial-final-guide-frame">
        <img src="/branding/tutorial/tutorial_final_guide_bg.png" alt="ここからは、仲間と遊ぼう。レイドで助け合い、ギルドでつながる。あと、キミの自由だ。" />
        {error && <div className="tutorial-final-guide-error" role="alert">{error}</div>}
        <button className="tutorial-final-guide-cta" onClick={() => void complete()} disabled={working} aria-busy={working} aria-label="街へ出る →">
          <span className="visually-hidden">街へ出る →</span>
        </button>
      </section>
    </div>
  );
}
