"use client";

import React from "react";
import { useGame } from "../context/GameContext";
import "./PvpTab.css";
import { BattleHero, RivalSelector, RaidEntryCard, BattleRankingSummary, GuildBattleTeaser } from "./pvp/BattleTopPresentation";
import OutlawCard from "./ui/OutlawCard";
import HubPage from "./ui/HubPage";
import ScreenState from "./ui/ScreenState";
import { useScreenReadiness } from "../hooks/useScreenReadiness";
import { SCREEN_ASSET_MANIFESTS } from "../lib/screenManifests";
import { CHARACTERS_MASTER, getCharacterTransparentImg, getCanonicalBattleBackground } from "@/utils/game_constants";
import { getCharacterLocationBackground, resolveCharacterLocationKey } from "@/utils/characterVisualAssets";
import { supabase } from "@/utils/supabase";
import PvpDeckPresentation from "./pvp/PvpDeckPresentation";
import { SkillDetailDialog } from "./skill/SkillPresentation";
import type { SkillCardMaster } from "@/utils/skills_master_data";
import CanonicalDialog from "./ui/CanonicalDialog";
import { findCanonicalRaidVariant } from "@/domain/presentation/raidRosterPresentation";

const tacticNames: { [key: string]: string } = {
  ATTACK_PRIORITY: "攻撃優先",
  HEAL_PRIORITY: "回復優先",
  SKILL_PRIORITY: "スキル優先",
  BALANCED: "バランス",
  WEAKNESS_FOCUS: "弱点集中",
  // 保存済みデッキの表示互換
  OFFENSIVE: "攻撃優先",
  HEALING: "回復優先",
  TACTICAL: "弱点集中"
};

