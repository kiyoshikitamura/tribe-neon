/** Approved normalized images. Keys are canonical master IDs, never legacy UUID aliases. */
export const EXCLUSIVE_EYE_CUTINS: Readonly<Record<string, string>> = Object.freeze({
  char_go_01: "/eye-cutins/eye_cutin_01_go.png",
  char_leo_01: "/eye-cutins/eye_cutin_02_leo.png",
  char_kengo_01: "/eye-cutins/eye_cutin_03_kengo.png",
  char_koharu_01: "/eye-cutins/eye_cutin_04_koharu.png",
  char_miyabi_01: "/eye-cutins/eye_cutin_05_miyabi.png",
  char_mio_01: "/eye-cutins/eye_cutin_06_mio.png",
  char_reiji_01: "/eye-cutins/eye_cutin_07_reiji.png",
  char_ageha_01: "/eye-cutins/eye_cutin_08_ageha.png",
  char_karen_01: "/eye-cutins/eye_cutin_09_karen.png",
  char_kaede_01: "/eye-cutins/eye_cutin_10_kaede.png",
});

/** Asset catalogue only: does not replace existing cosmetic ownership or grant eligibility. */
export const APPROVED_GUILD_EMBLEM_ASSETS = Object.freeze([
  { city: "新宿", path: "/guild-emblems/guild_standard_01_shinjuku.png" },
  { city: "渋谷", path: "/guild-emblems/guild_standard_02_shibuya.png" },
  { city: "池袋", path: "/guild-emblems/guild_standard_03_ikebukuro.png" },
  { city: "六本木", path: "/guild-emblems/guild_standard_04_roppongi.png" },
  { city: "秋葉原", path: "/guild-emblems/guild_standard_05_akihabara.png" },
  { city: "川崎", path: "/guild-emblems/guild_standard_06_kawasaki.png" },
  { city: "横浜", path: "/guild-emblems/guild_standard_07_yokohama.png" },
  { city: null, path: "/guild-emblems/guild_event_rank1_base.png" },
]);
