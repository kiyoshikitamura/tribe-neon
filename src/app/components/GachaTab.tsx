"use client";

import Image from "next/image";
import React, { useEffect, useState } from "react";
import { useGame } from "../context/GameContext";
import TutorialNavigator from "./TutorialNavigator";
import CanonicalDialog from "./ui/CanonicalDialog";
import { useImmediateActionLock } from "@/hooks/useImmediateActionLock";
import { resolveAvailableGachaCreative, type CanonicalGachaId } from "@/domain/presentation/production_creatives";
import "./GachaTab.css";
import { supabase } from "@/utils/supabase";
import { parseDailyFreeRates, type DailyFreeRate } from "@/domain/gameplay/dailyFreeRates";

type GachaCategory = "CHARACTER" | "SKILL" | "EQUIPMENT";
type GachaSurface = "NORMAL" | "SPECIAL";

const CATEGORY_META: Readonly<Record<GachaCategory, { label: string; prefix: "CHAR" | "SKILL" | "EQUIP"; ticketId: string }>> = {
  CHARACTER: { label: "キャラクター", prefix: "CHAR", ticketId: "NORMAL_GACHA_TICKET_CHARACTER" },
  SKILL: { label: "スキル", prefix: "SKILL", ticketId: "NORMAL_GACHA_TICKET_SKILL" },
  EQUIPMENT: { label: "装備", prefix: "EQUIP", ticketId: "NORMAL_GACHA_TICKET_EQUIPMENT" },
};

