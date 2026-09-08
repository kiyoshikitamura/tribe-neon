"use client";

import React from "react";
import { canonicalItemName } from "@/domain/gameplay/canonical/items";
import { supabase } from "@/utils/supabase";
import { getCanonicalBattleAreaName, getCanonicalBattleBackground } from "@/utils/game_constants";
import { preloadAsset } from "../lib/screenAssets";
import { useGame } from "../context/GameContext";
import { useScreenReadiness } from "../hooks/useScreenReadiness";
import { SCREEN_ASSET_MANIFESTS } from "../lib/screenManifests";
import Badge from "./ui/Badge";
import CanonicalDialog from "./ui/CanonicalDialog";
import GlobalInteractionBlocker from "./ui/GlobalInteractionBlocker";
import HubPage from "./ui/HubPage";
import OutlawButton from "./ui/OutlawButton";
import OutlawCard from "./ui/OutlawCard";
import StatusMetric from "./presentation/StatusMetric";
import RaidRoomConnectedBrowser from "./raid/RaidRoomConnectedBrowser";
import type { RaidRoomBriefing } from "../../domain/raidRoomClient";
import RaidEnemyRoster from "./raid/RaidEnemyRoster";
import "./RaidTab.css";

type RaidDialog = "shortage" | "recovery" | "recovery-error" | "battle-background-error" | null;

