"use client";

import React from "react";
import CharacterPresentation from "../character/CharacterPresentation";
import OutlawButton from "../ui/OutlawButton";
import ScreenState from "../ui/ScreenState";
import { useScreenReadiness } from "../../hooks/useScreenReadiness";
import { evictImageFromCache } from "../../lib/screenAssets";
import "./BattleTopPresentation.css";

export type BattleTopRival = {
  id: string;
  name: string;
  leaderName: string;
  image?: string;
  power: number;
  rank?: number | null;
};

type HeroProps = {
  player: { name: string; image?: string; power: number };
  rival?: BattleTopRival;
  background?: string;
  attempts: number;
  recovery: string | null;
  busy: boolean;
  onStart: () => void;
  onRecover: () => void;
};

export function BattleHero(props: HeroProps) {
  // 選択画像の組が変わった時点で待機状態を作り直し、前の画像で開始可能にしない。
  return <BattleHeroContent key={`${props.player.image}:${props.rival?.id}:${props.rival?.image}`} {...props} />;
}

function BattleHeroContent({ player, rival, background, attempts, recovery, busy, onStart, onRecover }: HeroProps) {
  const readiness = useScreenReadiness({
    assets: [player.image, rival?.image].filter((src): src is string => Boolean(src)).map(src => ({ src })),
    dataReady: Boolean(player.image && rival?.image),
  });
  const ready = readiness.status === "ready";
  const retryImages = () => {
    [player.image, rival?.image].forEach(src => { if (src) evictImageFromCache(src); });
    readiness.retry();
  };
  return <section className="pvp-hero battle-top-hero" aria-label="自分と対戦相手" style={background ? { "--battle-top-background": `url(${background})` } as React.CSSProperties : undefined}>
    <div className="battle-top-labels"><span>MY TEAM</span><span>RIVAL</span></div>
    <div className="battle-top-stage" aria-busy={!ready}>
      <div className="battle-top-standing is-player">
        <CharacterPresentation src={player.image} alt={player.name} variant="full-body" metadata={false} />
      </div>
      <strong className="battle-top-vs">VS</strong>
      <div className="battle-top-standing is-rival">
        <CharacterPresentation src={rival?.image} alt={rival?.leaderName || "対戦相手"} variant="full-body" metadata={false} />
      </div>
      {!ready && <div className="battle-top-asset-state">
        {readiness.status === "error" ? <OutlawButton variant="secondary" onClick={retryImages}>画像を再取得</OutlawButton>
          : !rival ? <span>対戦相手を更新してください</span>
          : !player.image || !rival.image ? <span>リーダー画像を確認できません</span>
          : <ScreenState kind="loading" compact />}
      </div>}
    </div>
    <div className="battle-top-comparison">
      <div className="is-player"><span>{player.name}</span><strong>{player.power.toLocaleString()}</strong><small>総合力</small></div>
      <div className="is-rival"><span>{rival?.name || "—"}</span><strong>{rival ? rival.power.toLocaleString() : "—"}</strong><small>総合力{rival?.rank != null && rival.rank > 0 ? ` · #${rival.rank}` : ""}</small></div>
    </div>
    <OutlawButton className="battle-top-start" variant="primary" fullWidth disabled={!ready || busy} onClick={onStart}>対戦する</OutlawButton>
    <div className="battle-top-attempts"><span>残り挑戦回数 <strong>{attempts} / 5</strong></span>{attempts < 5 && <button type="button" onClick={onRecover}>BP回復</button>}</div>
    {attempts < 5 && <small className="battle-top-recovery">{recovery ? `次回復 ${recovery}` : "回復時刻を同期中"}</small>}
  </section>;
}

export function RivalSelector({ rivals, selectedId, busy, onSelect, onRefresh, emptyTitle, emptyMessage }: {
  rivals: BattleTopRival[]; selectedId?: string; busy: boolean;
  onSelect: (id: string) => void; onRefresh: () => void; emptyTitle: string; emptyMessage: string;
}) {
  return <section className="battle-top-selector" aria-label="対戦相手選択">
    <div className="battle-top-section-heading"><h2>対戦相手を選ぶ</h2><OutlawButton variant="secondary" onClick={onRefresh} disabled={busy}>更新</OutlawButton></div>
    <div className="battle-top-rivals custom-scrollbar">
      {rivals.map(rival => <button type="button" key={rival.id} className="battle-top-rival" aria-pressed={rival.id === selectedId} disabled={busy} onClick={() => onSelect(rival.id)} data-opponent-user-id={rival.id}>
        <CharacterPresentation src={rival.image} alt={rival.leaderName} variant="full-body" metadata={false} />
        <span className="battle-top-rival-name">{rival.name}</span>
        <strong>{rival.power.toLocaleString()}</strong>
        <small>{rival.rank != null && rival.rank > 0 ? `#${rival.rank}` : "順位 —"}<span>{rival.id === selectedId ? "選択中" : "総合力"}</span></small>
      </button>)}
      {!rivals.length && <ScreenState kind="empty" compact title={emptyTitle} message={emptyMessage} />}
    </div>
  </section>;
}

export function RaidEntryCard({ active, bossName, seconds, onOpen }: { active: boolean; bossName: string; seconds: number; onOpen: () => void }) {
  const remaining = Math.max(0, Math.floor(seconds));
  const time = [Math.floor(remaining / 3600), Math.floor(remaining / 60) % 60, remaining % 60].map(value => String(value).padStart(2, "0")).join(":");
  return <section className="battle-top-raid" aria-label="レイド入口">
    <div><small>RAID{active && <span>LIVE</span>}</small><h2>{active ? bossName : "レイド"}</h2><p>{active ? `強敵出現中 · 残り ${time}` : "開催情報を確認"}</p></div>
    <OutlawButton variant="secondary" onClick={onOpen}>レイドへ</OutlawButton>
  </section>;
}

export function BattleRankingSummary({ rank, onOpen }: { rank?: number | null; onOpen: () => void }) {
  return <section className="battle-top-ranking" aria-label="Battleランキング"><div><h2>BATTLE RANKING</h2><strong>{rank != null && rank > 0 ? `#${rank}` : "—"}</strong></div><OutlawButton variant="secondary" onClick={onOpen}>ランキングを見る</OutlawButton></section>;
}

export function GuildBattleTeaser() {
  return <section className="battle-top-guild"><span>GUILD BATTLE</span><small>COMING SOON</small></section>;
}
