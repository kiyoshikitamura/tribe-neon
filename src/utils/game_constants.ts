export { RAID_BOSS_ID, TEST_SKILL_ID, ENEMIES_MASTER } from "@/constants/enemies";
import { CANONICAL_CHARACTERS } from "@/domain/gameplay/canonical/masters";
import { CANONICAL_ACTION_RESOURCES } from "@/domain/gameplay/canonical/action_resources";
import { CANONICAL_QUESTS } from "@/domain/gameplay/canonical/quests";

export const CHARACTERS_MASTER = CANONICAL_CHARACTERS.map((character) => ({
  id: character.character_id,
  name: character.character_id.replace(/^char_/, "").replace(/_01$/, ""),
  jpName: character.name,
  title: "",
  rarity: character.rarity,
  alignment: character.attribute,
  homeTown: character.hometown,
  img: getCharacterTransparentImg(character.character_id.replace(/^char_/, "").replace(/_01$/, "")),
}));

// Economy-only costs retained for the existing RPC/UI contract. No stat bonuses live here.
export const CHARACTER_AWAKENING_MASTER = [
  { awakening_level: 1, required_cash: 5000, dupe_required: 1 },
  { awakening_level: 2, required_cash: 10000, dupe_required: 1 },
  { awakening_level: 3, required_cash: 20000, dupe_required: 1 },
  { awakening_level: 4, required_cash: 30000, dupe_required: 1 },
  { awakening_level: 5, required_cash: 50000, dupe_required: 1 },
] as const;

export const VITALITY_MAX = CANONICAL_ACTION_RESOURCES.resources.VITALITY.naturalMax;
export const VITALITY_OVERFLOW_MAX = 500;
export const VITALITY_RECOVERY_INTERVAL_SEC = 360; // 6分 = 360秒
export const VITALITY_RECOVERY_AMOUNT = 1;
export const GVG_ATTACK_COST = 20;

export const GVG_DAILY_SESSIONS = [
  { id: 1, startHour: 12, startMin: 0, durationMin: 30 },
  { id: 2, startHour: 20, startMin: 0, durationMin: 30 },
  { id: 3, startHour: 23, startMin: 0, durationMin: 30 },
];

export const RAID_POINT_MAX = 5;
export const RAID_POINT_RECOVERY_INTERVAL_SEC = 7200;
// Compatibility export only. Active UI/runtime loads the server Quest master.
// Values here are the Canonical candidate and never provide an alternate reward contract.
export const DISPATCH_COURSES = CANONICAL_QUESTS.map((quest) => ({
  id: quest.questId,
  townId: quest.townId,
  name: quest.name,
  duration: quest.durationSec,
  stamina: quest.vitalityCost,
  rewardCash: quest.cashReward,
  rewardItem: null,
  chance: 0,
  xpReward: quest.userExp,
}));

export const BASE_MAP_MASTER = [
  { id: "shinjuku",   name: "新宿",   rank: "S", rewardMultiplier: 2.0, dailyRankPt: 30, description: "高級キャバクラやホストクラブ…都内最大の歓楽街。" },
  { id: "shibuya",    name: "渋谷",   rank: "A", rewardMultiplier: 1.5, dailyRankPt: 20, description: "若者文化とストリートギャングが交差する街。" },
  { id: "ikebukuro",  name: "池袋",   rank: "B", rewardMultiplier: 1.0, dailyRankPt: 10, description: "裏路地に潜むショバ代の巣窟。" },
  { id: "roppongi",   name: "六本木", rank: "B", rewardMultiplier: 1.0, dailyRankPt: 10, description: "外資系富裕層と裏カジノが共存する夜の街。" },
  { id: "akihabara",  name: "秋葉原", rank: "B", rewardMultiplier: 1.0, dailyRankPt: 10, description: "ジャンク電子パーツとコンカフェ情報網の闇市。" }
];

const CANONICAL_BATTLE_AREA_PRESENTATION = {
  shinjuku: { name: "新宿", backgroundPath: "/bg/bg_street_shinjuku.jpg" },
  shibuya: { name: "渋谷", backgroundPath: "/bg/bg_street_shibuya.jpg" },
  ikebukuro: { name: "池袋", backgroundPath: "/bg/bg_street_ikebukuro.jpg" },
  roppongi: { name: "六本木", backgroundPath: "/bg/bg_street_roppongi.jpg" },
  akihabara: { name: "秋葉原", backgroundPath: "/bg/bg_street_akihabara.jpg" },
  kawasaki: { name: "川崎", backgroundPath: "/bg/bg_street_kawasaki.jpg" },
  yokohama: { name: "横浜", backgroundPath: "/bg/bg_street_yokohama.jpg" },
} as const;