export default function PvpTab() {
  const {
    session,
    username,
    raidBossBaseId,
    selectedLeader,
    navigateTab,
    isRaidActive,
    raidBossName,
    raidBossSecondsLeft,
    pvpRate,
    pvpSubView,
    battleLoading,
    pvpOpponents,
    opponentsLoading,
    fetchPvpOpponents,
    userCharactersDbList,
    userSkillsList,
    startCardBattle,
    pvpRankings,
    setPvpRankings,
    playCyberSe,
    setActiveTab,
    setRankingActiveTab,
    pvpPoints,
    pvpNextRecoveryAt,
    totalPower,
    currentBaseId,
    selectedMembers,
    userItems,
    handleUseItem,
  } = useGame();

  const [deckDialog, setDeckDialog] = React.useState<"my" | "rival" | null>(null);
  const [clock, setClock] = React.useState(() => Date.now());
  const [selectedSkill, setSelectedSkill] = React.useState<SkillCardMaster | null>(null);
  const [bpDialog, setBpDialog] = React.useState<"shortage" | "recovery" | null>(null);
  const [matchRewards, setMatchRewards] = React.useState<Record<"VICTORY" | "DEFEAT", { cash: number; diamonds: number; xp: number }> | null>(null);
  const [firstPvpPending, setFirstPvpPending] = React.useState<boolean | null>(null);
  const initialOpponentFetchRef = React.useRef<string | null>(null);
  const rankingAuthorityKey = `${session?.user?.id || "signed-out"}:${pvpRate}`;
  const [rankingAuthority, setRankingAuthority] = React.useState<{ key: string; standing: { rankPosition: number; rankPoints: number } | null } | null>(null);
  const ownPvpStanding = rankingAuthority?.key === rankingAuthorityKey ? rankingAuthority.standing : undefined;
  const isInitialOpponentLoad = pvpSubView === "opponents" && opponentsLoading && pvpOpponents.length === 0;
  const readiness = useScreenReadiness({
    assets: SCREEN_ASSET_MANIFESTS.pvp,
    dataReady: !battleLoading && !isInitialOpponentLoad,
  });

  React.useEffect(() => {
    let cancelled = false;
    void supabase.from("pvp_match_rewards_master").select("result,cash_reward,diamond_reward,exp_reward").in("result", ["VICTORY", "DEFEAT"]).then(({ data, error }) => {
      if (cancelled || error || !Array.isArray(data)) return;
      const rewardFor = (result: "VICTORY" | "DEFEAT") => {
        const row = data.find((entry: any) => entry.result === result);
        return { cash: Number(row?.cash_reward || 0), diamonds: Number(row?.diamond_reward || 0), xp: Number(row?.exp_reward || 0) };
      };
      setMatchRewards({ VICTORY: rewardFor("VICTORY"), DEFEAT: rewardFor("DEFEAT") });
    });
    return () => { cancelled = true; };
  }, []);

  React.useEffect(() => {
    const userId = session?.user?.id;
    if (!userId) return;
    let cancelled = false;
    void supabase.from("user_funnel_milestones").select("milestone").eq("user_id", userId).eq("milestone", "first_pvp").maybeSingle().then(({ data, error }) => {
      if (!cancelled) setFirstPvpPending(error ? null : !data);
    });
    return () => { cancelled = true; };
  }, [session?.user?.id]);

  React.useEffect(() => {
    if (pvpPoints >= 5 || !pvpNextRecoveryAt) return;
    const timer = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [pvpNextRecoveryAt, pvpPoints]);

  React.useEffect(() => {
    const userId = session?.user?.id;
    if (!userId) return;
    let cancelled = false;
    void supabase.rpc("get_public_pvp_rankings", { p_daily: true, p_limit: 100, p_offset: 0 }).then(({ data, error }) => {
      if (cancelled || error || !Array.isArray(data)) return;
      const rows = data.map((row: any) => ({
        ...row,
        users: { username: row.username, avatar_url: row.avatar_url, guild_members: row.guild_id ? [{ guild_id: row.guild_id, guilds: row.guild_name ? { name: row.guild_name } : null }] : [] },
      }));
      setPvpRankings(rows);
      const ownRow = rows.find((row: any) => row.user_id === userId);
      setRankingAuthority({
        key: rankingAuthorityKey,
        standing: ownRow ? {
          rankPosition: Number(ownRow.rank_position),
          rankPoints: Number(ownRow.rank_points),
        } : null,
      });
    });
    return () => { cancelled = true; };
  }, [rankingAuthorityKey, session?.user?.id, setPvpRankings]);

  React.useEffect(() => {
    const userId = session?.user?.id;
    if (!userId || pvpSubView !== "opponents" || opponentsLoading || pvpOpponents.length > 0) return;
    const currentRate = ownPvpStanding?.rankPoints ?? pvpRate;
    const fetchKey = `${userId}:${currentRate}`;
    if (initialOpponentFetchRef.current === fetchKey) return;
    initialOpponentFetchRef.current = fetchKey;
    void fetchPvpOpponents(userId, currentRate);
  }, [fetchPvpOpponents, opponentsLoading, ownPvpStanding?.rankPoints, pvpOpponents.length, pvpRate, pvpSubView, session?.user?.id]);

  const displayedPvpRate = ownPvpStanding?.rankPoints ?? pvpRate;
  const displayedOpponents = React.useMemo(() => {
    if (!firstPvpPending) return pvpOpponents;
    const weaker = pvpOpponents.filter((opponent: any) => opponent.opponent_class === "WEAKER");
    return weaker.length > 0 ? weaker : pvpOpponents.filter((opponent: any) => Number(opponent.opponent_power || 0) < Number(totalPower || 0));
  }, [firstPvpPending, pvpOpponents, totalPower]);
  const rewardLabel = (result: "VICTORY" | "DEFEAT") => {
    const reward = matchRewards?.[result];
    if (!reward) return "報酬マスタを同期中";
    const entries = [reward.cash > 0 ? `CASH ${reward.cash.toLocaleString()}` : null, reward.diamonds > 0 ? `ダイヤ ${reward.diamonds.toLocaleString()}` : null, reward.xp > 0 ? `EXP ${reward.xp.toLocaleString()}` : null].filter(Boolean);
    return entries.length > 0 ? entries.join("・") : "勝敗報酬なし";
  };

  const recoveryCountdown = React.useMemo(() => {
    if (pvpPoints >= 5 || !pvpNextRecoveryAt) return null;
    const remaining = Math.max(0, new Date(pvpNextRecoveryAt).getTime() - clock);
    const seconds = Math.floor(remaining / 1000);
    return `${String(Math.floor(seconds / 3600)).padStart(2, "0")}:${String(Math.floor((seconds % 3600) / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  }, [clock, pvpNextRecoveryAt, pvpPoints]);

  const opponentCharactersFor = (opponent: any) => [...(opponent.defense_characters || [])]
    .sort((left: any, right: any) => Number(left.slot || 0) - Number(right.slot || 0));
  const myDeckCharacters = React.useMemo(() => {
    const ids = (selectedMembers || []).slice(0, 5);
    return ids.map((ownedId: string) => {
      const owned = userCharactersDbList.find((entry: any) => entry.character_id === ownedId);
      const master = CHARACTERS_MASTER.find((entry: any) => entry.id === ownedId);
      return { ownedId, owned, master };
    });
  }, [selectedMembers, userCharactersDbList]);
  const pvpBackgroundPath = resolveCharacterLocationKey(currentBaseId) ? getCharacterLocationBackground(currentBaseId) : undefined;

  const handleRefreshOpponents = async () => {
    playCyberSe("click");
    if (session?.user?.id) {
      await fetchPvpOpponents(session.user.id, displayedPvpRate, { refresh: true });
    }
  };

  const pvpTicketQuantity = Number((userItems || []).find((item: any) => item.item_id === "PVP_POINT_TICKET")?.quantity || 0);
  const openBpRecoveryDialog = () => setBpDialog("recovery");
  const openBpShortageDialog = () => setBpDialog("shortage");

  const handleNavigateToRanking = () => {
    playCyberSe("click");
    if (setActiveTab && setRankingActiveTab) {
      setActiveTab("ranking");
      setRankingActiveTab("pvp");
    }
  };


  const [selectedRivalId, setSelectedRivalId] = React.useState<string | null>(null);
  // Accepted側の初回PvP eligibilityで絞り込まれた候補だけを選択可能にする。
  const heroOpponent = displayedOpponents.find((op: any) => op.opponent_user_id === selectedRivalId) ?? displayedOpponents[0];
  const playerLeaderMaster = CHARACTERS_MASTER.find(character => character.id === selectedLeader);
  const rivals = displayedOpponents.map((op: any) => {
    const leader = opponentCharactersFor(op)[0];
    const master = CHARACTERS_MASTER.find(character => character.id === leader?.character_master_id);
    return { id: op.opponent_user_id, name: op.opponent_username, leaderName: leader?.display_name || master?.jpName || "対戦相手", image: master ? getCharacterTransparentImg(master.name) : leader?.asset_identifier, power: Number(op.opponent_power || 0), rate: op.opponent_points == null ? undefined : Number(op.opponent_points), winDelta: typeof op.win_rating_delta === "number" ? op.win_rating_delta : undefined, lossDelta: typeof op.loss_rating_delta === "number" ? op.loss_rating_delta : undefined, rank: op.opponent_rank };
  });
  const raidVariant = findCanonicalRaidVariant(undefined, raidBossName);
  const raidLeader = CHARACTERS_MASTER.find(character => character.id === raidVariant?.memberCharacterIds[0]);
  const raidImage = raidLeader ? getCharacterTransparentImg(raidLeader.name) : undefined;
  const handleStartSelectedRival = () => {
    const op = heroOpponent;
    if (!op || battleLoading || opponentsLoading) return;
    return pvpPoints < 1 ? openBpShortageDialog() : startCardBattle(
                            "PVP",
                            op.opponent_username,
                            op.opponent_user_id,
                            op.opponent_points,
                            op.tactic,
                            op.opponent_guild_main_alignment,
                            op.opponent_guild_sub_alignment,
                            op.defense_character_ids,
                            undefined,
                            undefined,
                            undefined,
                            {
                              opponentLabel: op.opponent_username,
                              opponentLeaderCharacterId: [...(op.defense_characters || [])].sort((a: any, b: any) => Number(a.slot || 0) - Number(b.slot || 0))[0]?.character_id,
                              opponentLeaderName: [...(op.defense_characters || [])].sort((a: any, b: any) => Number(a.slot || 0) - Number(b.slot || 0))[0]?.display_name,
                              opponentTotalPower: Number(op.opponent_power || 0),
                              backgroundPath: pvpBackgroundPath,
                              backgroundLabel: String(currentBaseId || ""),
                            }
                          );
  };

  return (
    <>
    <HubPage
      className="pvp-view"
      title="バトル"
      status={readiness.status}
      onRetry={readiness.retry}
      hideVisualHeader
    >
        <section className="pvp-hero" aria-label="バトル対戦">
          <img src="/promotion/battle_page_header.webp" alt="バトル" />
        </section>
        {pvpSubView === "opponents" && <>
          <BattleHero player={{ name: username || "—", leaderName: playerLeaderMaster?.jpName || "リーダー", rate: displayedPvpRate, image: playerLeaderMaster ? getCharacterTransparentImg(playerLeaderMaster.name) : undefined, power: Number(totalPower || 0) }} rival={rivals.find((rival: { id: string }) => rival.id === heroOpponent?.opponent_user_id)} background={pvpBackgroundPath} attempts={pvpPoints} recovery={recoveryCountdown} busy={battleLoading || opponentsLoading} onStart={handleStartSelectedRival} onRecover={openBpRecoveryDialog} onPlayerDeck={() => setDeckDialog("my")} onRivalDeck={() => setDeckDialog("rival")} />
          <RivalSelector rivals={rivals} selectedId={heroOpponent?.opponent_user_id} busy={battleLoading || opponentsLoading} onSelect={setSelectedRivalId} onRefresh={handleRefreshOpponents} emptyTitle={firstPvpPending ? "勝てる相手を探しています" : "対戦相手が見つかりません"} emptyMessage={firstPvpPending ? "更新して格下の相手を再検索してください。" : "時間を置いて更新してください。"} />
          <BattleRankingSummary rate={displayedPvpRate} rank={ownPvpStanding?.rankPosition} onOpen={handleNavigateToRanking} />
        </>}

        {battleLoading ? <ScreenState kind="loading" compact /> : (
          <div className="pvp-content-area">
            {pvpSubView === "opponents" && (
              <div className="opponents-subtab">
                <details className="pvp-rules-help">
                  <summary>公式戦・模擬戦のルール</summary>
                  <p><b>公式戦</b> BP 1消費・Rating変動あり</p>
                  <p><b>勝利</b> {rewardLabel("VICTORY")}</p>
                  <p><b>敗北</b> {rewardLabel("DEFEAT")}</p>
                  <p><b>模擬戦</b> 消費・報酬・Rating・Mission進捗なし</p>
                </details>


              </div>
            )}

            {pvpSubView === "daily" && (
              <div className="list-container flex flex-col gap-2">
                {[...pvpRankings].sort((a,b) => b.daily_wins - a.daily_wins).map((item, idx) => (
                  <OutlawCard key={item.user_id} className="flex justify-between items-center py-2 px-3">
                    <div className="font-bold">{idx+1}位. {item.users?.username || "NPC"}</div>
                    <div className="text-neon-cyan">勝利数: {item.daily_wins}回</div>
                  </OutlawCard>
                ))}
              </div>
            )}

            {pvpSubView === "season" && (
              <div className="flex flex-col gap-3">
                <div className="list-container flex flex-col gap-2">
                  {[...pvpRankings].sort((a,b) => b.rank_points - a.rank_points).map((item, idx) => (
                    <OutlawCard key={item.user_id} className="flex justify-between items-center py-2 px-3">
                      <div className="font-bold">{idx+1}位. {item.users?.username || "NPC"}</div>
                      <div className="text-neon-cyan">{item.rank_points} pt</div>
                    </OutlawCard>
                  ))}
                </div>
              </div>
            )}

          </div>
        )}
        <RaidEntryCard active={isRaidActive} bossName={raidBossName} seconds={raidBossSecondsLeft} image={raidImage} background={getCanonicalBattleBackground(raidBossBaseId)} onOpen={() => navigateTab("raid")} />
        <GuildBattleTeaser />
    </HubPage>
    {deckDialog && <CanonicalDialog title={deckDialog === "my" ? "MY DECK" : "RIVAL DECK"} onClose={() => setDeckDialog(null)} actions={[{ label: "閉じる", semantic: "secondary", onClick: () => setDeckDialog(null) }]}>
      <div className="battle-top-deck-dialog">
        <div className="battle-top-deck-summary"><strong>{deckDialog === "my" ? username || "—" : heroOpponent?.opponent_username || "—"}</strong><span>RATE {deckDialog === "my" ? displayedPvpRate.toLocaleString() : Number(heroOpponent?.opponent_points || 0).toLocaleString()}</span><span>総合力 {Number(deckDialog === "my" ? totalPower : heroOpponent?.opponent_power || 0).toLocaleString()}</span></div>
        {deckDialog === "my" ? <>        <section className="pvp-my-deck" aria-label="自分のデッキ">
          <div className="pvp-section-heading"><strong>MY DECK</strong><span>総合力 {Number(totalPower || 0).toLocaleString()}</span></div>
          <PvpDeckPresentation ariaLabel="自分の出撃メンバー" showSkills onSkillSelect={setSelectedSkill} members={myDeckCharacters.map(({ ownedId, owned, master }: any) => {
              const equippedSkills = (userSkillsList || []).filter((entry: any) => entry.equipped_character_id === owned?.id).map((entry: any) => entry.skill_card_id).filter(Boolean).slice(0, 6);
              return { key: ownedId, characterId: master?.id || ownedId, name: master?.jpName, level: Number(owned?.level || 1), skillIds: equippedSkills };
            })} />
          {myDeckCharacters.length === 0 && <span className="pvp-my-deck-empty">出撃編成を設定してください</span>}
        </section>
</> : heroOpponent ? <>
          <PvpDeckPresentation ariaLabel="相手のデッキ" members={opponentCharactersFor(heroOpponent).map((character: any) => ({ key: heroOpponent.opponent_user_id + "-" + character.slot, characterId: character.character_master_id, name: character.display_name, level: Number(character.level || 1), imageSrc: character.asset_identifier || undefined }))} />
          <p>作戦 {tacticNames[heroOpponent.tactic] || "攻撃優先"}</p>
        </> : <p>対戦相手を選択してください</p>}
      </div>
    </CanonicalDialog>}
    {selectedSkill && <SkillDetailDialog skill={selectedSkill} onClose={() => setSelectedSkill(null)} />}
    {bpDialog === "shortage" && <CanonicalDialog title="BPが不足しています" onClose={() => setBpDialog(null)} actions={[
      { label: "閉じる", semantic: "secondary", onClick: () => setBpDialog(null) },
      { label: "回復する", semantic: "primary", onClick: () => setBpDialog("recovery") },
    ]}>対戦にはBPが1必要です。{`\n`}ファイトチケットで回復できます。</CanonicalDialog>}
    {bpDialog === "recovery" && <CanonicalDialog title="BP回復" onClose={() => setBpDialog(null)} actions={pvpTicketQuantity > 0 ? [
      { label: "キャンセル", semantic: "secondary", onClick: () => setBpDialog(null) },
      { label: "1枚使用", semantic: "primary", onClick: () => { setBpDialog(null); void handleUseItem("PVP_POINT_TICKET"); } },
    ] : [{ label: "閉じる", semantic: "secondary", onClick: () => setBpDialog(null) }]}>
      <div className="pvp-bp-recovery-copy"><strong>ファイトチケット</strong><span>所持 ×{pvpTicketQuantity}</span><span>BP　{pvpPoints} / 5 → {Math.min(5, pvpPoints + 1)} / 5</span>{pvpTicketQuantity === 0 && <em>ファイトチケットを所持していません。</em>}</div>
    </CanonicalDialog>}
    </>
  );
}