export default function GachaTab() {
  const { handleScout, gachaMasters, gachaRarityRates, dailyFreeGachaFlags, dailyFreeGachaReady, refreshDailyFreeGachaAuthority, userItems, cash, diamonds, upgradeLoading, onboardingState, playSe, guideGachaCategory } = useGame();
  const isTutorialScout = onboardingState?.tutorial_step === "FREE_GACHA";
  const [activeCategory, setActiveCategory] = useState<GachaCategory>("CHARACTER");
  const [activeSurface, setActiveSurface] = useState<GachaSurface>("NORMAL");
  const [showRates, setShowRates] = useState(false);
  const [freeRates, setFreeRates] = useState<DailyFreeRate[]>([]);
  const [freeRatesStatus, setFreeRatesStatus] = useState<"loading" | "ready" | "error">("loading");
  const [freeRatesRetry, setFreeRatesRetry] = useState(0);
  useEffect(() => {
    if (isTutorialScout) return;
    let active = true;
    setFreeRatesStatus("loading");
    setFreeRates([]);
    void Promise.resolve(supabase.rpc("get_daily_free_gacha_rates")).then(({ data, error }) => {
      if (!active) return;
      const parsed = error ? null : parseDailyFreeRates(data);
      setFreeRates(parsed || []);
      setFreeRatesStatus(parsed ? "ready" : "error");
    }).catch(() => { if (active) setFreeRatesStatus("error"); });
    return () => { active = false; };
  }, [isTutorialScout, freeRatesRetry]);
  const [billingAvailable,setBillingAvailable] = useState(false);
  useEffect(()=>{ let active=true;
    fetch("/api/billing/config",{cache:"no-store"}).then(r=>r.json()).then(data=>{if(active)setBillingAvailable(data.available===true);}).catch(()=>{});
    return ()=>{active=false;};
  },[]);
  const { isLocked, beginAction, endAction } = useImmediateActionLock();
  const pending = upgradeLoading || isLocked;

  const meta = CATEGORY_META[activeCategory];
  const normalGachaId = `${meta.prefix}_NORMAL` as CanonicalGachaId;
  const specialGachaId = `${meta.prefix}_SPECIAL` as CanonicalGachaId;
  const creative = resolveAvailableGachaCreative(activeSurface === "NORMAL" ? normalGachaId : specialGachaId);
  const normalGacha = gachaMasters?.find((g: any) => g.id === normalGachaId);
  const hasDailyFree = dailyFreeGachaReady && dailyFreeGachaFlags[activeCategory];
  const tickets = Number(userItems?.find((item: any) => item.item_id === meta.ticketId)?.quantity || 0);
  const specialGacha = gachaMasters?.find((g: any) => g.id === specialGachaId);
  const specialTicketId = `SPECIAL_TICKET_${activeCategory}`;
  const specialTickets = Number(userItems?.find((item: any) => item.item_id === specialTicketId)?.quantity || 0);
  const currentRates = (gachaRarityRates || []).filter((rate: any) => rate.gacha_id === (activeSurface === "SPECIAL" ? specialGachaId : normalGachaId));
  const currentFreeRates = freeRates.filter(rate => rate.gacha_id === normalGachaId);
  const freeWeightTotal = currentFreeRates.reduce((sum, rate) => sum + rate.weight, 0);
  const rateWeightTotal = currentRates.reduce((sum: number, rate: any) => sum + Number(rate.weight || 0), 0);
  const formatCost = (value: unknown, pulls: number) => {
    const amount = Number(value);
    return Number.isFinite(amount) ? (amount * pulls).toLocaleString("ja-JP") : "--";
  };

  const runScout = async (count: number, currency: "CASH" | "FREE" | "TICKET" | "DIAMOND") => {
    if (currency === "FREE" && !isTutorialScout && freeRatesStatus !== "ready") return;
    if (!beginAction()) return;
    playSe("GACHA_START");
    try {
      await handleScout(activeSurface === "SPECIAL" && !isTutorialScout ? specialGachaId : normalGachaId, count, currency, currency === "FREE" && !isTutorialScout ? currentFreeRates[0]?.version : undefined);
    } finally {
      endAction();
    }
  };

  useEffect(() => {
    if (!dailyFreeGachaReady) void refreshDailyFreeGachaAuthority?.();
  }, [dailyFreeGachaReady, refreshDailyFreeGachaAuthority]);

  useEffect(() => {
    if (!guideGachaCategory) return;
    setActiveCategory(guideGachaCategory);
    setActiveSurface("NORMAL");
  }, [guideGachaCategory]);

  if (isTutorialScout) {
    const tutorialCreative = resolveAvailableGachaCreative("CHAR_NORMAL");
    return (
      <fieldset className="view-container relative gacha-view-root gacha-action-fieldset tutorial-gacha-page" disabled={pending} aria-busy={pending}>
        <TutorialNavigator message={<>ここでは、ガチャで仲間を増やせるよ。<br />まずは10連、引いてみよ。</>} />
        <section className="tutorial-gacha-hero" aria-labelledby="tutorial-gacha-title">
          {tutorialCreative && <Image
            className="tutorial-gacha-banner"
            src={tutorialCreative.assetPath}
            alt=""
            width={tutorialCreative.width}
            height={tutorialCreative.height}
            unoptimized
            priority
            sizes="(max-width: 430px) 100vw, 430px"
          />}
          <h2 id="tutorial-gacha-title">最初の仲間を迎えよう</h2>
        </section>
        <section className="tutorial-gacha-offer" aria-label="チュートリアル無料10連">
          <p className="tutorial-gacha-benefits"><b>無料10連</b><span aria-hidden="true"> / </span>SSR1体保証</p>
          <button className="semantic-cta semantic-cta--primary gacha-free-btn" aria-label="無料10連を引く" onClick={() => void runScout(10, "FREE")} disabled={!hasDailyFree || pending} aria-busy={pending}>
            <span>{pending ? "抽選中…" : "無料10連を引く"}</span>
          </button>
        </section>
      </fieldset>
    );
  }

  return (
    <fieldset className="view-container relative gacha-view-root gacha-action-fieldset" disabled={pending} aria-busy={pending}>
      <div className="gacha-scroll-shell">
        {guideGachaCategory && <p className="gacha-guide-target" role="status">
          初心者ガイド：{guideGachaCategory === "SKILL" ? "スキル" : "装備"}の無料10連を引こう
        </p>}
        <section className="gacha-product-banner" aria-label={`${meta.label}${activeSurface === "NORMAL" ? "ノーマル" : "スペシャル"}ガチャ`}>
          {creative ? <Image src={creative.assetPath} alt="" width={creative.width} height={creative.height} unoptimized priority sizes="(max-width: 430px) 100vw, 430px" /> : <div className="gacha-banner-fallback">{meta.label}ガチャ</div>}
        </section>

        <nav className="gacha-category-tabs" aria-label="ガチャカテゴリ">
          {(Object.keys(CATEGORY_META) as GachaCategory[]).map((category) => (
            <button key={category} className={`gacha-tab-btn ${activeCategory === category ? "is-active" : ""}`} onClick={() => setActiveCategory(category)} aria-pressed={activeCategory === category} data-gacha-category={category}>
              {CATEGORY_META[category].label}
              {dailyFreeGachaReady && dailyFreeGachaFlags[category] && <span className="free-badge-dot">無料</span>}
            </button>
          ))}
        </nav>

        <div className="gacha-surface-switch" role="group" aria-label="ガチャ種別">
          <button className={activeSurface === "NORMAL" ? "is-active" : ""} onClick={() => setActiveSurface("NORMAL")} aria-pressed={activeSurface === "NORMAL"}>ノーマル</button>
          <button className={activeSurface === "SPECIAL" ? "is-active" : ""} onClick={() => setActiveSurface("SPECIAL")} aria-pressed={activeSurface === "SPECIAL"}>スペシャル</button>
        </div>

        {activeSurface === "SPECIAL" ? (
          <section className="gacha-normal-offer" aria-label="スペシャルガチャ">
            {billingAvailable ? <>
              <header><strong>{meta.label}スペシャルガチャ</strong><button type="button" className="gacha-rate-link" onClick={()=>setShowRates(true)}>提供割合</button></header>
              <div className="gacha-payment-group" aria-label="DIAで引く">
                {[1,10].map(count=><button key={count} onClick={()=>void runScout(count,"DIAMOND")}
                  disabled={!specialGacha || !(Number(specialGacha.cost_diamond)>0) || Number(diamonds||0)<Number(specialGacha.cost_diamond)*count || pending}>
                  <span>{count}回</span><small>{formatCost(specialGacha?.cost_diamond,count)} DIA</small></button>)}
              </div>
              <div className="gacha-payment-group" aria-label="専用チケットで引く">
                {[1,10].map(count=><button key={count} onClick={()=>void runScout(count,"TICKET")} disabled={!specialGacha || specialTickets<count || pending}>
                  <span>チケット{count}回</span><small>所持 {specialTickets}枚</small></button>)}
              </div>
            </> : <p>スペシャルガチャは準備中です</p>}
          </section>
        ) : (
          <section className="gacha-normal-offer" aria-label={`${meta.label}ノーマルガチャ`}>
            <header>
              <div><strong>{meta.label}ノーマルガチャ</strong><span>毎日1回、10連無料</span></div>
              <button type="button" className="gacha-rate-link" onClick={() => setShowRates(true)}>提供割合</button>
            </header>

            {!dailyFreeGachaReady ? (
              <p className="gacha-free-loading" role="status">無料10連の利用状況を確認中…</p>
            ) : hasDailyFree ? (
              <button className="semantic-cta semantic-cta--primary gacha-free-btn" onClick={() => void runScout(10, "FREE")} disabled={!normalGacha || pending || freeRatesStatus !== "ready"} aria-busy={pending}>
                <span>{pending ? "抽選中…" : "本日10連無料"}</span>
                {!pending && <small>消費なし</small>}
              </button>
            ) : null}

            {freeRatesStatus === "loading" && <p role="status">無料10連の提供割合を確認中…</p>}
            {freeRatesStatus === "error" && <p role="alert">無料10連の提供割合を取得できませんでした。<button type="button" className="gacha-rate-link" onClick={() => setFreeRatesRetry(value => value + 1)}>再取得</button></p>}
            <div className="gacha-payment-group" aria-label="キャッシュで引く">
              <button onClick={() => void runScout(1, "CASH")} disabled={!normalGacha || Number(cash || 0) < Number(normalGacha?.cost_cash || Infinity) || pending}><span>1回</span><small>{formatCost(normalGacha?.cost_cash, 1)}キャッシュ</small></button>
              <button onClick={() => void runScout(10, "CASH")} disabled={!normalGacha || Number(cash || 0) < Number(normalGacha?.cost_cash || Infinity) * 10 || pending}><span>10回</span><small>{formatCost(normalGacha?.cost_cash, 10)}キャッシュ</small></button>
            </div>
            <div className="gacha-payment-group" aria-label="チケットで引く">
              <button onClick={() => void runScout(1, "TICKET")} disabled={!normalGacha || tickets < 1 || pending}><span>チケット1回</span><small>所持 {tickets.toLocaleString("ja-JP")}枚</small></button>
              <button onClick={() => void runScout(10, "TICKET")} disabled={!normalGacha || tickets < 10 || pending}><span>チケット10回</span><small>10枚消費</small></button>
            </div>
          </section>
        )}
      </div>
      {showRates && (
        <CanonicalDialog title="提供割合" onClose={() => setShowRates(false)} actions={[{ label: "閉じる", semantic: "primary", onClick: () => setShowRates(false) }]}>
          {activeSurface === "NORMAL" && <section aria-label="日次無料10連の提供割合">
            <h3>日次無料10連</h3>
            {freeRatesStatus === "ready" ? <div className="gacha-rate-list">{currentFreeRates.map(rate => (
              <div key={rate.rarity}><span>{rate.rarity}</span><strong>{(rate.weight / freeWeightTotal * 100).toFixed(2)}%</strong></div>
            ))}</div> : <p>提供割合を取得できていません。画面を閉じて再取得してください。</p>}
          </section>}
          <h3>{activeSurface === "NORMAL" ? "CASH・チケット・DIA" : "スペシャルガチャ"}</h3>
          <div className="gacha-rate-list">
            {currentRates.map((rate: any) => (
              <div key={rate.rarity}><span>{rate.rarity}</span><strong>{rateWeightTotal > 0 ? `${(Number(rate.weight) / rateWeightTotal * 100).toFixed(2)}%` : "—"}</strong></div>
            ))}
          </div>
        </CanonicalDialog>
      )}
    </fieldset>
  );
}