function canonicalBattleAreaId(areaId: string | null | undefined) {
  return String(areaId || "").trim().toLowerCase() as keyof typeof CANONICAL_BATTLE_AREA_PRESENTATION;
}

export function getCanonicalBattleAreaName(areaId: string | null | undefined): string | undefined {
  return CANONICAL_BATTLE_AREA_PRESENTATION[canonicalBattleAreaId(areaId)]?.name;
}

export function getCanonicalBattleBackground(areaId: string | null | undefined): string | undefined {
  return CANONICAL_BATTLE_AREA_PRESENTATION[canonicalBattleAreaId(areaId)]?.backgroundPath;
}

export const GEAR_SLOTS_MASTER = [
  { index: 0, label: "武器1", type: "WEAPON" },
  { index: 1, label: "武器2", type: "WEAPON" },
  { index: 2, label: "頭防具", type: "HEAD" },
  { index: 3, label: "胴防具", type: "BODY" },
  { index: 4, label: "脚防具", type: "LEGS" },
  { index: 5, label: "アクセ1", type: "ACCESSORY" },
  { index: 6, label: "アクセ2", type: "ACCESSORY" }
];

export const STORY_EPISODES_MASTER: { [key: string]: {
  title: string;
  intro: Array<{ speaker: string; img: string; expression: string; text: string }>;
  outro: Array<{ speaker: string; img: string; expression: string; text: string }>;
} } = {
  stage_tutorial_01: {
    title: "模擬戦: 新宿南部連合との接触",
    intro: [
      { speaker: "レイジ", img: "/characters/reiji_transparent_asset.png", expression: "通常", text: "キョウジ、模擬戦の準備はいいか？俺たちの連携力を見せてやろう。" },
      { speaker: "ルイ", img: "/characters/rui_transparent_asset.png", expression: "笑顔", text: "対戦相手のシミュレーションデータをグリッドに同期したよ！勝率は99.8%！" },
      { speaker: "チャン", img: "/characters/chang_transparent_asset.png", expression: "真剣", text: "ふん、油断するな。敵も新宿南部連合の精鋭だ。牙を剥いてくるぞ。" }
    ],
    outro: [
      { speaker: "レイジ", img: "/characters/reiji_transparent_asset.png", expression: "真剣", text: "フッ、模擬戦とはいえ上々の結果だ。やはりお前の指揮能力は本物だな。" },
      { speaker: "ルイ", img: "/characters/rui_transparent_asset.png", expression: "通常", text: "うん！キャッシュとダイヤの報酬もしっかりプレゼントボックスに転送しといたよ！" },
      { speaker: "チャン", img: "/characters/chang_transparent_asset.png", expression: "笑顔", text: "冷酷な毒蛇も, お前の指揮下なら悪くない...さあ、次は本番のシノギだ。" }
    ]
  },
  area_shibuya_liberation: {
    title: "渋谷エリアイベント: クラブ街の奪還",
    intro: [
      { speaker: "ルイ", img: "/characters/rui_transparent_asset.png", expression: "笑顔", text: "やった！渋谷エリアの支配率で自組織が1位に躍り出たよ！渋谷ノイズを完全クリア！" },
      { speaker: "レイジ", img: "/characters/reiji_transparent_asset.png", expression: "通常", text: "渋谷のクラブ街もこれで俺たちのショバだ。組織の資金源が大きく潤うな。" },
      { speaker: "チャン", img: "/characters/chang_transparent_asset.png", expression: "真剣", text: "だが、黒曜会が黙っていないはずだ。防衛部隊の再配備を急ぐべきだな。" }
    ],
    outro: []
  }
};

export const MASTER_AVATARS = [
  { url: "/characters/reiji_transparent_asset.png", label: "レイジ" },
  { url: "/characters/rui_transparent_asset.png", label: "ルイ" },
  { url: "/characters/chang_transparent_asset.png", label: "チャン" }
];

