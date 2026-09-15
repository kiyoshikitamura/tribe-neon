// ファイル名と旧export名は後方互換のため維持する。
// 60体RosterとProduction PNGは2026-08-21のProduction Freeze / Alpha Release Gateで
// 60/60 CLOSE済みであり、このモジュール名はアセットの暫定状態を意味しない。
// Runtime consumerは本モジュールの判定を複製せず、下記Production定数を参照する。

export type CharacterRarity = "N" | "R" | "SR" | "SSR";

export const PRODUCTION_CHARACTER_RARITIES: Record<string, CharacterRarity> = {
  reiji: "SSR", rui: "SSR", chang: "SSR", leon: "SSR", yuki: "SSR",
  kaito: "SSR", koharu: "SSR", sakura: "SSR", ageha: "SSR", alice: "SSR",
  go: "SR", kengo: "SR", mio: "SR", naoto: "SR", rin: "SR", serika: "SR",
  shin: "SR", tetsu: "SR", aoi: "SR", cecile: "SR", daimon: "SR", genji: "SR",
  gou: "SR", jihoon: "SR", joe: "SR", kaede: "SR", kageyama: "SR", karen: "SR",
  leo: "SR", long: "SR",
  lucas: "R", makoto: "R", mark: "R", martina: "R", masato: "R", maya: "R",
  mei: "R", minami: "R", miyabi: "R", momoko: "R", noa: "R", reina: "R",
  ren_male: "R", ren: "R", riki: "R", sawat: "R", seiya: "R", shion: "R",
  shun: "R", sora: "R",
  souta: "N", taiga: "N", takeshi: "N", takuro: "N", tatsuya: "N",
  tomoya: "N", yoshihiko: "N", yukina: "N", yuji: "N", kenji: "N",
};

/** @deprecated 後方互換export。Productionの確定状態はPRODUCTION_CHARACTER_RARITIESを参照する。 */
export const OPEN_BETA_PROVISIONAL_RARITIES = PRODUCTION_CHARACTER_RARITIES;

const ADDITIONAL_CHARACTER_NAMES = [
  ["ageha", "アゲハ"], ["alice", "アリス"], ["aoi", "アオイ"],
  ["cecile", "セシル"], ["daimon", "ダイモン"], ["genji", "ゲンジ"],
  ["gou", "ゴウ"], ["jihoon", "ジフン"], ["joe", "ジョー"],
  ["kaede", "カエデ"], ["kageyama", "カゲヤマ"], ["kaito", "カイト"],
  ["karen", "カレン"], ["koharu", "コハル"], ["kenji", "ケンジ"],
  ["leo", "レオ"], ["leon", "レオン"], ["long", "ロン"],
  ["lucas", "ルーカス"], ["makoto", "マコト"], ["mark", "マーク"],
  ["martina", "マルティナ"], ["masato", "マサト"], ["maya", "マヤ"],
  ["mei", "メイ"], ["minami", "ミナミ"], ["miyabi", "ミヤビ"],
  ["momoko", "モモコ"], ["noa", "ノア"], ["reina", "レイナ"],
  ["ren_male", "レン"], ["ren", "レン"], ["riki", "リキ"],
  ["sakura", "サクラ"], ["sawat", "サワット"], ["seiya", "セイヤ"],
  ["shion", "シオン"], ["shun", "シュン"], ["sora", "ソラ"],
  ["souta", "ソウタ"], ["taiga", "タイガ"], ["takeshi", "タケシ"],
  ["takuro", "タクロウ"], ["tatsuya", "タツヤ"], ["tomoya", "トモヤ"],
  ["yoshihiko", "ヨシヒコ"], ["yuki", "ユウキ"], ["yukina", "ユキナ"],
] as const;

const HOME_TOWNS = ["shinjuku", "shibuya", "ikebukuro", "roppongi", "akihabara", "kawasaki", "yokohama"] as const;
const ALIGNMENTS = ["ORDER", "CHAOS", "JUSTICE", "EVIL"] as const;
const GROWTH_PATTERNS = ["BALANCED", "ATTACKER", "DEFENDER", "SPEEDSTER", "LUCKY_STAR", "HP_TANK"] as const;

export const PRODUCTION_ADDITIONAL_CHARACTERS = ADDITIONAL_CHARACTER_NAMES.map(([name, jpName], index) => ({
  id: `char_${name}_01`,
  name,
  jpName,
  title: "暫定キャラクター",
  homeTown: HOME_TOWNS[index % HOME_TOWNS.length],
  alignment: ALIGNMENTS[index % ALIGNMENTS.length],
  growthPatternId: GROWTH_PATTERNS[index % GROWTH_PATTERNS.length],
  rarity: PRODUCTION_CHARACTER_RARITIES[name],
  img: `/characters/${name}_transparent_asset.png`,
  visualPrompt: "Production 60体の確定済みキャラクターアセット",
}));

/** @deprecated 後方互換export。Productionの確定状態はPRODUCTION_ADDITIONAL_CHARACTERSを参照する。 */
export const OPEN_BETA_PROVISIONAL_CHARACTERS = PRODUCTION_ADDITIONAL_CHARACTERS;
