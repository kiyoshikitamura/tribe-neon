"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/utils/supabase";
import { SPECIAL_GACHA_COPY, exchangeItems, parseSpecialGachaCatalog, specialTicketId, type SpecialGacha, type SpecialGachaCatalog, type SpecialGachaId, type SpecialGachaItem } from "@/domain/gacha/specialGacha";
import CanonicalDialog from "./ui/CanonicalDialog";
import "./SpecialGachaOffer.css";

type DrawChoice = { count: 1 | 10; currency: "DIAMOND" | "TICKET" };
export default function SpecialGachaOffer({ category, diamonds, userItems, pending, onScout, onExchange }: {
  category: "CHARACTER" | "SKILL" | "EQUIPMENT";
  diamonds: number; userItems: { item_id: string; quantity: number }[]; pending: boolean;
  onScout: (id: SpecialGachaId, count: number, currency: "DIAMOND" | "TICKET") => Promise<unknown>;
  onExchange: (type: SpecialGachaItem["item_type"], id: string, requestId: string, gachaId: SpecialGachaId) => Promise<boolean>;
}) {
  const [catalog, setCatalog] = useState<SpecialGachaCatalog | null>(null);
  const [failed, setFailed] = useState(false);
  const [revision, setRevision] = useState(0);
  const [selected, setSelected] = useState<SpecialGacha | null>(null);
  const [choice, setChoice] = useState<DrawChoice | null>(null);
  const [rates, setRates] = useState<SpecialGacha | null>(null);
  const [exchangeOpen, setExchangeOpen] = useState<SpecialGacha | null>(null);
  const [reward, setReward] = useState<SpecialGachaItem | null>(null);
  const [received, setReceived] = useState<string | null>(null);
  const exchangeRequest = useRef<{ key: string; id: string } | null>(null);
  useEffect(() => {
    if (pending) return;
    let active = true;
    void Promise.resolve(supabase.rpc("get_special_gacha_catalog_v2")).then(({ data, error }) => {
      if (!active) return;
      const parsed = error || data?.pity_scope !== "PER_GACHA" ? null : parseSpecialGachaCatalog(data);
      if (parsed && parsed.gachas.some(g => !Number.isInteger(g.pity_points) || Number(g.pity_points) < 0)) { setCatalog(null); setFailed(true); return; }
      setCatalog(parsed); setFailed(!parsed);
    }).catch(() => { if (active) { setCatalog(null); setFailed(true); } });
    return () => { active = false; };
  }, [pending, revision]);
  if (failed) return <section className="special-gacha-offer"><p role="alert">ガチャ情報を取得できませんでした。</p><button onClick={() => setRevision(n => n + 1)}>再取得</button></section>;
  if (!catalog) return <div className="special-gacha-loading" role="status" aria-label="ガチャ情報を確認中"><span className="spinner" /></div>;
  if (!catalog.available) return <p>スペシャルガチャは準備中です</p>;
  const offers = catalog.gachas.filter(g => category === "CHARACTER" ? g.id.startsWith("CHAR_") : g.id === (category === "SKILL" ? "SKILL_SPECIAL" : "EQUIP_SPECIAL"));
  const ticketCount = (g: SpecialGacha) => Number(userItems.find(i => i.item_id === specialTicketId(g.id))?.quantity || 0);
  const affordable = (g: SpecialGacha, c: DrawChoice) => c.currency === "TICKET" ? ticketCount(g) >= c.count : diamonds >= g.cost_diamond * c.count;
  const exchange = async () => {
    if (!reward || !exchangeOpen) return;
    const key = `${exchangeOpen.id}:${reward.item_type}:${reward.item_id}`;
    if (exchangeRequest.current?.key !== key) exchangeRequest.current = { key, id: crypto.randomUUID() };
    const success = await onExchange(reward.item_type, reward.item_id, exchangeRequest.current.id, exchangeOpen.id);
    if (success) {
      exchangeRequest.current = null;
      setReceived(reward.name); setReward(null); setExchangeOpen(null); setRevision(n => n + 1);
    }
  };
  return <section className="special-gacha-offer" aria-label="スペシャルガチャ">
    {offers.map(g => <div key={g.id} className="special-gacha-product">
      <div className="special-gacha-product-header"><p>{SPECIAL_GACHA_COPY[g.id].description}</p><button className="special-gacha-pity" disabled={pending} onClick={() => { setExchangeOpen(g); setReward(null); }}>SSR交換 <span>{g.pity_points} / {catalog.pity_cost}Pt</span></button></div>
      <button className="semantic-cta semantic-cta--primary" disabled={pending} onClick={() => { setSelected(g); setChoice(null); }}>{SPECIAL_GACHA_COPY[g.id].title}</button>
      <button className="gacha-rate-link" onClick={() => setRates(g)}>提供割合</button>
    </div>)}
    {selected && <CanonicalDialog title={SPECIAL_GACHA_COPY[selected.id].title} onClose={pending ? undefined : () => { setSelected(null); setChoice(null); }} actions={choice ? [
      { label: "戻る", onClick: () => setChoice(null), disabled: pending },
      { label: `${choice.count}連を引く`, semantic: "primary", disabled: pending || !affordable(selected, choice), onClick: async () => {
        const gacha = selected; const draw = choice;
        setSelected(null); setChoice(null);
        await onScout(gacha.id, draw.count, draw.currency);
      } },
    ] : []}>
      {choice ? <p className="special-gacha-confirm">{choice.currency === "DIAMOND" ? `${(selected.cost_diamond * choice.count).toLocaleString()}ダイヤ` : `チケット${choice.count}枚`}を消費します。</p> : <>
        <div className="gacha-payment-group" aria-label="ダイヤで引く">{([1,10] as const).map(count => <button key={count} disabled={pending || !affordable(selected, { count, currency: "DIAMOND" })} onClick={() => setChoice({ count, currency: "DIAMOND" })}><span>{count}連</span><small>{(selected.cost_diamond * count).toLocaleString()}ダイヤ</small></button>)}</div>
        <div className="gacha-payment-group" aria-label="チケットで引く">{([1,10] as const).map(count => <button key={count} disabled={pending || ticketCount(selected) < count} onClick={() => setChoice({ count, currency: "TICKET" })}><span>チケット{count}連</span><small>{count}枚消費</small></button>)}</div>
        <p className="special-gacha-balance">所持 {(diamonds || 0).toLocaleString()}ダイヤ / チケット{ticketCount(selected)}枚</p>
      </>}
    </CanonicalDialog>}
    {rates && createPortal(<div className="special-gacha-rates-dialog"><CanonicalDialog title={`${SPECIAL_GACHA_COPY[rates.id].title} 提供割合`} onClose={() => setRates(null)} actions={[{ label: "閉じる", onClick: () => setRates(null) }]}>
      <div className="special-gacha-rates" tabIndex={0} role="region" aria-label="提供割合一覧">{rates.items.map(item => <div key={item.item_id}><span>{item.rarity} {item.name}{item.is_exclusive ? "（専用）" : ""}</span><strong>{item.probability.toFixed(4)}%</strong></div>)}</div>
    </CanonicalDialog></div>, document.body)}
    {exchangeOpen && <CanonicalDialog title={`${SPECIAL_GACHA_COPY[exchangeOpen.id].title} SSR交換`} onClose={pending ? undefined : () => { setExchangeOpen(null); setReward(null); }} actions={reward ? [{ label: "100Ptで交換", semantic: "primary", disabled: pending || Number(exchangeOpen.pity_points) < catalog.pity_cost, onClick: exchange }] : []}>
      <p>{exchangeOpen.pity_points}Pt / 交換に必要：{catalog.pity_cost}Pt</p>
      <div className="special-gacha-exchange">{exchangeItems([exchangeOpen]).map(item => <button key={`${item.item_type}:${item.item_id}`} aria-pressed={reward?.item_id === item.item_id && reward.item_type === item.item_type} disabled={pending} onClick={() => setReward(item)}>{item.name}{item.is_exclusive ? "（専用）" : ""}</button>)}</div>
    </CanonicalDialog>}
    {received && <CanonicalDialog title="交換完了" onClose={() => setReceived(null)} actions={[{ label: "確認する", semantic: "primary", onClick: () => setReceived(null) }]}><p>{received}を獲得しました。</p></CanonicalDialog>}
  </section>;
}
