"use client";

import React, { useState, useEffect, useRef } from "react";
import { raidResultHeadline } from "@/domain/raidResultPresentation";
import { useGame } from "../context/GameContext";
import { CHARACTERS_MASTER, getCharacterTransparentImg } from "@/utils/game_constants";
import StreetBattleSetup from "./battle/StreetBattleSetup";
import QuestBattleViewer from "./battle/QuestBattleViewer";
import BattleResultSummary from "./battle/BattleResultSummary";
import BattleMatchupPresentation from "./battle/BattleMatchupPresentation";
import { preloadBattleEffects } from "./battle/BattleEffectPresentation";
import { preloadTutorialCompletionAssets } from "../lib/tutorialCompletionAssets";
import { CANONICAL_SKILL_VIEW } from "@/utils/skills_master_data";
import { parseCanonicalEffects } from "@/domain/battle/canonical_effects";
import PvpDeckPresentation from "./pvp/PvpDeckPresentation";
import RaidEnemyRoster from "./raid/RaidEnemyRoster";
import { SkillDetailDialog, SkillIconGrid } from "./skill/SkillPresentation";
import "./CardBattleView.css";

export default function CardBattleView() {
  const {
    battleMode,
    battleOpponentName,
    battleState,
    battleOutcome,
    tutorialBattleActive,
    tactic,
    setTactic,
    battleSpeed,
    setBattleSpeed,
    monthlyPassActive,
    isAutoPaused,
    setIsAutoPaused,
    setConfirmDialogConfig,
    playerPartyStates,
    enemyPartyStates,
    timeline,
    timelineIndex,
    battleRound,
    activeSkillCutIn,
    targetLine,
    activeShakingCharId,
    damagePopup,
    battleResultReplayEvents,
    battlePresentationContext,
    battleModeResultDetail,
    battleSkipPending,
    presentationPhase,
    actionPresentation,
    authoritativeTimeline,
    launchBattlePlaying,
    confirmPreparedPvpBattle,
    cancelPreparedPvpBattle,
    confirmPreparedRaidBattle,
    cancelPreparedRaidBattle,
    raidPoints,
    raidFirstEntryFree,
    skipBattlePresentation,
    endBattleSession,
    completeBattleResult,
    completeTutorialBattleResult,
    lastPatrolRewards,
    patrolCourses,
    requestQuestSelection,
    playCyberSe,
    handleFirstUserInteraction,
    playSe,
    preloadAudio
  } = useGame();
  const isRoomBattle = Boolean(battlePresentationContext?.raidRoomId);
  const roomMemberIds = isRoomBattle ? enemyPartyStates.map((enemy: any) => enemy.characterId) : undefined;
  const roomLeaderId = roomMemberIds?.[0];
  const roomLeader = CHARACTERS_MASTER.find(character => character.id === roomLeaderId);
  const isTutorialBattle = battleMode === "PATROL" && tutorialBattleActive;

  // SETUP画面でカードタップ時に開く閲覧専用詳細ポップアップ
  const [selectedOpponentSkill, setSelectedOpponentSkill] = useState<any | null>(null);
  const [setupLaunching, setSetupLaunching] = useState(false);

  const battleLaunchRef = useRef(false);

  useEffect(() => {
    preloadBattleEffects();
    preloadAudio({
      scene: "BATTLE",
      events: ["BATTLE_START", "BATTLE_ATTACK", "BATTLE_SLASH", "BATTLE_GUN", "BATTLE_SKILL", "BATTLE_DAMAGE", "BATTLE_CRITICAL", "BATTLE_WEAK", "BATTLE_BUFF", "BATTLE_DEBUFF", "VICTORY", "DEFEAT"],
    });
  }, [preloadAudio]);

  useEffect(() => {
    if (battleState === "SETUP") {
      battleLaunchRef.current = false;
      requestAnimationFrame(() => {
        setSetupLaunching(false);
        requestAnimationFrame(() => {
          const setup = document.querySelector<HTMLElement>(".tutorial-battle-setup");
          setup?.scrollTo({ top: 0 });
          setup?.querySelector<HTMLElement>(".setup-scroll-area")?.scrollTo({ top: 0 });
          if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
        });
      });
    }
  }, [battleState]);

  useEffect(() => {
    if (isTutorialBattle && battleState === "RESULT") {
      void preloadTutorialCompletionAssets();
    }
  }, [battleState, isTutorialBattle]);

  const launchBattleOnce = () => {
    if (battleLaunchRef.current) return;
    battleLaunchRef.current = true;
    setSetupLaunching(true);
    playSe("BATTLE_START");
    window.setTimeout(() => launchBattlePlaying(), 1600);
  };

  const launchRegularBattle = async () => {
    if (battleLaunchRef.current) return;
    battleLaunchRef.current = true;
    setSetupLaunching(true);
    if (battleMode === "PVP") {
      const committed = await confirmPreparedPvpBattle();
      if (!committed) {
        battleLaunchRef.current = false;
        setSetupLaunching(false);
        return;
      }
    } else if (battleMode === "RAID") {
      const committed = await confirmPreparedRaidBattle();
      if (!committed) {
        battleLaunchRef.current = false;
        setSetupLaunching(false);
        return;
      }
    }
    playSe("BATTLE_START");
    window.setTimeout(() => launchBattlePlaying(), battleMode === "RAID" && !isRoomBattle ? 1000 : 1600);
  };

  if (!battleMode || !battleState) return null;
  const battleBackgroundStyle = battlePresentationContext?.backgroundPath
    ? { "--battle-background-image": `url(${battlePresentationContext.backgroundPath})` } as React.CSSProperties
    : undefined;
  const getBattleCharacterImage = (characterId: string | undefined) => {
    const master = CHARACTERS_MASTER.find((character: any) => character.id === characterId || character.name === characterId);
    return master ? getCharacterTransparentImg(master.name) : undefined;
  };

  if (battleState === "ENDING" || battleState === "OUTCOME" || battleState === "RESULT") {
    const victory = battleOutcome === "VICTORY";
    const raidHeadline = battleMode === "RAID" && battlePresentationContext?.raidRoomId
      ? raidResultHeadline(battleModeResultDetail?.raidReceipt, battlePresentationContext.raidRoomId) : null;
    return (
      <div className={`battle-screen ${(battleMode !== "RAID" || isRoomBattle) ? "street-battle-screen" : ""} battle-ending-screen is-${battleState.toLowerCase()}`} style={battleBackgroundStyle} data-battle-outcome={battleOutcome || "PENDING"} data-acceptance-state={battleState === "ENDING" ? "B5" : battleState === "RESULT" ? "B6" : undefined}>
        <div className="battle-ending-backdrop" aria-hidden="true" />
        {battleState === "ENDING" ? (
          <div className="battle-ending-hold" role="status" aria-label="バトル終了演出">
            <span>FINAL</span>
            <i />
          </div>
        ) : battleState === "OUTCOME" ? (
          <div className={`battle-outcome-mark ${raidHeadline ? (raidHeadline === '討伐成功' ? 'is-victory' : 'is-raid-neutral') : victory ? "is-victory" : "is-defeat"}`} role="status">
            <span>バトル結果</span>
            <strong>{raidHeadline ?? (victory ? "WIN" : "LOSE")}</strong>
          </div>
        ) : (
          <BattleResultSummary
            victory={victory}
            tutorial={isTutorialBattle}
            rewards={battleMode === "PATROL" ? lastPatrolRewards : null}
            replayEvents={battleResultReplayEvents}
            playerParticipants={playerPartyStates}
            enemyParticipants={enemyPartyStates}
            presentationContext={battlePresentationContext}
            modeResult={battleModeResultDetail}
            displayedRound={battleRound}
            onRepeatQuest={!isTutorialBattle && battleMode === "PATROL" && lastPatrolRewards?.courseId && patrolCourses.some((course: any) => course.id === lastPatrolRewards.courseId) ? async () => {
              requestQuestSelection(lastPatrolRewards.courseId);
              await completeBattleResult();
            } : undefined}
            onContinue={isTutorialBattle ? completeTutorialBattleResult : completeBattleResult}
          />
        )}
      </div>
    );
  }

  // 1. SETUP 出撃準備画面
  if (battleState === "SETUP") {
    const enemyPower = enemyPartyStates.reduce((total: number, enemy: any) => {
      const stats = enemy.stats || {};
      return total + Number(enemy.maxHp || 0) + Number(stats.atk || 0) + Number(stats.def || 0);
    }, 0);
    const canonicalRaidBossSkills = (battlePresentationContext?.opponentSkills || []).slice(0, 6).map((skill: NonNullable<typeof battlePresentationContext>["opponentSkills"][number]) => {
      const sharedMaster = CANONICAL_SKILL_VIEW.find((entry) => entry.id === skill.id);
      if (sharedMaster) return sharedMaster;
      const effects = parseCanonicalEffects(skill.effects || []);
      const damage = effects.find((effect) => effect.type === "DAMAGE");
      const effectType = damage ? "ATTACK" : effects.some((effect) => effect.type === "HEAL" || effect.type === "REGEN") ? "HEAL"
        : effects.some((effect) => effect.type === "DEBUFF" || ["BLIND", "SILENCE", "STUN", "POISON", "BLEED", "TAUNT"].includes(effect.type)) ? "DEBUFF" : "BUFF";
      return {
        id: skill.id, name: skill.name, rarity: "N", alignment: "NONE" as const,
        power: Number(damage?.powerBp || 0) / 100, effect_type: effectType,
        is_exclusive: false, exclusive_character_id: null,
        description: (skill.effects || []).join(" / "), is_obtainable: true as const,
        activationType: (skill.activationType || "ACTIVE") as "ACTIVE",
        cooldown: skill.cooldown ?? null, availableFromRound: skill.availableFromRound ?? 1,
        target: skill.target || "ENEMY_SINGLE", effects,
      };
    });
    const playerPower = playerPartyStates.reduce((total: number, player: any) => total + Number(player.maxHp || 0) + Number(player.stats?.atk || 0) + Number(player.stats?.def || 0), 0);

    if (setupLaunching) {
      return <BattleMatchupPresentation
        playerLeader={playerPartyStates[0]}
        opponentLeader={enemyPartyStates[0]}
        context={roomLeader && battlePresentationContext ? {...battlePresentationContext, opponentLeaderCharacterId:roomLeader.id, opponentLeaderName:roomLeader.jpName} : battlePresentationContext}
        imageFor={getBattleCharacterImage}
        acceptanceState={isTutorialBattle ? "B2" : undefined}
      />;
    }

    if (battleMode === "RAID" && isRoomBattle) {
      const leader = roomLeader;
      return <div className="battle-screen street-battle-screen" onClick={handleFirstUserInteraction}><StreetBattleSetup playerParty={playerPartyStates} enemyParty={enemyPartyStates} enemyLeader={leader ? {characterId:leader.id,name:leader.jpName} : undefined} enemyDetails={<RaidEnemyRoster raidName={battleOpponentName} memberCharacterIds={roomMemberIds}/>} playerPower={playerPower} enemyPower={enemyPower} tutorial={false} mode="RAID" label={battleOpponentName} background={battlePresentationContext?.backgroundPath} tactic={tactic} onTactic={value=>setTactic(value as typeof tactic)} onStart={launchRegularBattle} startLabel="討伐開始" backLabel="レイドへ戻る" resourceLabel={raidFirstEntryFree ? "初回無料" : ("RP " + raidPoints + " / 5・開始時に1消費")} onBack={()=>{if(cancelPreparedRaidBattle())playSe("UI_BACK");}}/></div>;
    }

    if (battleMode === "RAID") {
      const boss = enemyPartyStates[0];
      return <><div className={`battle-screen ${(battleMode !== "RAID" || isRoomBattle) ? "street-battle-screen" : ""}`} onClick={handleFirstUserInteraction}>
        <div className="raid-battle-setup scroll-container" style={battleBackgroundStyle}>
          <header className="raid-battle-setup__header">
            <small>RAID BRIEFING</small>
            <strong>BATTLE READY</strong>
          </header>
          <main className="raid-battle-setup__body">
            <section className="raid-battle-target" aria-label="レイド対象">
              <div className="raid-battle-target__heading"><small>エネミーパーティ</small><strong>{battleOpponentName}</strong><span>Lv.{boss?.level || 1}</span></div>
              <RaidEnemyRoster raidName={battleOpponentName} />
              <dl><div><dt>HP</dt><dd>{Number(boss?.hp || 0).toLocaleString()} / {Number(boss?.maxHp || 0).toLocaleString()}</dd></div><div><dt>ATK</dt><dd>{Number(boss?.stats?.atk || 0).toLocaleString()}</dd></div><div><dt>DEF</dt><dd>{Number(boss?.stats?.def || 0).toLocaleString()}</dd></div></dl>
              {canonicalRaidBossSkills.length > 0 && <div className="raid-battle-boss-skills"><strong>スキル</strong><SkillIconGrid skills={canonicalRaidBossSkills} onSelect={setSelectedOpponentSkill} /></div>}
            </section>
            <section className="raid-battle-deck" aria-label="自分のデッキ">
              <header><strong>MY DECK</strong><span>総合力 {playerPower.toLocaleString()}</span></header>
              <PvpDeckPresentation ariaLabel="自分のデッキ" members={playerPartyStates.map((member: any, index: number) => ({
                key: member.id || `raid-player-${index}`,
                characterId: member.characterId,
                name: member.name,
                level: member.level,
              }))} />
            </section>
            <section className="raid-battle-resource" aria-label="レイド挑戦資源">
              <div><small>RAID POINT</small><strong>{raidFirstEntryFree ? "初回無料" : `${raidPoints} / 5`}</strong></div>
              <span>{raidFirstEntryFree ? "この挑戦ではRPを消費しません" : "討伐開始時にRPを1消費"}</span>
            </section>
          </main>
          <footer className="raid-battle-setup__actions">
            <button type="button" className="start-battle-btn semantic-cta semantic-cta--primary active-scale-effect" onClick={launchRegularBattle} disabled={setupLaunching} aria-busy={setupLaunching}>{setupLaunching ? "BATTLE START" : "討伐開始"}</button>
            <button type="button" className="cancel-battle-btn semantic-cta semantic-cta--secondary" disabled={setupLaunching} onClick={() => { if (cancelPreparedRaidBattle()) playSe("UI_BACK"); }}>レイドへ戻る</button>
          </footer>
        </div>
      </div>{selectedOpponentSkill && <SkillDetailDialog skill={selectedOpponentSkill} onClose={() => setSelectedOpponentSkill(null)} />}</>;
    }

    return <div className={`battle-screen ${(battleMode !== "RAID" || isRoomBattle) ? "street-battle-screen" : ""}`} onClick={handleFirstUserInteraction}><StreetBattleSetup playerParty={playerPartyStates} enemyParty={enemyPartyStates} playerPower={playerPower} enemyPower={enemyPower} tutorial={isTutorialBattle} mode={battleMode} label={battlePresentationContext?.encounterLabel || battleOpponentName} background={battlePresentationContext?.backgroundPath} tactic={tactic} onTactic={value=>setTactic(value as typeof tactic)} onStart={isTutorialBattle ? launchBattleOnce : launchRegularBattle} onBack={["PVP","PVP_PRACTICE","GVG"].includes(battleMode) ? ()=>{if(cancelPreparedPvpBattle())playSe("UI_BACK");} : undefined}/></div>;
  }

  // 2. PLAYING オート戦闘中画面
  return (
    <div className={`battle-screen ${(battleMode !== "RAID" || isRoomBattle) ? "street-battle-screen" : ""}`}>
      <QuestBattleViewer
        street={isRoomBattle || battleMode !== "RAID"}
        battleMode={battleMode}
        opponentName={battleOpponentName}
        playerParty={playerPartyStates}
        enemyParty={enemyPartyStates}
        timeline={timeline}
        timelineIndex={timelineIndex}
        authoritativeTimeline={authoritativeTimeline}
        presentationPhase={presentationPhase}
        actionPresentation={actionPresentation}
        round={battleRound}
        roundLimit={battlePresentationContext?.roundLimit}
        skillCutIn={activeSkillCutIn}
        targetLine={targetLine}
        shakingId={activeShakingCharId}
        damagePopup={damagePopup}
        tactic={tactic}
        speed={battleSpeed}
        monthlyPassActive={monthlyPassActive}
        paused={isAutoPaused}
        tutorial={isTutorialBattle}
        onSpeedChange={setBattleSpeed}
        onPauseChange={setIsAutoPaused}
        canSkip={!isTutorialBattle && ["PATROL", "PVP", "PVP_PRACTICE", "RAID"].includes(battleMode)}
        skipPending={battleSkipPending}
        onSkip={skipBattlePresentation}
        onSound={() => playCyberSe("click")}
        backgroundPath={battlePresentationContext?.backgroundPath}
        onRetreat={() => {
          setConfirmDialogConfig({
            isOpen: true,
            title: "撤退確認",
            message: "バトルから撤退しますか？（敗北扱いとなります）",
            onConfirm: () => { setConfirmDialogConfig(null); endBattleSession("DEFEAT"); },
            onCancel: () => setConfirmDialogConfig(null),
          });
        }}
      />
    </div>
  );

}
