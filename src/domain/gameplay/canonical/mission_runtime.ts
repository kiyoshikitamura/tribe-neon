export type MissionServerStatus = "PROGRESS" | "CLEAR" | "CLAIMED";

export type MissionMasterRow = {
  id: string;
  category: "DAILY" | "NORMAL" | "SPECIAL";
  trigger_type: string;
  target_value: number;
  prerequisite_mission_id: string | null;
  is_enabled: boolean;
  reward_item_id: string;
  reward_quantity: number;
  cash_reward?: number;
  display_group?: "PROGRESS" | "GROWTH" | "BATTLE" | "GUILD";
  preopen?: boolean;
};

export type UserMissionRow = {
  id: string;
  user_id: string;
  mission_id: string;
  current_progress: number;
  status: MissionServerStatus;
  cycle_date: string | null;
  claimed_at?: string | null;
};

export const FUNNEL_TRIGGER_BY_MILESTONE: Readonly<Record<string, string>> = {
  first_gacha: "FUNNEL_FIRST_GACHA",
  first_growth: "FUNNEL_FIRST_GROWTH",
  first_battle: "FUNNEL_FIRST_BATTLE",
  first_pvp: "FUNNEL_FIRST_PVP",
  first_raid: "FUNNEL_FIRST_RAID",
  guild_detail_view: "FUNNEL_GUILD_VIEW",
  guild_join_applied: "FUNNEL_GUILD_JOIN",
  guild_joined: "FUNNEL_GUILD_JOIN",
  guild_activation: "FUNNEL_GUILD_ACTIVATION",
  second_raid: "FUNNEL_SECOND_RAID",
};

export const jstCycleDate = (now = new Date()): string => new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(now);

const prerequisiteClaimed = (mission: MissionMasterRow, rows: UserMissionRow[], userId: string): boolean =>
  !mission.prerequisite_mission_id || rows.some((row) =>
    row.user_id === userId && row.mission_id === mission.prerequisite_mission_id && row.status === "CLAIMED"
  );

export function syncCanonicalMissions(
  master: MissionMasterRow[],
  rows: UserMissionRow[],
  userId: string,
  cycleDate = jstCycleDate(),
): { rows: UserMissionRow[]; rescued: UserMissionRow[] } {
  const rescued: UserMissionRow[] = [];
  for (const mission of master.filter((entry) => entry.is_enabled)) {
    const current = rows.find((row) => row.user_id === userId && row.mission_id === mission.id);
    if (mission.category === "DAILY" && current?.cycle_date !== cycleDate) {
      if (current?.status === "CLEAR") rescued.push({ ...current });
      if (current) {
        current.current_progress = 0;
        current.status = "PROGRESS";
        current.claimed_at = null;
        current.cycle_date = cycleDate;
      }
    }
    if (!current && prerequisiteClaimed(mission, rows, userId)) {
      rows.push({
        id: `um_${userId}_${mission.id}`,
        user_id: userId,
        mission_id: mission.id,
        current_progress: 0,
        status: "PROGRESS",
        cycle_date: mission.category === "DAILY" ? cycleDate : null,
        claimed_at: null,
      });
    }
  }
  const login = master.find((entry) => entry.is_enabled && entry.trigger_type === "DAILY_LOGIN");
  const loginRow = login && rows.find((row) => row.user_id === userId && row.mission_id === login.id);
  if (login && loginRow && loginRow.cycle_date === cycleDate && loginRow.status === "PROGRESS") {
    loginRow.current_progress = login.target_value;
    loginRow.status = "CLEAR";
  }
  return { rows, rescued };
}

