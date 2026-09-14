"use client";
import React from "react";
import type { GrowthExpPreview } from "@/domain/gameplay/canonical/growthExp";

export default function GrowthExpSummary({ preview, error, retry }: { preview: GrowthExpPreview | null; error: boolean; retry: () => void }) {
  if (!preview) return error
    ? <div role="status"><p>強化情報を取得できませんでした。</p><button type="button" onClick={retry}>再取得</button></div>
    : <span className="spinner" role="status" aria-label="強化情報を取得中" />;
  return <div className="character-v2-consumption">
    <span>現在EXP {preview.currentXp.toLocaleString()}{preview.currentRequiredExp !== null ? " / " + preview.currentRequiredExp.toLocaleString() : "（最大Lv）"}</span>
    <span>獲得EXP {preview.gainedExp.toLocaleString()}</span>
    <span>強化後EXP {preview.xp.toLocaleString()}{preview.nextRequiredExp !== null ? " / " + preview.nextRequiredExp.toLocaleString() : "（最大Lv）"}</span>
    <span>予測CASH {preview.cashSpent.toLocaleString()}</span>
    {preview.level >= preview.levelCap && preview.levelCap < 100 && <span>現在のLv上限 {preview.levelCap}。余剰EXPは上限解放後に使用できます。</span>}
    {preview.currentLevel >= 100 && <span>最大Lvのため素材は使用できません。</span>}
  </div>;
}
