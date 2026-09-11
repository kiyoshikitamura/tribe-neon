export type HomeInitialCta = Readonly<{
  key: string;
  title: string;
  tab?: string;
  action?: "mission_handoff";
  disabled?: boolean;
}>;

/** Read-only projection of lifetime milestones; never grants completion. */
export function resolveHomeInitialCta(input: {
  ready: boolean;
  tutorialStep?: string | null;
  gameplayAuthorized?: boolean;
  milestones: ReadonlySet<string>;
  raidAvailability: "active" | "inactive" | "unknown";
}): HomeInitialCta | null {
  if (!input.ready) return null;
  const { tutorialStep, milestones } = input;
  if (tutorialStep && !input.gameplayAuthorized) return {
    key: "tutorial", title: "チュートリアルを続ける",
    tab: tutorialStep === "FREE_GACHA" ? "gacha" : tutorialStep === "AUTO_FORMATION" ? "character" : "patrol",
  };
  if (milestones.has("activation_mission_handoff")) return null;
  if (!milestones.has("first_free_skill_ten_pull") || !milestones.has("first_free_equipment_ten_pull")) {
    return { key: "first_free_asset_gacha", title: "無料スキル／装備ガチャを引こう", tab: "gacha" };
  }
  if (!milestones.has("first_main_loadout") && !milestones.has("character_setup_dialog_consumed")) {
    return { key: "first_main_loadout", title: "装備を整えよう", tab: "character" };
  }
  if (!milestones.has("post_tutorial_quest")) return { key: "post_tutorial_quest", title: "クエストでCASHを集めよう", tab: "patrol" };
  if (!milestones.has("first_pvp")) return { key: "first_pvp", title: "最初のバトルへ挑戦", tab: "pvp" };
  if (!milestones.has("first_raid")) return {
    key: "first_raid",
    title: input.raidAvailability === "inactive" ? "開催中のレイドはありません" : input.raidAvailability === "active" ? "開催中レイドへ" : "レイドを確認",
    tab: "raid", disabled: input.raidAvailability === "inactive",
  };
  return { key: "activation_mission_handoff", title: "ミッションを進めよう", action: "mission_handoff" };
}

export function describeHomeActivity(type?: string | null): string {
  switch (type) {
    case "RAID_HELP_REQUEST": return "レイドの救援を依頼";
    case "RAID_BOSS_DEFEATED": return "レイドボスを撃破";
    case "GUILD_CREATED": return "TRIBEを結成";
    case "POWER_RANK_1": return "総戦力ランキング1位に到達";
    case "SSR_CHARACTER": case "SSR_SKILL": case "SSR_EQUIPMENT": return "SSRを獲得";
    default: return "アクティビティを更新";
  }
}