export function evaluateCanonicalMissionProgress(
  master: MissionMasterRow[],
  rows: UserMissionRow[],
  userId: string,
  triggerType: string,
  increment: number,
): UserMissionRow[] {
  const aliases: Readonly<Record<string, readonly string[]>> = {
    GACHA_PULL: ["NORMAL_FREE_GACHA_PULL_COUNT"],
    CHAR_LEVEL_UP: ["CHARACTER_ENHANCE_COUNT", "CHARACTER_LEVEL_AT_LEAST"],
    GEAR_UPGRADE: ["EQUIPMENT_ENHANCE_COUNT"],
    GEAR_LIMIT_BREAK: ["EQUIPMENT_LIMIT_BREAK_AT_LEAST"],
    SKILL_LIMIT_BREAK: ["SKILL_ENHANCE_COUNT", "SKILL_AWAKENING_AT_LEAST"],
    PATROL_CLEAR: ["QUEST_COMPLETE_COUNT"],
    PVP_FINALIZED: ["PVP_FINALIZED_BATTLE_COUNT"],
    PVP_BATTLE_COUNT: ["PVP_FINALIZED_BATTLE_COUNT"],
    PVP_WIN: ["PVP_WIN_COUNT"],
    RAID_FINALIZED: ["RAID_FINALIZED_BATTLE_COUNT"],
    RAID_CLEAR_ELIGIBLE: ["RAID_CLEAR_ELIGIBLE_COUNT"],
    GUILD_JOIN: ["GUILD_JOIN_COUNT"],
    GUILD_ACTIVITY: ["GUILD_ACTIVITY_COUNT"],
    GUILD_CHAT: ["GUILD_ACTIVITY_COUNT"],
    GVG_FINALIZED: ["GVG_FINALIZED_BATTLE_COUNT"],
    GVG_WIN: ["GVG_WIN_COUNT"],
  };
  const accepted = new Set([triggerType, ...(aliases[triggerType] ?? [])]);
  for (const mission of master.filter((entry) => entry.is_enabled && accepted.has(entry.trigger_type))) {
    if (!prerequisiteClaimed(mission, rows, userId)) continue;
    const row = rows.find((entry) => entry.user_id === userId && entry.mission_id === mission.id);
    if (!row || row.status !== "PROGRESS") continue;
    row.current_progress = Math.min(mission.target_value, row.current_progress + Math.max(0, increment));
    if (row.current_progress >= mission.target_value) row.status = "CLEAR";
  }
  return refreshDailyMissionCompletionAggregates(master, rows, userId);
}

export function refreshDailyMissionCompletionAggregates(
  master: MissionMasterRow[],
  rows: UserMissionRow[],
  userId: string,
  cycleDate = jstCycleDate(),
): UserMissionRow[] {
  const completedCount = rows.filter((row) => {
    if (row.user_id !== userId || row.cycle_date !== cycleDate) return false;
    if (row.status !== "CLEAR" && row.status !== "CLAIMED") return false;
    const mission = master.find((entry) => entry.id === row.mission_id);
    return mission?.is_enabled === true
      && mission.category === "DAILY"
      && mission.trigger_type !== "DAILY_MISSION_COMPLETED_COUNT";
  }).length;

  for (const mission of master.filter((entry) => (
    entry.is_enabled
    && entry.category === "DAILY"
    && entry.trigger_type === "DAILY_MISSION_COMPLETED_COUNT"
  ))) {
    const row = rows.find((entry) => (
      entry.user_id === userId
      && entry.mission_id === mission.id
      && entry.cycle_date === cycleDate
    ));
    if (!row || row.status === "CLAIMED") continue;
    row.current_progress = Math.min(mission.target_value, completedCount);
    row.status = completedCount >= mission.target_value ? "CLEAR" : "PROGRESS";
  }
  return rows;
}

export function unlockClaimedMissionChildren(
  master: MissionMasterRow[],
  rows: UserMissionRow[],
  userId: string,
  claimedMissionId: string,
  achievedFunnelTriggers: ReadonlySet<string>,
): UserMissionRow[] {
  for (const mission of master.filter((entry) => entry.is_enabled && entry.prerequisite_mission_id === claimedMissionId)) {
    let row = rows.find((entry) => entry.user_id === userId && entry.mission_id === mission.id);
    if (!row) {
      row = {
        id: `um_${userId}_${mission.id}`,
        user_id: userId,
        mission_id: mission.id,
        current_progress: 0,
        status: "PROGRESS",
        cycle_date: null,
        claimed_at: null,
      };
      rows.push(row);
    }
    if (row.status === "PROGRESS" && achievedFunnelTriggers.has(mission.trigger_type)) {
      row.current_progress = mission.target_value;
      row.status = "CLEAR";
    }
  }
  return rows;
}
