const CHARACTER_LOCATION_BACKGROUNDS: Record<string, string> = {
  shinjuku: "/bg/bg_street_shinjuku.jpg",
  shibuya: "/bg/bg_street_shibuya.jpg",
  ikebukuro: "/bg/bg_street_ikebukuro.jpg",
  roppongi: "/bg/bg_street_roppongi.jpg",
  akihabara: "/bg/bg_street_akihabara.jpg",
  kawasaki: "/bg/bg_street_kawasaki.jpg",
  yokohama: "/bg/bg_street_yokohama.jpg",
};

const CHARACTER_LOCATION_KEYS: Record<string, keyof typeof CHARACTER_LOCATION_BACKGROUNDS> = {
  shinjuku: "shinjuku", "新宿": "shinjuku",
  shibuya: "shibuya", "渋谷": "shibuya",
  ikebukuro: "ikebukuro", "池袋": "ikebukuro",
  roppongi: "roppongi", "六本木": "roppongi",
  akihabara: "akihabara", "秋葉原": "akihabara",
  kawasaki: "kawasaki", "川崎": "kawasaki",
  yokohama: "yokohama", "横浜": "yokohama",
};

export function resolveCharacterLocationKey(homeTown: unknown): string | null {
  return CHARACTER_LOCATION_KEYS[String(homeTown || "").trim().toLowerCase()] || null;
}

export function getCharacterLocationBackground(homeTown: unknown): string {
  const locationKey = resolveCharacterLocationKey(homeTown);
  return CHARACTER_LOCATION_BACKGROUNDS[locationKey || "shinjuku"];
}

/** 日本語表記と街IDを同一の地元として比較。未設定同士は一致させない。 */
export function isCharacterHometown(homeTown: unknown, destination: unknown): boolean {
  const home = resolveCharacterLocationKey(homeTown);
  return home !== null && home === resolveCharacterLocationKey(destination);
}