export default function RaidTab() {
  const {
    startCardBattle, prepareRaidRoomBattle, setGlobalInteractionBlocking, playCyberSe, userLevel, raidPoints, raidFirstEntryFree,
    setRaidPoints, setRaidFirstEntryFree, userGuildMember, fetchGuildDetail, session, syncBootstrapData,
    raidTopRefreshRevision, raidRescueTarget, setShowInboxPanel, setInboxPanelTab, setPresents, setPresentsPrefetched,
  } = useGame();
  const presentOwnerRef = React.useRef(session?.user?.id);
  presentOwnerRef.current = session?.user?.id;
  const openRescuePresents = async () => {
    const userId = session?.user?.id;
    if (!userId) throw new Error("ログインを確認してください。");
    setGlobalInteractionBlocking(true);
    try {
      const { data, error } = await supabase.from("presents").select("*").eq("user_id", userId).order("sent_at", { ascending: false });
      if (error || !Array.isArray(data)) throw new Error("プレゼントを取得できませんでした。");
      if (presentOwnerRef.current !== userId) throw new Error("ログインが変更されました。");
      setPresents(data.map(present => ({
        id: String(present.id), title: present.message ? present.message.split(":")[0] : "配布アイテム",
        desc: present.message ? present.message.split(":")[1] || present.message : "",
        reward: `${canonicalItemName(present.item_id)} +${present.quantity}`, itemId: present.item_id, qty: present.quantity,
        expireText: Date.parse(present.expire_at) <= Date.now() ? "期限切れ" : `期限: ${new Date(present.expire_at).toLocaleString("ja-JP")}`,
        status: present.status, loading: false,
      })));
      setPresentsPrefetched(true);
      setInboxPanelTab("presents"); setShowInboxPanel(true);
    } finally { setGlobalInteractionBlocking(false); }
  };
  const readiness = useScreenReadiness({ assets: SCREEN_ASSET_MANIFESTS.raid });
  const [activeRaids, setActiveRaids] = React.useState<any[]>([]);
  const [selectedRaidId, setSelectedRaidId] = React.useState<string | null>(null);
  const [selfContribution, setSelfContribution] = React.useState<number | null>(null);
  const [recommendedGuilds, setRecommendedGuilds] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [errorMessage, setErrorMessage] = React.useState("");
  const [dialog, setDialog] = React.useState<RaidDialog>(null);
  const [recoveryLoading, setRecoveryLoading] = React.useState(false);
  const [raidTicketQuantity, setRaidTicketQuantity] = React.useState(0);
  const [battleBackgroundLoading, setBattleBackgroundLoading] = React.useState(false);
  const [projectionRevision, setProjectionRevision] = React.useState(0);
  const [now, setNow] = React.useState(() => Date.now());
  const battleEntryInFlightRef = React.useRef(false);

  const loadRaidTop = React.useCallback(async () => {
    setLoading(true);
    setErrorMessage("");
    const [{ data: raids, error: raidsError }, { data: attempt, error: attemptError }, { data: ticket }] = await Promise.all([
      supabase.rpc("get_active_raids"), supabase.rpc("get_current_raid_attempt_state"),
      supabase.from("user_items").select("quantity").eq("user_id", session?.user?.id || "").eq("item_id", "RAID_POINT_TICKET").maybeSingle(),
    ]);
    if (raidsError || attemptError) {
      setErrorMessage("レイド情報を取得できませんでした。時間をおいて、もう一度お試しください。");
      setLoading(false);
      return;
    }
    const nextRaids = Array.isArray(raids) ? raids : [];
    setActiveRaids(nextRaids);
    setSelectedRaidId((current) => current && nextRaids.some((raid: any) => raid.id === current) ? current : nextRaids[0]?.id ?? null);
    setRaidPoints?.(Number(attempt?.raidPoints ?? 0));
    setRaidFirstEntryFree?.(Boolean(attempt?.firstEntryFree));
    setRaidTicketQuantity(Number(ticket?.quantity || 0));
    setProjectionRevision((revision) => revision + 1);
    setLoading(false);
  }, [session?.user?.id, setRaidFirstEntryFree, setRaidPoints]);

  React.useEffect(() => { void loadRaidTop(); }, [loadRaidTop, raidTopRefreshRevision]);
  React.useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(timer); }, []);
  React.useEffect(() => {
    setSelfContribution(null);
    if (!selectedRaidId || !session?.user?.id) return;
    let current = true;
    void supabase.rpc("get_my_raid_contribution_v1", { p_instance_id: selectedRaidId }).then(({ data, error }) => {
      const contribution = Number(data?.contribution);
      if (current) setSelfContribution(!error && data?.contribution != null && Number.isFinite(contribution) && contribution >= 0 ? contribution : null);
    });
    return () => { current = false; };
  }, [projectionRevision, selectedRaidId, session?.user?.id]);
  React.useEffect(() => {
    if (userGuildMember) return;
    void supabase.rpc("get_recommended_guilds", { p_limit: 3 }).then(({ data }) => { if (Array.isArray(data)) setRecommendedGuilds(data); });
  }, [userGuildMember]);

  const selectedRaid = activeRaids.find((raid) => raid.id === selectedRaidId) ?? activeRaids[0];
  const displayHp = Number(selectedRaid?.currentHp || 0);
  const displayMaxHp = Number(selectedRaid?.maxHp || 0);
  const displaySeconds = selectedRaid?.expiresAt ? Math.max(0, Math.floor((new Date(selectedRaid.expiresAt).getTime() - now) / 1000)) : 0;
  const hpPercent = displayMaxHp > 0 ? Math.max(0, Math.min(100, displayHp / displayMaxHp * 100)) : 0;
  const baseName = getCanonicalBattleAreaName(selectedRaid?.baseId) || selectedRaid?.baseId || "夜の街";
  const isDefeated = Boolean(selectedRaid) && (displayHp <= 0 || selectedRaid.status === "DEFEATED");
  const isExpired = Boolean(selectedRaid) && displaySeconds <= 0;
  const canOpenBriefing = Boolean(selectedRaid?.id) && !isDefeated && !isExpired && userLevel >= 5;

  const formatTime = (seconds: number) => {
    if (seconds <= 0) return "終了";
    const hours = Math.floor(seconds / 3600), minutes = Math.floor((seconds % 3600) / 60), remainingSeconds = seconds % 60;
    return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${remainingSeconds.toString().padStart(2, "0")}`;
  };

  const openBriefing = async () => {
    playCyberSe("click");
    if (!raidFirstEntryFree && raidPoints <= 0) { setDialog("shortage"); return; }
    if (!canOpenBriefing || battleEntryInFlightRef.current) return;
    battleEntryInFlightRef.current = true;
    setBattleBackgroundLoading(true);
    try {
      const requestedBackground = getCanonicalBattleBackground(selectedRaid.baseId);
      const background = requestedBackground
        ? await preloadAsset({ src: requestedBackground, fallbackSrc: "/bg/bg_street_shinjuku.jpg", required: true })
        : null;
      if (!background?.resolvedSrc) {
        setDialog("battle-background-error");
        return;
      }
      await startCardBattle("RAID", selectedRaid.bossName, selectedRaid.id, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, {
        opponentLabel: selectedRaid.bossName,
        opponentProfile: selectedRaid.profileType || "BOSS",
        backgroundLabel: baseName,
        backgroundPath: background.resolvedSrc,
        opponentSkills: Array.isArray(selectedRaid.skillLoadout) ? selectedRaid.skillLoadout : [],
      });
    } finally {
      battleEntryInFlightRef.current = false;
      setBattleBackgroundLoading(false);
    }
  };

  const recoverRaidPoint = async () => {
    if (recoveryLoading || !session?.user?.id) return;
    setRecoveryLoading(true);
    const { error } = await supabase.rpc("use_action_resource_ticket", { p_item_id: "RAID_POINT_TICKET" });
    if (error) {
      setRecoveryLoading(false);
      setDialog("recovery-error");
      return;
    }
    await syncBootstrapData(session.user.id);
    await loadRaidTop();
    setRecoveryLoading(false);
    setDialog(null);
  };

  const openRoomBriefing = async (briefing: RaidRoomBriefing) => {
    const background = await preloadAsset({ src: getCanonicalBattleBackground(briefing.baseId || "") || "/bg/bg_street_shinjuku.jpg", fallbackSrc: "/bg/bg_street_shinjuku.jpg", required: true });
    if (!background.resolvedSrc) throw new Error("戦場の背景を取得できませんでした。");
    await prepareRaidRoomBattle(briefing, { opponentLabel: briefing.bossName || "レイド", backgroundPath: background.resolvedSrc, backgroundLabel: getCanonicalBattleAreaName(briefing.baseId || "") || "夜の街" });
  };

  return <>
    <HubPage className="raid-view" title="レイド" hideVisualHeader status={readiness.status} onRetry={readiness.retry}>
      {process.env.NEXT_PUBLIC_RAID_ROOM_UI_ENABLED === "true" && <RaidRoomConnectedBrowser
        key={`${session?.user?.id}:${raidRescueTarget?.revision ?? 0}`} rescueId={raidRescueTarget?.rescueId} userId={session?.user?.id}
        rpcClient={supabase} authorities={{ enableParticipation: true, enableCreation: true, enableRescue: true }}
        onOpenPresents={openRescuePresents}
        setInteractionBlocking={setGlobalInteractionBlocking} onBriefingReady={openRoomBriefing}
        onBattleReady={() => { throw new Error("出撃準備から開始してください。"); }} />}
      {loading ? <div className="raid-loading" role="status">レイド情報を取得中…</div> : errorMessage ? <OutlawCard className="raid-error"><p>{errorMessage}</p><OutlawButton variant="primary" onClick={() => void loadRaidTop()}>再読み込み</OutlawButton></OutlawCard> : activeRaids.length === 0 ? <OutlawCard className="raid-empty"><strong>現在開催中のレイドはありません</strong><p>次の開催情報が確定すると、ここに表示されます。</p></OutlawCard> : <>
        <div className="raid-target-tabs" role="tablist" aria-label="レイド対象">{activeRaids.map((raid) => <button key={raid.id} role="tab" aria-selected={raid.id === selectedRaid?.id} className={raid.id === selectedRaid?.id ? "is-active" : ""} onClick={() => setSelectedRaidId(raid.id)}>{getCanonicalBattleAreaName(raid.baseId) || raid.baseId}</button>)}</div>
        <OutlawCard className={`raid-boss-hero ${isDefeated || isExpired ? "raid-boss-ended" : ""}`}>
          <div className="raid-party-heading"><div><span>エネミーパーティ</span><strong>{selectedRaid?.bossName}</strong><small>Lv.{selectedRaid?.level || 1} ・ {baseName}</small></div><Badge tone={isDefeated || isExpired ? "neutral" : "danger"}>{isDefeated ? "討伐済み" : formatTime(displaySeconds)}</Badge></div>
          <RaidEnemyRoster bossMasterId={selectedRaid?.bossMasterId} raidName={selectedRaid?.bossName} />
          <div className="raid-hp-heading"><span>レイドHP</span><strong>{hpPercent.toFixed(1)}%</strong></div>
          <div className="raid-hp-bar-container" role="meter" aria-label="レイド残りHP" aria-valuemin={0} aria-valuemax={displayMaxHp} aria-valuenow={displayHp}><div className="raid-hp-bar-fill" style={{ width: `${hpPercent}%` }} /><span className="raid-hp-text">{displayHp.toLocaleString()} / {displayMaxHp.toLocaleString()}</span></div>
          <div className="raid-status-grid"><StatusMetric label="RAID POINT" value={raidFirstEntryFree ? "初回無料" : `${raidPoints} / 5`} /><StatusMetric label="CONTRIBUTION" value={selfContribution === null ? "—" : selfContribution.toLocaleString()} /></div>
          <OutlawButton variant="primary" fullWidth onClick={() => void openBriefing()} disabled={!canOpenBriefing || battleBackgroundLoading}>{userLevel < 5 ? "プレイヤーLv5以上で解放" : isDefeated ? "討伐済み" : isExpired ? "開催終了" : battleBackgroundLoading ? "戦場を準備中…" : "挑戦する"}</OutlawButton>
          {!raidFirstEntryFree && <small className="raid-cost-copy">討伐開始時にRPを1消費 ・ 2時間ごとに1回復</small>}
        </OutlawCard>
        <div className="raid-secondary-actions"><OutlawButton variant="secondary" onClick={() => void loadRaidTop()}>最新状態へ更新</OutlawButton></div>
        {!userGuildMember && recommendedGuilds.length > 0 && <OutlawCard className="raid-guild-suggestion"><div className="upgrade-card-title">おすすめTRIBE</div><p>ギルドで仲間とレイドに挑戦できます。</p>{recommendedGuilds.map((guild) => <button key={guild.guild_id} className="sub-btn active-scale-effect" onClick={() => void fetchGuildDetail(guild.guild_id)}>{guild.name}<span>{guild.member_count}/{guild.member_limit}人</span></button>)}</OutlawCard>}
      </>}
    </HubPage>
    {dialog === "shortage" && <CanonicalDialog title="RPが不足しています" onClose={() => setDialog(null)} actions={[{ label: "閉じる", semantic: "secondary", onClick: () => setDialog(null) }, { label: "回復する", semantic: "primary", onClick: () => setDialog("recovery") }]}>挑戦にはRPが1必要です。{`\n`}レイドチケットで1回復できます。</CanonicalDialog>}
    {dialog === "recovery" && <CanonicalDialog title="RP回復" onClose={() => !recoveryLoading && setDialog(null)} actions={raidTicketQuantity > 0 ? [{ label: "キャンセル", semantic: "secondary", onClick: () => setDialog(null), disabled: recoveryLoading }, { label: recoveryLoading ? "使用中…" : "1枚使用", semantic: "primary", onClick: () => void recoverRaidPoint(), disabled: recoveryLoading }] : [{ label: "閉じる", semantic: "secondary", onClick: () => setDialog(null) }]}><div className="raid-recovery-copy"><img src="/items/raid_point_ticket.png" alt="" /><strong>レイドチケット</strong><span>所持 ×{raidTicketQuantity}</span><span>RP　{raidPoints} / 5 → {Math.min(5, raidPoints + 1)} / 5</span>{raidTicketQuantity === 0 && <em>レイドチケットを所持していません。</em>}</div></CanonicalDialog>}
    {dialog === "recovery-error" && <CanonicalDialog title="RPを回復できませんでした" onClose={() => setDialog(null)} actions={[{ label: "閉じる", semantic: "secondary", onClick: () => setDialog(null) }]}>時間をおいて、もう一度お試しください。</CanonicalDialog>}
    {dialog === "battle-background-error" && <CanonicalDialog title="戦場を準備できませんでした" onClose={() => setDialog(null)} actions={[{ label: "閉じる", semantic: "secondary", onClick: () => setDialog(null) }]}>通信状態を確認して、もう一度お試しください。</CanonicalDialog>}
    <GlobalInteractionBlocker isBlocking={battleBackgroundLoading} />
  </>;
}
