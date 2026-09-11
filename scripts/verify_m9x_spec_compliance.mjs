import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const uiFiles = [
  "src/app/components/SetupView.tsx",
  "src/app/components/SetupView.css",
  "src/app/components/TitleView.tsx",
  "src/app/components/AuthView.tsx",
  "src/app/components/TutorialWorldIntro.tsx",
  "src/app/components/GachaTab.tsx",
  "src/app/components/CommonModals.tsx",
  "src/app/components/CharacterTab.tsx",
  "src/app/components/PatrolTab.tsx",
  "src/app/components/TutorialBattlePrompt.tsx",
  "src/app/components/CardBattleView.tsx",
  "src/app/components/TutorialRuleGuide.tsx",
  "src/app/components/TutorialRuleGuide.css",
  "src/app/components/HomeTab.tsx",
  "src/app/components/GuildTab.tsx",
  "src/app/components/TribeChatModal.tsx",
  "src/app/legal/LegalPage.tsx",
];

const sources = Object.fromEntries(uiFiles.map((file) => [file, readFileSync(resolve(file), "utf8")]));
const combined = Object.values(sources).join("\n");
const forbidden = [
  "NEON TOKYO",
  "ネオン東京",
  "WORLD INFORMATION",
  "PLAYER REGISTRATION",
  "WELCOME TO NEON TOKYO",
  "FIRST NEON DRAW",
  "TUTORIAL FREE 10 PULL",
  "SSR SIGNAL",
  "最高レアリティ反応",
  "おすすめ編成で決定",
  "チュートリアルバトル開始",
  "暗号メッセージ『トライブ』",
  "MISSION HUB",
  "TRIBE: NEON REIGN",
];

const violations = forbidden.filter((value) => combined.includes(value));
if (violations.length > 0) {
  throw new Error(`M9-X forbidden UI copy detected: ${violations.join(", ")}`);
}

const gameContext = readFileSync(resolve("src/app/context/GameContext.tsx"), "utf8");
const characterTab = sources["src/app/components/CharacterTab.tsx"];
for (const retiredClientPath of [
  "prepare_current_tutorial_growth",
  "advance_current_tutorial_after_growth",
  "tribe_tutorial_growth_ready",
  "isTutorialGrowth",
]) {
  if (`${gameContext}\n${characterTab}`.includes(retiredClientPath)) {
    throw new Error(`Retired tutorial Growth client path detected: ${retiredClientPath}`);
  }
}

const requiredFragments = [
  "/branding/tutorial/tutorial_world_street_bg.png",
  "この街には、",
  "いろんな生き方をしてる奴がいる。",
  "見た目も、性格も、戦い方も違う。",
  "誰と出会うかは、お前次第だ。",
  "この街で、お前のTRIBEが始まる。",
  "ようこそ、TRIBE NEONへ！",
  "私はアゲハ。まず、キミの名前を教えて？",
  "この街、一人でやってくのは結構大変なんだ。",
  "まずは仲間を集めよっか。",
  "ここでは、ガチャで仲間を増やせるよ。",
  "おすすめのスキルを選んでおいたから、装備させるね。",
  "SKILL_001",
  "SKILL_003",
  "SKILL_022",
  "装備する",
  "次はクエストね。まずはこの子を新宿に行かせてみよ。",
  "本当なら、あとは帰ってくるまで待つんだけど――",
  "こんな感じ。クエストを進めながら、少しずつ強くなってくよ。",
  "あ、バトルになったみたい。",
  "/branding/tutorial/tutorial_final_guide_bg.png",
  "街へ出る →",
];
const missing = requiredFragments.filter((value) => !combined.includes(value));
if (missing.length > 0) {
  throw new Error(`M9-X required Package copy missing: ${missing.join(" / ")}`);
}

const setupView = sources["src/app/components/SetupView.tsx"];
for (const characterPath of [
  "/characters/reiji_transparent_asset.png",
  "/characters/ageha_transparent_asset.png",
  "/characters/gou_transparent_asset.png",
  "/characters/karen_transparent_asset.png",
  "/characters/kaede_transparent_asset.png",
]) {
  if (!setupView.includes(characterPath)) throw new Error(`World Introduction Character missing: ${characterPath}`);
}

const finalGuide = sources["src/app/components/TutorialRuleGuide.tsx"];
for (const duplicateCopy of ["ここからは、仲間と遊ぼう。", "レイドで助け合い、ギルドでつながる。", "あとは、キミの自由だ。"] ) {
  if (finalGuide.includes(`>${duplicateCopy}<`)) throw new Error(`Final Guide baked copy must not be redrawn: ${duplicateCopy}`);
}

console.log(`M9-X specification source gate PASS (${uiFiles.length} UI files, ${requiredFragments.length} required fragments)`);
