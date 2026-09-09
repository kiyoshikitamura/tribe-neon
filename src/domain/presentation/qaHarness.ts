export const QA_PRESENTATION_SCENARIOS = [
  ["gacha-character-v3", "Gacha Character / Rich reveal"],
  ["world-introduction", "World Introduction"],
  ["name-input-error", "Name duplicate → retry"],
  ["gacha-page", "Gacha Page"],
  ["gacha-production", "Gacha Production / 6 surfaces"],
  ["gacha-asset-transition", "Gacha Skill / Equipment transition"],
  ["gacha-authority-loading", "Gacha / Daily authority loading"],
  ["gacha-entitlement-empty", "Gacha / Daily free consumed"],
  ["gacha-resource-empty", "Gacha / No CASH or tickets"],
  ["gacha-skill-result", "Gacha Skill Result x10"],
  ["gacha-skill-result-one", "Gacha Skill Result x1"],
  ["gacha-equipment-result", "Gacha Equipment Result x10"],
  ["gacha-equipment-result-one", "Gacha Equipment Result x1"],
  ["gacha-standard-reveal", "Gacha R/SR Reveal"],
  ["gacha-ssr-reveal", "Gacha SSR Quote → Reveal"],
  ["skill-tutorial", "Skill Tutorial"],
  ["shared-skill-presentation", "Shared Skill 0 / 1 / 3 / 6"],
  ["public-user-profile", "Canonical Public User Profile"],
  ["growth-before", "Growth Before"],
  ["growth-result", "Growth Result"],
  ["formation", "Formation"],
  ["auto-formation", "Auto Formation"],
  ["quest-encounter", "Quest Encounter"],
  ["quest-normal-battle", "Quest normal → Battle"],
  ["quest-instant-battle", "Quest instant → Battle"],
  ["battle-5v3", "Battle 5v3"],
  ["battle-5v5", "Battle 5v5"],
  ["battle-2x", "Battle 2x"],
  ["battle-ssr-skill", "Battle SSR Skill"],
  ["battle-consecutive-skill", "Battle Consecutive Skill"],
  ["battle-final-hit", "Battle FINAL HIT"],
  ["battle-result-win", "Battle Result WIN"],
  ["battle-result-lose", "Battle Result LOSE"],
  ["first-home-fresh", "First Home / Fresh"],
  ["first-home-identity-loading", "First Home / Leader authority loading"],
  ["first-home-raid", "First Home / Active Raid"],
  ["first-home-guild-out", "First Home / Guild未加入"],
  ["first-home-guild-in", "First Home / Guild加入済み"],
  ["first-home-guild-pending", "First Home / Guild申請中"],
  ["first-home-favorite-missing", "First Home / Favorite未設定"],
  ["first-home-favorite-invalid", "First Home / Favorite不正"],
  ["first-home-activity-self", "First Home / Activity Self"],
  ["first-home-character-tall", "First Home / Tall Character"],
  ["first-home-character-hair", "First Home / Hair Volume Character"],
  ["first-home-campaign", "First Home / Pre-open Campaign"],
] as const;

export type QaPresentationScenarioId = typeof QA_PRESENTATION_SCENARIOS[number][0];
export type VisualComplianceStatus = "PASS" | "PARTIAL" | "FAIL" | "HUMAN_REQUIRED";

export const VISUAL_COMPLIANCE_GATE: ReadonlyArray<Readonly<{
  id: string;
  specification: string;
  status: VisualComplianceStatus;
  automatedPrecheck: "PASS" | "PARTIAL";
  evidence: string;
}>> = Object.freeze([
  { id: "world-intro", specification: "World IntroがCinematicに見える", status: "HUMAN_REQUIRED", automatedPrecheck: "PASS", evidence: "4 scene、motion layer、logo、copy transitionをHarnessで再生" },
  { id: "ssr-reveal", specification: "SSR identity先出しなし / Quote → Tap → Reveal", status: "PASS", automatedPrecheck: "PASS", evidence: "Quote段階はcharacter id/nameなし。Tap後のみcanonical characterを投影" },
  { id: "growth", specification: "Lv1→Lv7と総合力上昇が明確", status: "HUMAN_REQUIRED", automatedPrecheck: "PASS", evidence: "Before/Resultの成果要素をHarnessへ固定表示" },
  { id: "battle-start", specification: "Battle StartがMatch-upとして見える", status: "HUMAN_REQUIRED", automatedPrecheck: "PASS", evidence: "Production BattleMatchupPresentationを直接使用" },
  { id: "variable-roster", specification: "5v3 / 5v5で戦況を理解できる", status: "HUMAN_REQUIRED", automatedPrecheck: "PASS", evidence: "Production QuestBattleViewerで実参加人数のみ表示" },
  { id: "skill-2x", specification: "2xでもSkillが通常攻撃に埋没しない", status: "HUMAN_REQUIRED", automatedPrecheck: "PASS", evidence: "Production skill cut-inをspeed=2 fixtureで表示" },
  { id: "ssr-skill", specification: "SSR SkillにPremium感がある", status: "HUMAN_REQUIRED", automatedPrecheck: "PASS", evidence: "SSR actor + production premium tierをHarnessで表示" },
  { id: "battle-result", specification: "VS → WIN/LOSE → 左MVP → Score → Comparison", status: "HUMAN_REQUIRED", automatedPrecheck: "PASS", evidence: "Production BattleResultSummaryとauthoritative-shaped replay fixtureを使用" },
  { id: "first-home", specification: "First ViewでActivity / Leader / CTA / Bannerを判別できる", status: "HUMAN_REQUIRED", automatedPrecheck: "PASS", evidence: "Production HomeTabをFresh / Raid / Guild未加入 / Guild加入済みの4状態で表示" },
]);

export function isQaHarnessAvailable(appEnvironment: string | undefined, nodeEnvironment: string | undefined) {
  const appEnv = appEnvironment?.trim().toLowerCase();
  if (appEnv === "production") return false;
  if (appEnv === "preview" || appEnv === "development" || appEnv === "test") return true;
  return nodeEnvironment === "development";
}
