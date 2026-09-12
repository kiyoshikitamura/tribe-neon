import React, { useEffect, useRef } from "react";
import { useGame } from "../context/GameContext";
import FullScreenPanel from "./ui/FullScreenPanel";
import SubTabNav from "./ui/SubTabNav";
import OutlawButton from "./ui/OutlawButton";
import { canonicalMissionRewardName } from "@/domain/gameplay/canonical/missions";
import CanonicalItemIcon from "./ui/CanonicalItemIcon";
import { battleDisplayText } from "@/domain/presentation/battleTerminology";
import "./MissionPanel.css";

const MISSION_STATUS_LABELS: Record<string, string> = {
  CLEAR: "受取可能",
  CLAIMED: "受取済",
  IN_PROGRESS: "進行中",
  LOCKED: "未達成",
};

export default function MissionPanel() {
  const {
    showMissionPanel,
    setShowMissionPanel,
    missionTab,
    setMissionTab,
    missions,
    handleClaimMission,
    handleClaimAllMissions,
    missionClaimLoading,
    playCyberSe,
    navigateTab,
    setShowTribeChatPanel
  } = useGame();
  const specialViewTrackedRef = useRef(false);

  useEffect(() => {
    if (!showMissionPanel || missionTab !== "SPECIAL" || specialViewTrackedRef.current) return;
    specialViewTrackedRef.current = true;
    const eventId = (missions || []).find((mission: any) => mission.category === "SPECIAL")?.eventId || null;
    if (eventId) void import("../../utils/supabase").then(({ supabase }) => supabase.rpc("record_mission_event_telemetry", {
      p_event_id: eventId,
      p_event_name: "special_tab_view",
      p_source: "mission_panel",
      p_mission_id: null,
      p_metadata: {},
    }));
  }, [missionTab, missions, showMissionPanel]);

  useEffect(() => {
    if (!showMissionPanel || missionTab !== "SPECIAL") specialViewTrackedRef.current = false;
  }, [missionTab, showMissionPanel]);

  if (!showMissionPanel) return null;

  const handleClose = () => {
    setShowMissionPanel(false);
  };

  const statusOrder: Record<string, number> = { CLEAR: 0, IN_PROGRESS: 1, LOCKED: 2, CLAIMED: 3 };
  const currentMissions = (missions || []).filter((m: any) => m.category === missionTab)
    .sort((left: any, right: any) => (statusOrder[left.status] ?? 9) - (statusOrder[right.status] ?? 9) || Number(left.display_order || 0) - Number(right.display_order || 0));
  const canClaim = (m: any) => m.status === "CLEAR" && !(m.eventClaimEndAt && new Date(m.eventClaimEndAt).valueOf() <= Date.now());
  const clearMissionsCount = currentMissions.filter(canClaim).length;
  const clearCounts = {
    DAILY: (missions || []).filter((m: any) => m.category === "DAILY" && canClaim(m)).length,
    NORMAL: (missions || []).filter((m: any) => m.category === "NORMAL" && canClaim(m)).length,
    SPECIAL: (missions || []).filter((m: any) => m.category === "SPECIAL" && canClaim(m)).length,
  };
  const specialCompletion = missionTab === "SPECIAL" ? currentMissions.find((mission: any) => mission.isCompletion) : null;
  const specialStandardMissions = missionTab === "SPECIAL" ? currentMissions.filter((mission: any) => !mission.isCompletion) : [];
  const specialCompletedCount = specialStandardMissions.filter((mission: any) => mission.status === "CLEAR" || mission.status === "CLAIMED").length;

  const renderMissionRewards = (mission: any) => {
    const rewards = Array.isArray(mission.rewards) && mission.rewards.length > 0
      ? mission.rewards
      : [{ itemId: mission.reward_item, quantity: mission.reward_amount }];
    return <div className="mission-reward">
      <span>REWARD</span>
      {rewards.filter((reward: any) => Number(reward.quantity || 0) > 0).map((reward: any, index: number) => <React.Fragment key={`${reward.itemId}-${index}`}>
        <CanonicalItemIcon itemId={reward.itemId} alt="" className="mission-reward-art" />
        <strong>{canonicalMissionRewardName(String(reward.itemId || ""))} × {Number(reward.quantity || 0).toLocaleString()}</strong>
      </React.Fragment>)}
      {Number(mission.cashReward || 0) > 0 && <><CanonicalItemIcon itemId="CASH" alt="" className="mission-reward-art" /><strong>キャッシュ × {Number(mission.cashReward).toLocaleString()}</strong></>}
    </div>;
  };

  const handleMissionCta = (mission: any) => {
    playCyberSe("click");
    void import("../../utils/supabase").then(({ supabase }) => supabase.rpc("record_client_funnel_event", {
      p_event_name: "mission_cta_click",
      p_source_screen: "mission",
      p_source_cta: mission.id,
      p_object_id: null,
      p_metadata: { cta_tab: mission.ctaTab, cta_action: mission.ctaAction }
    }));
    setShowMissionPanel(false);
    if (mission.ctaAction === "guild_chat") setShowTribeChatPanel(true);
    else if (mission.ctaTab) navigateTab(mission.ctaTab);
  };

  const isMilestone = (m: any) => m.triggerType === "DAILY_MISSION_COMPLETED_COUNT";
  const standards = currentMissions.filter((m: any) => !isMilestone(m) && !m.isCompletion);
  const completed = standards.filter((m: any) => ["CLEAR", "CLAIMED"].includes(m.status)).length;
  const received = standards.filter((m: any) => m.status === "CLAIMED");
  const available = standards.filter((m: any) => m.status === "CLEAR");
  const pending = standards.filter((m: any) => m.status === "IN_PROGRESS");
  const fallbackCta = (m: any) => {
    if (m.ctaTab || m.ctaAction) return m;
    const type = String(m.triggerType || "");
    const route = type.includes("GACHA") ? ["gacha", "ガチャへ"]
      : /CHARACTER|SKILL|EQUIPMENT/.test(type) ? ["character", "キャラへ"]
      : type.startsWith("QUEST") ? ["patrol", "クエストへ"]
      : type.startsWith("PVP") ? ["pvp", "バトルへ"]
      : type.startsWith("RAID") ? ["raid", "レイドへ"]
      : type.startsWith("GUILD") ? ["guild", "ギルドへ"] : null;
    return route ? { ...m, ctaTab: route[0], ctaLabel: route[1] } : m;
  };
  const dateLabel = (value: string) => {
    const date = new Date(value);
    return Number.isNaN(date.valueOf()) ? "確認中" : date.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
  };
  const renderRow = (mission: any, showNext = false): React.ReactNode => {
    const m = fallbackCta(mission);
    const expired = Boolean(m.eventClaimEndAt && new Date(m.eventClaimEndAt).valueOf() <= Date.now());
    const eventEnded = m.category === "SPECIAL" && m.eventProgressOpen === false;
    const target = Math.max(1, Number(m.target_value || 1));
    const progress = Math.max(0, Number(m.current_progress || 0));
    const title = m.triggerType === "QUEST_COMPLETE_COUNT" && m.title === "派遣に出よう" ? `クエストを${target}回完了する` : battleDisplayText(m.title);
    const description = battleDisplayText(m.description || "");
    const next = currentMissions.filter((n: any) => n.prerequisiteMissionId === m.id && n.status === "LOCKED");
    return <article key={m.id} className={`mission-item ${m.status}`}>
      <div className="mission-info">
        <div className="mission-title">{title}</div>
        {description && description !== battleDisplayText(m.title) && description !== title && <div className="mission-desc">{description}</div>}
        <div className="mission-row-bottom">
          {renderMissionRewards(m)}
          <div className="mission-action">
            {m.status === "CLAIMED" ? <span className="mission-status">受取済み</span>
              : expired ? <OutlawButton disabled>受取期間終了</OutlawButton>
              : m.status === "CLEAR" ? <OutlawButton variant="primary" disabled={missionClaimLoading || m.loading} isLoading={Boolean(m.loading)} loadingLabel="" onClick={() => handleClaimMission(m.id)}>受け取る</OutlawButton>
              : eventEnded ? <OutlawButton disabled>挑戦期間終了</OutlawButton>
              : isMilestone(m) ? <OutlawButton disabled>あと{Math.max(0, target - completed)}件</OutlawButton>
              : m.status === "LOCKED" ? <span className="mission-status">前段階の受取で解放</span>
              : m.ctaTab || m.ctaAction ? <OutlawButton onClick={() => handleMissionCta(m)}>{m.ctaLabel || "挑戦する"}</OutlawButton>
              : <span className="mission-status">{MISSION_STATUS_LABELS[m.status] || "進行中"}</span>}
          </div>
        </div>
        {m.status === "IN_PROGRESS" && !isMilestone(m) && <div className="mission-progress-line"><progress max={target} value={Math.min(target, progress)} aria-label={`${title}の進捗`} /><span>{progress.toLocaleString()} / {target.toLocaleString()}</span></div>}
        {showNext && next.length > 0 && <details className="mission-next"><summary>次の目標</summary>{next.map((n: any) => <div key={n.id}><p>{battleDisplayText(n.title)}</p>{renderMissionRewards(n)}</div>)}</details>}
      </div>
    </article>;
  };
  const event = currentMissions.find((m: any) => m.eventId);
  return (
    <FullScreenPanel title="ミッション" onClose={handleClose} closeDisabled={missionClaimLoading}>
      <fieldset className="mission-panel-container-inner mission-operation-surface" disabled={missionClaimLoading} aria-busy={missionClaimLoading}>
        <SubTabNav tabs={[
          { id: "DAILY", label: "デイリー", badge: clearCounts.DAILY },
          { id: "NORMAL", label: "通常", badge: clearCounts.NORMAL },
          { id: "SPECIAL", label: "スペシャル", badge: clearCounts.SPECIAL },
        ]} activeTabId={missionTab} onSelect={(id) => setMissionTab(id as any)} />
        {missionTab === "DAILY" && standards.length > 0 && <section className="mission-overview">
          <div className="mission-overview-heading"><strong>本日 {completed} / {standards.length} 達成</strong><small>毎日 0:00 JST 更新</small></div>
          <progress max={standards.length} value={completed} aria-label="本日の達成数" />
          {completed === standards.length && <p role="status">本日のミッション達成{clearMissionsCount === 0 ? "・報酬受取済み" : ""}</p>}
          <div className="mission-milestones">{currentMissions.filter(isMilestone).map((m: any) => renderRow(m))}</div>
        </section>}
        {missionTab === "SPECIAL" && event && <section className="mission-overview">
          <h3>{event.eventTitle || "イベントミッション"}</h3>
          {event.eventStartAt && event.eventProgressEndAt && <p>開催：{dateLabel(event.eventStartAt)} ～ {dateLabel(event.eventProgressEndAt)} JST</p>}
          {event.eventClaimEndAt && <p>受取期限：{dateLabel(event.eventClaimEndAt)} JST</p>}
          <strong>{specialCompletedCount} / {specialStandardMissions.length} 達成</strong>
          <progress max={Math.max(1, specialStandardMissions.length)} value={specialCompletedCount} aria-label="イベント達成数" />
          {specialCompletion && renderRow(specialCompletion)}
        </section>}
        <div className="mission-actions"><span className="mission-clear-count">受取可能 <strong>{clearMissionsCount}</strong>件</span>
          <OutlawButton variant="primary" disabled={clearMissionsCount === 0 || missionClaimLoading} isLoading={missionClaimLoading} loadingLabel="" onClick={handleClaimAllMissions}>一括受け取り</OutlawButton>
        </div>
        <div className="mission-list">
          {available.map((m: any) => renderRow(m, missionTab === "NORMAL"))}
          {missionTab === "NORMAL" ? (["PROGRESS", "GROWTH", "BATTLE", "GUILD"] as const).map(group => {
            const rows = pending.filter((m: any) => m.displayGroup === group);
            return rows.length > 0 && <section key={group} className="mission-current-group"><h3>{{ PROGRESS: "初回目標", GROWTH: "育成", BATTLE: "バトル・レイド", GUILD: "ギルド" }[group]}</h3>{rows.map((m: any) => renderRow(m, true))}</section>;
          }) : pending.map((m: any) => renderRow(m))}
          {currentMissions.length === 0 && <div className="mission-empty">{missionTab === "SPECIAL" ? "現在開催中のイベントミッションはありません" : "ミッションはありません"}</div>}
        </div>
        {received.length > 0 && <details className="mission-received"><summary>受取済み {received.length}件</summary>{received.map((m: any) => renderRow(m))}</details>}
      </fieldset>
    </FullScreenPanel>
  );
}
