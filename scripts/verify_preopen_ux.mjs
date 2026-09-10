import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const failures = [];
const requireText = (file, text, label) => {
  if (!read(file).includes(text)) failures.push(`${label}: ${file} is missing ${text}`);
};
const forbidText = (file, text, label) => {
  if (read(file).includes(text)) failures.push(`${label}: ${file} still contains ${text}`);
};

requireText("src/app/components/ui/OutlawButton.tsx", "aria-busy={busy}", "shared async state");
requireText("src/app/components/ui/OutlawButton.tsx", "outlaw-button-spinner", "shared pending indicator");
requireText("src/app/components/ui/ConfirmDialog.tsx", "kind === \"reward\"", "shared reward dialog");
requireText("src/app/components/ui/ConfirmDialog.tsx", "<RewardReceipt items={rewards}", "canonical reward receipt");
requireText("src/app/components/MissionPanel.tsx", "loadingLabel=\"一括受取中…\"", "mission claim-all feedback");
requireText("src/app/components/MissionPanel.tsx", "loadingLabel=\"受取中…\"", "mission claim feedback");
requireText("src/app/components/InboxPanel.tsx", "isLoading={presentClaimLoading}", "present claim-all feedback");
requireText("src/app/components/TribeChatModal.tsx", "loadingLabel=\"送信中…\"", "guild chat feedback");
requireText("src/app/components/HomeTab.tsx", "tutorialStep === \"AUTO_FORMATION\" ? \"character\" : \"patrol\"", "tutorial formation to first quest CTA");
requireText("src/app/components/HomeTab.tsx", "title: \"ミッションを確認\"", "one-line final Mission handoff CTA");
requireText("src/app/components/HomeTab.tsx", "return null;", "completed joined Home omits the large CTA");
forbidText("src/app/components/HomeTab.tsx", "key: \"mission_reward\"", "mission reward must remain a compact badge rather than a large Home CTA");
requireText("src/app/components/GuildTab.tsx", "おすすめギルド", "guild recommendation section");
requireText("src/app/components/MissionPanel.css", "@media (max-width: 412px)", "mission mobile layout");
requireText("src/app/components/ui/ConfirmDialog.css", "env(safe-area-inset-bottom)", "modal safe area");

requireText("src/app/components/PatrolTab.tsx", "(isTutorialQuestStep && tutorialStep !== \"DISPATCH\")", "normal Quest dispatch remains operable");
requireText("src/app/components/PatrolTab.tsx", "`${selectedTownLabel}へ派遣する`", "Quest CTA follows selected area");
requireText("src/app/components/PatrolTab.tsx", "canonicalItemName", "Quest reward names are canonical");
requireText("src/app/components/MoveBaseModal.tsx", "CANONICAL_QUEST_TOWNS", "base movement uses canonical areas");
forbidText("src/app/components/MoveBaseModal.tsx", "junk_bazaar", "legacy base removed");
forbidText("src/app/components/MoveBaseModal.tsx", "ジャンクバザール", "legacy base copy removed");
requireText("src/app/components/HomeTab.tsx", "const miniNavigationItems = [", "Home mini navigation remains directly available");
requireText("src/app/context/GameContext.tsx", "mission.trigger_type !== \"USER_INVITE\" || featureUiExposure(\"INVITE\") === \"ACTIVE\"", "invitation missions follow pre-open exposure");
requireText("src/app/components/HomeTab.tsx", "onClick: () => navigateTab(\"ranking\")", "Ranking remains a direct community action");
requireText("src/app/components/BbsTab.tsx", "get_public_profiles", "BBS identity batch projection");
requireText("src/app/components/BbsTab.tsx", "<UserIdentityRow", "BBS shared identity");
forbidText("src/app/components/BbsTab.tsx", "reiji_transparent_asset", "BBS fake leader fallback removed");
requireText("src/app/components/InboxPanel.tsx", "canonicalItemName", "Present reward names are canonical");
requireText("src/app/components/InboxPanel.tsx", "<CanonicalItemIcon", "Present reward icons are canonical");
requireText("src/app/components/SettingsPanel.tsx", "EditableSettingSection", "Settings uses read-only then edit contract");
requireText("src/app/components/SettingsPanel.tsx", "ChoiceGroup", "Settings uses mobile choice controls");
forbidText("src/app/components/SettingsPanel.tsx", "<select", "Settings native selects removed");
forbidText("src/app/components/CharacterTab.tsx", "CHARACTERS_MASTER[0]", "fake first-character fallback removed");
forbidText("src/app/components/CharacterTab.tsx", "<select", "Character settings native select removed");
forbidText("src/app/components/CharacterTab.tsx", "|| eq.equipment_id", "equipment raw ID fallback removed");
forbidText("src/app/components/CharacterTab.tsx", "|| equipment.equipment_id", "equipment progression raw ID fallback removed");

const forbidden = ["FRIEND_HELPER", "friend helper slot", "AP Gameplay", "random_options Gameplay"];
const changedRuntime = [
  "src/app/components/HomeTab.tsx",
  "src/app/components/MissionPanel.tsx",
  "src/app/components/InboxPanel.tsx",
  "src/app/components/GuildTab.tsx",
  "src/app/components/TribeChatModal.tsx",
].map(read).join("\n");
for (const text of forbidden) {
  if (changedRuntime.includes(text)) failures.push(`closed/legacy surface reintroduced: ${text}`);
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log("Pre-open Home / Activation / Common UX verification: PASS");