export const PROFILE_BACKGROUNDS = [
  { id: "bg_default", name: "新宿アジト", img: "/bg/bg_street_shinjuku.jpg", desc: "初期解放" },
  { id: "bg_kabukicho", name: "新宿ネオン街", img: "/bg/bg_street_shinjuku.jpg", desc: "Lv.5以上で解放" },
  { id: "bg_wharf", name: "東京ドック埠頭", img: "/bg/bg_street_yokohama.jpg", desc: "ギルド加入で解放" },
  { id: "bg_bazar", name: "渋谷スクランブル", img: "/bg/bg_street_shibuya.jpg", desc: "20,000キャッシュ以上で解放" }
];

export const PROFILE_FRONT_EFFECTS = [
  { id: "effect_none", name: "エフェクトなし", desc: "初期解放" },
  { id: "effect_lightning", name: "紫電一閃 (稲妻)", desc: "バトルRATE 1,050以上で解放" },
  { id: "effect_sparks", name: "百花繚乱 (火の粉)", desc: "Lv.10以上で解放" },
  { id: "effect_smoke", name: "硝煙黙示録 (煙)", desc: "3名以上のキャラ解放で解放" }
];

export const PROFILE_INTERIORS = [
  { id: "none", name: "なし", desc: "装飾なし" },
  { id: "interior_neon_sign", name: "ネオン看板", desc: "ネオン街の灯り" },
  { id: "interior_trophy_case", name: "戦績ケース", desc: "戦いの記録を飾る" },
  { id: "interior_speaker_stack", name: "スピーカー", desc: "夜を鳴らすサウンドシステム" }
];

export const PROFILE_TITLES = [
  { id: "title_none", name: "称号なし", desc: "初期解放" },
  { id: "title_kabukicho_emperor", name: "歌舞伎町の覇王", desc: "Lv.15以上で解放" },
  { id: "title_neon_overlord", name: "ネオンの支配者", desc: "300ダイヤ以上所持で解放" },
  { id: "title_gvg_champion", name: "GvG覇者", desc: "ギルド加入で解放" }
];

export function getCharacterStaticImg(name: string): string {
  return getCharacterTransparentImg(name || "reiji");
}

export function getCharacterTransparentImg(name: string): string {
  if (!name) return `/characters/reiji_transparent_asset.png`;
  const cleanName = name.toLowerCase().replace(/[^a-z0-9_]/g, "");
  const assetName = cleanName === "yuji" ? "yuuji" : cleanName;
  return `/characters/${assetName}_transparent_asset.png`;
}

export function getAlignmentShortJp(align: string): { label: string; colorClass: string } {
  switch (align) {
    case "ORDER":
    case "秩序":
      return { label: "秩", colorClass: "align-order" };
    case "JUSTICE":
    case "正義":
      return { label: "正", colorClass: "align-justice" };
    case "CHAOS":
    case "混沌":
      return { label: "混", colorClass: "align-chaos" };
    case "EVIL":
    case "悪":
      return { label: "悪", colorClass: "align-evil" };
    default:
      return { label: "他", colorClass: "align-none" };
  }
}

export const TOMODACHI_MAX_LIMIT = 30;

export const GACHA_PITY_MASTERS = [
  {
    id: "pity_gacha_standard_01",
    gacha_id: "gacha_standard",
    pity_threshold: 200,
    currency_name: "ガチャPt",
    start_at: "2026-01-01T00:00:00Z",
    end_at: "2027-12-31T23:59:59Z"
  }
];

export const GACHA_EXCHANGE_ITEMS_MASTER = [
  {
    id: "ex_c_reiji_01",
    pity_master_id: "pity_gacha_standard_01",
    reward_type: "CHARACTER",
    reward_id: "char_reiji_01",
    reward_name: "[SSR] 狂犬のレイジ",
    required_points: 200,
    limit_per_user: 1
  },
  {
    id: "ex_c_rui_01",
    pity_master_id: "pity_gacha_standard_01",
    reward_type: "CHARACTER",
    reward_id: "char_rui_01",
    reward_name: "[SSR] 女王のルイ",
    required_points: 200,
    limit_per_user: 1
  },
  {
    id: "ex_c_chang_01",
    pity_master_id: "pity_gacha_standard_01",
    reward_type: "CHARACTER",
    reward_id: "char_chang_01",
    reward_name: "[SSR] 毒蛇のチャン",
    required_points: 200,
    limit_per_user: 1
  },
  {
    id: "ex_eq_neon_blade_01",
    pity_master_id: "pity_gacha_standard_01",
    reward_type: "EQUIPMENT",
    reward_id: "eq_w_01",
    reward_name: "[SSR] ネオン・ドミネーター",
    required_points: 150,
    limit_per_user: 3
  }
];
