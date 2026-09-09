"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useAudio } from "@/audio/AudioProvider";
import { raidResultHeadline } from "@/domain/raidResultPresentation";
import { analyzeBattleResult, type BattleResultParticipant, type BattleResultReplayEvent } from "@/domain/presentation/battleResultScoring";
import { canonicalItemName } from "@/domain/gameplay/canonical/items";
import { CHARACTERS_MASTER, getCharacterTransparentImg } from "@/utils/game_constants";
import type { BattleModeResultDetail, BattlePresentationContext } from "@/hooks/useBattle";

import RaidResultDetails from "../raid/RaidResultDetails";
import OutlawButton from "../ui/OutlawButton";
import CharacterPresentation from "../character/CharacterPresentation";
import CanonicalItemIcon from "../ui/CanonicalItemIcon";
import "./BattleResultSummary.css";
import "./StreetFlow.css";
import { resolveCharacterGachaQuote } from "@/domain/presentation/characterGachaQuotes";

type Props = {
  victory: boolean;
  tutorial?: boolean;
  rewards?: any | null;
  replayEvents?: readonly BattleResultReplayEvent[];
  playerParticipants?: readonly any[];
  enemyParticipants?: readonly any[];
  presentationContext?: BattlePresentationContext | null;
  modeResult?: BattleModeResultDetail | null;
  displayedRound?: number;
  onContinue: () => void | Promise<void>;
  continueControl?: ReactNode;
};

const toParticipant = (entry: any, isEnemy: boolean): BattleResultParticipant => ({
  id: String(entry.id),
  characterId: String(entry.characterId ?? entry.id),
  name: String(entry.name ?? entry.characterId ?? entry.id),
  isEnemy,
});

export default function BattleResultSummary({ victory, tutorial = false, rewards, replayEvents = [], playerParticipants = [], enemyParticipants = [], presentationContext, modeResult, displayedRound, onContinue, continueControl }: Props) {
  const { playSe } = useAudio();
  const announcedRef = useRef(false);
  const analysis = useMemo(() => analyzeBattleResult(
    replayEvents,
    [...playerParticipants.map((entry) => toParticipant(entry, false)), ...enemyParticipants.map((entry) => toParticipant(entry, true))],
  ), [enemyParticipants, playerParticipants, replayEvents]);
  const mvp = analysis.mvp;
  const [displayedTotal, setDisplayedTotal] = useState(0);
  const [displayedBreakdown, setDisplayedBreakdown] = useState({ damage: 0, kills: 0, heal: 0, shield: 0, survival: 0 });
  const mvpMaster = CHARACTERS_MASTER.find((entry: any) => entry.id === mvp?.participant.characterId);
  const mvpImage = mvpMaster ? getCharacterTransparentImg(mvpMaster.name) : undefined;
  const opponentLeader = enemyParticipants.find((entry: any) => String(entry.characterId ?? entry.id) === presentationContext?.opponentLeaderCharacterId) || enemyParticipants[0];
  const rawOpponentLabel = presentationContext?.encounterLabel || presentationContext?.opponentLabel || opponentLeader?.name || "対戦相手";
  const opponentLabel = rawOpponentLabel === "Canonical NPC Party" ? "新宿・初級" : rawOpponentLabel;
  const localizedResultLabel = tutorial
    ? (victory ? "クエストクリア" : "クエスト失敗")
    : modeResult?.resultLabel;
  const isRaidResult = presentationContext?.mode === "RAID";
  const raidReceipt = isRaidResult && modeResult?.raidReceipt && modeResult.raidReceipt.roomId === presentationContext?.raidRoomId ? modeResult.raidReceipt : undefined;
  const roomHeadline = isRaidResult && presentationContext?.raidRoomId ? raidResultHeadline(raidReceipt, presentationContext.raidRoomId) : null;
  const isStreetResult = !isRaidResult || Boolean(presentationContext?.raidRoomId);
  const resultEvent = [...replayEvents].reverse().find((event) => event.type === "RESULT");
  const resultReasonKey = String(resultEvent?.payload.reason ?? resultEvent?.payload.resultReason ?? resultEvent?.payload.endReason ?? "").toUpperCase();
  const eventRound = (event: BattleResultReplayEvent | undefined) => Math.max(0, Number((event as { round?: number } | undefined)?.round ?? 0));
  const eventIndex = (event: BattleResultReplayEvent | undefined, fallback: number) => Math.max(0, Number((event as { index?: number } | undefined)?.index ?? fallback));
  const resultEventArrayIndex = resultEvent ? replayEvents.lastIndexOf(resultEvent) : -1;
  const canonicalFinalRound = Math.max(0, Number(resultEvent?.payload.rounds ?? 0), ...replayEvents.map(eventRound));
  const configuredRoundLimit = Math.max(1, Number(presentationContext?.roundLimit ?? (presentationContext?.mode === "RAID" ? 30 : presentationContext?.mode === "PVP" || presentationContext?.mode === "PVP_PRACTICE" || presentationContext?.mode === "GVG" ? 20 : 15)));
  const explicitRoundLimit = /ROUND|TIME|LIMIT/.test(resultReasonKey);
  const roundLimitResult = !victory
    && canonicalFinalRound >= configuredRoundLimit
    && (explicitRoundLimit || resultReasonKey.length === 0);
  const finalRoundFor = (types: readonly string[]) => Math.max(0, ...replayEvents.filter((event) => types.includes(event.type)).map(eventRound));
  useEffect(() => {
    if (announcedRef.current) return;
    announcedRef.current = true;
    if (roomHeadline === '討伐成功') playSe('VICTORY');
    else if (!roomHeadline) playSe(victory ? "VICTORY" : "DEFEAT");
  }, [playSe, victory, roomHeadline]);
  useEffect(() => {
    if (!victory || (!rewards && !modeResult?.reward)) return;
    const timer = window.setTimeout(() => playSe("REWARD"), 1280);
    return () => window.clearTimeout(timer);
  }, [modeResult?.reward, playSe, rewards, victory]);
  useEffect(() => {
    const target = mvp?.score.total ?? 0;
    setDisplayedTotal(0);
    if (target <= 0) return;
    const startedAt = performance.now();
    const timer = window.setInterval(() => {
      const progress = Math.min(1, (performance.now() - startedAt) / 420);
      setDisplayedTotal(Math.round(target * progress));
      if (progress >= 1) window.clearInterval(timer);
    }, 28);
    return () => window.clearInterval(timer);
  }, [mvp?.participant.id, mvp?.score.total]);
  useEffect(() => {
    const target = mvp?.score;
    setDisplayedBreakdown({ damage: 0, kills: 0, heal: 0, shield: 0, survival: 0 });
    if (!target) return;
    const keys = ["damage", "kills", "heal", "shield", "survival"] as const;
    const startedAt = performance.now() + 520;
    let frame = 0;
    const tick = () => {
      const now = performance.now();
      const next = { damage: 0, kills: 0, heal: 0, shield: 0, survival: 0 };
      keys.forEach((key, index) => {
        const progress = Math.max(0, Math.min(1, (now - startedAt - index * 90) / 180));
        next[key] = Math.round(target[key] * progress);
      });
      setDisplayedBreakdown(next);
      if (now < startedAt + (keys.length - 1) * 90 + 180) frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [mvp?.participant.id, mvp?.score.damage, mvp?.score.heal, mvp?.score.kills, mvp?.score.shield, mvp?.score.survival]);
  return (
    <section
      className={`battle-result-summary ${roomHeadline ? (roomHeadline === '討伐成功' ? 'is-victory' : 'is-raid-neutral') : victory ? "is-victory" : "is-defeat"} ${isStreetResult ? "sf-root sf-screen sf-live-result" : ""}`}
      style={isStreetResult && presentationContext?.backgroundPath ? {"--battle-background-image":`url(\'${presentationContext.backgroundPath}\')`} as React.CSSProperties : undefined}
      aria-label={roomHeadline ?? (victory ? "バトル勝利" : "バトル敗北")}
      data-result-event-index={resultEvent ? eventIndex(resultEvent, resultEventArrayIndex) : undefined}
      data-result-event-round={resultEvent ? eventRound(resultEvent) : undefined}
      data-displayed-round={displayedRound}
      data-configured-round-limit={configuredRoundLimit}
      data-canonical-final-round={canonicalFinalRound}
      data-result-reason-authority={resultReasonKey || "UNSPECIFIED"}
      data-result-winner={String(resultEvent?.payload.winner ?? "")}
      data-final-action-round={finalRoundFor(["ACTION"])}
      data-final-damage-status-defeat-round={finalRoundFor(["DAMAGE", "STATUS", "DEFEAT"])}
    >
      {!isStreetResult ? <>      <header className="battle-result-opponent">
        <small>{tutorial ? "VS" : "VS 対戦相手"}</small>
        <strong>{opponentLabel}</strong>
        {presentationContext?.opponentLeaderName && <span>敵リーダー　{presentationContext.opponentLeaderName}</span>}
        {presentationContext?.opponentTotalPower ? <b>POWER {presentationContext.opponentTotalPower.toLocaleString()}</b> : presentationContext?.opponentProfile ? <b>{presentationContext.opponentProfile}</b> : null}
      </header>
      {!tutorial && <div className="battle-result-outcome-label">{victory ? "WIN" : "LOSE"}</div>}
      {roundLimitResult && <div className="battle-result-reason" data-result-reason="ROUND_LIMIT" role="status">
        <small>ROUND LIMIT</small>
        <strong>制限ラウンド終了</strong>
        <span>全滅ではなく、制限ラウンド到達による判定結果です</span>
      </div>}
      {localizedResultLabel && <strong className="battle-result-mode-label">{localizedResultLabel}</strong>}
      {isRaidResult && modeResult?.stats?.length ? <section className="battle-result-mode-stats is-raid" aria-label="レイド戦績">
        {modeResult.stats.map((stat) => <div key={stat.label}><small>{stat.label}</small><strong>{stat.value}</strong></div>)}
      </section> : null}
      {!isRaidResult && mvp && (
        <section className="battle-result-mvp" aria-label={`MVP ${mvp.participant.name} ${mvp.score.total}ポイント`}>
          <div className="battle-result-mvp-hero">
            {mvpImage && <CharacterPresentation src={mvpImage} alt={mvp.participant.name} variant="dialogue-bust" className="battle-result-mvp-character" />}
            <div className="battle-result-mvp-copy"><small>MVP</small><div><strong>{mvp.participant.name}</strong><b>{displayedTotal}<i>PT</i></b></div></div>
          </div>
          <dl className="battle-result-score-grid" aria-label="MVPスコア内訳">
            <div><dt>与ダメージ</dt><dd><b>{displayedBreakdown.damage}</b> / 40<small>{mvp.raw.damage.toLocaleString()}</small></dd></div>
            <div><dt>撃破</dt><dd><b>{displayedBreakdown.kills}</b> / 20<small>{mvp.raw.kills}体</small></dd></div>
            <div><dt>回復</dt><dd><b>{displayedBreakdown.heal}</b> / 20<small>{mvp.raw.heal.toLocaleString()}</small></dd></div>
            <div><dt>シールド</dt><dd><b>{displayedBreakdown.shield}</b> / 15<small>{mvp.raw.shield.toLocaleString()}</small></dd></div>
            <div><dt>生存</dt><dd><b>{displayedBreakdown.survival}</b> / 5<small>{mvp.raw.survived ? "生存" : "戦闘不能"}</small></dd></div>
          </dl>
        </section>
      )}
      {!isRaidResult && modeResult?.stats?.length ? <section className="battle-result-mode-stats" aria-label="モード戦績">
        {modeResult.stats.map((stat) => <div key={stat.label}><small>{stat.label}</small><strong>{stat.value}</strong></div>)}
      </section> : null}
      {!isRaidResult && mvp && (
        <section className="battle-result-comparison" aria-label="チーム戦果比較">
          <header><span>味方</span><b>戦果比較</b><span>敵</span></header>
          <div><b>{analysis.player.damage.toLocaleString()}</b><span>総ダメージ</span><b>{analysis.enemy.damage.toLocaleString()}</b></div>
          <div><b>{analysis.player.kills}</b><span>撃破数</span><b>{analysis.enemy.kills}</b></div>
          <div><b>{analysis.player.survivors}</b><span>生存人数</span><b>{analysis.enemy.survivors}</b></div>
        </section>
      )}
</> : <>
        <header className={`sf-heading sf-outcome ${roomHeadline || victory ? "" : "loss"}`}><small>{opponentLabel}</small><h1>{roomHeadline ?? (victory ? "VICTORY" : "DEFEAT")}</h1><p>{roomHeadline ? "共有レイドの確定結果" : localizedResultLabel || (victory ? "バトル勝利" : "バトル敗北")}</p></header>
        {roundLimitResult && <p className="battle-result-reason" data-result-reason="ROUND_LIMIT" role="status">制限ラウンド終了による判定結果です</p>}
        {mvp && <><section className="sf-mvp" aria-label={`MVP ${mvp.participant.name} ${mvp.score.total}ポイント`}>{mvpImage && <img src={mvpImage} alt={mvp.participant.name}/>}<div className="sf-mvp-copy"><small>MVP</small><h2>{mvp.participant.name}</h2><strong>{displayedTotal}<span> PT</span></strong><p>{mvpMaster && resolveCharacterGachaQuote(mvpMaster.id)}</p></div></section>
        <div className="sf-highlights"><div><small>与ダメージ</small><b>{mvp.raw.damage.toLocaleString()}</b></div><div><small>撃破</small><b>{mvp.raw.kills}<span>体</span></b></div><div><small>回復</small><b>{mvp.raw.heal.toLocaleString()}</b></div></div></>}
        {isRaidResult ? <RaidResultDetails victory={victory} modeResult={modeResult} roomState={raidReceipt?.roomState} lateFinalization={raidReceipt?.lateFinalization} /> : modeResult?.stats?.length ? <section className="battle-result-mode-stats" aria-label="モード戦績">{modeResult.stats.map(stat=><div key={stat.label}><small>{stat.label}</small><strong>{stat.value}</strong></div>)}</section> : null}
        {!victory && !isRaidResult && <p className="sf-loss-advice">編成・装備スキル・作戦を見直して再挑戦しましょう。</p>}
        {mvp && <details className="sf-details"><summary>戦績・MVPスコアの詳細</summary><section className="sf-breakdown"><h2>MVPスコア内訳</h2><dl><div><dt>与ダメージ</dt><dd>{displayedBreakdown.damage} / 40</dd></div><div><dt>撃破</dt><dd>{displayedBreakdown.kills} / 20</dd></div><div><dt>回復</dt><dd>{displayedBreakdown.heal} / 20</dd></div><div><dt>シールド</dt><dd>{displayedBreakdown.shield} / 15</dd></div><div><dt>生存</dt><dd>{displayedBreakdown.survival} / 5</dd></div></dl><h2>チーム戦果比較</h2><p>総ダメージ　味方 {analysis.player.damage.toLocaleString()} / 敵 {analysis.enemy.damage.toLocaleString()}</p><p>撃破数　味方 {analysis.player.kills} / 敵 {analysis.enemy.kills}</p><p>生存人数　味方 {analysis.player.survivors} / 敵 {analysis.enemy.survivors}</p></section></details>}
      </>}
      {victory && (tutorial || presentationContext?.mode === "PATROL") ? (
        rewards ? (
          <div className="battle-result-canonical-rewards" aria-label="獲得報酬">
            {Number(rewards.totalCash || 0) > 0 && <span>
              <img src="/ui/icon_cash.png" alt="" />
              <b>CASH</b>
              <em>×{Number(rewards.totalCash).toLocaleString()}</em>
            </span>}
            {Number(rewards.totalXp || 0) > 0 && <span>
              <span aria-hidden="true">XP</span>
              <b>PLAYER XP</b>
              <em>×{Number(rewards.totalXp).toLocaleString()}</em>
            </span>}
            {rewards.dropItemName && Number(rewards.dropItemQty || 0) > 0 && <span>
              <CanonicalItemIcon itemId={String(rewards.dropItemName)} alt={canonicalItemName(String(rewards.dropItemName))} />
              <b>{canonicalItemName(String(rewards.dropItemName))}</b>
              <em>×{Number(rewards.dropItemQty).toLocaleString()}</em>
            </span>}
          </div>
        ) : <div className="battle-result-settling" role="status"><span>報酬データを準備中</span><i aria-hidden="true" /></div>
      ) : isRaidResult && presentationContext?.raidRoomId ? null : (
        <div className="battle-result-mode-reward">
          <strong>{modeResult?.reward || (victory ? "勝利" : "敗北")}</strong>
          {modeResult?.rewards?.length ? <div className="battle-result-canonical-rewards" aria-label="獲得報酬">{modeResult.rewards.map((reward) => <span key={`${reward.id}-${reward.quantity}`}>
            <CanonicalItemIcon itemId={reward.id} alt={reward.name} />
            <b>{reward.name}</b>
            <em>×{reward.quantity.toLocaleString()}</em>
          </span>)}</div> : null}
          {modeResult?.note && <p>{modeResult.note}</p>}
        </div>
      )}
      {continueControl ?? <OutlawButton variant={victory ? "primary" : "secondary"} onClick={onContinue} className="battle-result-continue" disabled={victory && (tutorial || presentationContext?.mode === "PATROL") && !rewards}>
        {victory && (tutorial || presentationContext?.mode === "PATROL") ? (rewards ? "次へ" : "報酬確定中…") : modeResult?.continueLabel || "次へ"}
      </OutlawButton>}
    </section>
  );
}
