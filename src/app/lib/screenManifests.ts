import { AssetRequest } from "./screenAssets";

const FRAME_ASSETS = [
  "/frames/sq_n.png", "/frames/sq_r.png", "/frames/sq_sr.png", "/frames/sq_ssr.png",
  "/frames/card_n.png", "/frames/card_r.png", "/frames/card_sr.png", "/frames/card_ssr.png",
];

const COMMON_SHELL_ASSETS = [
  "/ui/icon_cash.png", "/ui/icon_dia.png",
  "/ui/icon_footer_character.png", "/ui/icon_footer_gacha.png", "/ui/icon_footer_guild.png", "/ui/icon_footer_mypage.png", "/ui/icon_footer_shop.png",
];

export const GACHA_RARITY_ASSETS = [
  ...["n", "r", "sr", "ssr"].map((rarity) => `/ui/rarity/${rarity}.png`),
  ...["n", "r", "sr", "ssr"].map((rarity) => `/ui/rarity/character-card-${rarity}.png`),
  ...["n", "r", "sr", "ssr"].map((rarity) => `/ui/rarity/rarity-badge-${rarity}.png`),
  "/ui/rarity/badge-new.png",
  ...[1, 2, 3, 4, 5].map((level) => `/ui/rarity/badge-awakening-plus-${level}.png`),
];

export const CHARACTER_LOADOUT_RARITY_ASSETS = [
  ...["n", "r", "sr", "ssr"].map((rarity) => `/ui/rarity/character-card-${rarity}.png`),
  ...["n", "r", "sr", "ssr"].map((rarity) => `/ui/rarity/rarity-badge-${rarity}.png`),
  ...["n", "r", "sr", "ssr"].map((rarity) => `/ui/rarity/skill-frame-${rarity}.png`),
  ...["n", "r", "sr", "ssr"].map((rarity) => `/ui/rarity/equipment-frame-${rarity}.png`),
];

const HOME_ASSETS = [
  "/bg/bg_street_shinjuku.jpg", "/bg/bg_street_shibuya.jpg", "/bg/bg_street_ikebukuro.jpg", "/bg/bg_street_roppongi.jpg",
  "/bg/bg_street_akihabara.jpg", "/bg/bg_street_kawasaki.jpg", "/bg/bg_street_yokohama.jpg",
  "/characters/reiji_transparent_asset.png", "/characters/rui_transparent_asset.png", "/characters/chang_transparent_asset.png",
  "/menu/menu_allies.png", "/menu/menu_fight.png", "/menu/menu_conquest.png", "/menu/menu_war.png",
  "/gacha/bg_gacha_ssr.jpg", "/gacha/bg_gacha_sr.jpg", "/gacha/bg_gacha_normal.jpg",
  "/ui/icon_bag.png", "/ui/icon_community.png", "/ui/icon_map.png", "/ui/icon_mission.png",
  "/ui/icon_news.png", "/ui/icon_present.png", "/ui/icon_raid.png", "/ui/icon_ranking.png", "/ui/icon_settings.png",
  "/promotion/mypage_banner_quest.webp", "/promotion/mypage_banner_battle.webp",
  "/promotion/mypage_banner_ranking.webp", "/promotion/mypage_banner_community.webp",
];

function optionalAssets(paths: string[]): AssetRequest[] {
  return paths.map((src) => ({ src, required: false }));
}

export const SCREEN_ASSET_MANIFESTS = {
  commonShell: optionalAssets([...FRAME_ASSETS, ...COMMON_SHELL_ASSETS]),
  home: optionalAssets([...FRAME_ASSETS, ...COMMON_SHELL_ASSETS, ...HOME_ASSETS]),
  quest: optionalAssets([...FRAME_ASSETS, ...COMMON_SHELL_ASSETS]),
  pvp: [...optionalAssets([...FRAME_ASSETS, ...COMMON_SHELL_ASSETS]), { src: "/promotion/battle_page_header.webp", required: true }],
  gvg: optionalAssets([...FRAME_ASSETS, ...COMMON_SHELL_ASSETS]),
  raid: optionalAssets([...FRAME_ASSETS, ...COMMON_SHELL_ASSETS]),
  ranking: optionalAssets([...FRAME_ASSETS, ...COMMON_SHELL_ASSETS]),
} as const;

export const HOME_BOOT_ASSETS = SCREEN_ASSET_MANIFESTS.home.map((asset) => asset.src);

/**
 * Cold-start asset policy.
 *
 * BOOT_CRITICAL is the only blocking tier. TUTORIAL_CRITICAL starts after the
 * title has become visible, and DEFERRED must never hold the first session.
 * Character images returned by the tutorial draw are loaded from the actual
 * server result during the gacha presentation instead of preloading the full
 * release roster here.
 */
export const BOOT_CRITICAL_ASSETS: AssetRequest[] = [
  { src: "/branding/title-key-visual.png", required: true },
  { src: "/branding/tribe-neon-logo.png", required: true },
  { src: "/bg/bg_street_shinjuku.jpg", required: true },
  { src: "/characters/ageha_transparent_asset.png", required: true },
];

export const TUTORIAL_CRITICAL_ASSETS: AssetRequest[] = optionalAssets([
  ...FRAME_ASSETS,
  "/gacha/bg_gacha_normal.jpg",
  "/gacha/bg_gacha_sr.jpg",
  "/gacha/bg_gacha_ssr.jpg",
  "/bg/bg_street_shinjuku.jpg",
  "/characters/ageha_transparent_asset.png",
  "/characters/reiji_transparent_asset.png",
  "/characters/rui_transparent_asset.png",
  "/characters/chang_transparent_asset.png",
  "/characters/alice_transparent_asset.png",
  "/characters/kaito_transparent_asset.png",
  "/characters/koharu_transparent_asset.png",
  "/characters/leon_transparent_asset.png",
  "/characters/sakura_transparent_asset.png",
  "/characters/yuki_transparent_asset.png",
  "/effects/fx_screen_darken.png",
  "/effects/fx_speed_lines.png",
  "/effects/fx_heavy_impact.png",
  "/effects/fx_heavy_slash.png",
  "/effects/fx_muzzle_flash.png",
  "/effects/cutin_bg_sr.png",
  "/effects/cutin_bg_ssr.png",
  "/branding/world.png",
  "/branding/power.png",
  "/branding/tribe.png",
]);

const requiredAssets = (paths: string[]): AssetRequest[] => paths.map((src) => ({ src, required: true }));

// Block only on assets used by the current tutorial screen, then reveal the
// complete screen atomically.
export const TUTORIAL_STEP_ASSET_MANIFESTS: Record<string, AssetRequest[]> = {
  WORLD_INTRO: requiredAssets([
    "/branding/tutorial/tutorial_world_street_bg.png",
    "/characters/reiji_transparent_asset.png", "/characters/ageha_transparent_asset.png",
    "/characters/go_transparent_asset.png", "/characters/karen_transparent_asset.png",
    "/characters/kaede_transparent_asset.png", "/branding/tribe-neon-logo.png",
  ]),
  FREE_GACHA: requiredAssets([
    ...FRAME_ASSETS,
    "/gacha/bg_gacha_normal.jpg", "/gacha/bg_gacha_sr.jpg", "/gacha/bg_gacha_ssr.jpg",
  ]),
  AUTO_FORMATION: requiredAssets(FRAME_ASSETS),
  DISPATCH: requiredAssets(["/bg/bg_street_shinjuku.jpg", "/characters/ageha_transparent_asset.png"]),
  FREE_INSTANT: requiredAssets(["/bg/bg_street_shinjuku.jpg", "/characters/ageha_transparent_asset.png"]),
  TUTORIAL_BATTLE: requiredAssets([
    "/bg/bg_street_shinjuku.jpg", "/effects/fx_screen_darken.png", "/effects/fx_speed_lines.png",
    "/effects/fx_heavy_impact.png", "/effects/fx_heavy_slash.png", "/effects/fx_muzzle_flash.png",
    "/effects/cutin_bg_sr.png", "/effects/cutin_bg_ssr.png",
  ]),
  RULE_GUIDE: requiredAssets([
    "/characters/ageha_transparent_asset.png",
    "/branding/tutorial/tutorial_world_street_bg.png",
    "/branding/tutorial/tutorial_final_guide_bg.png",
  ]),
};

export const DEFERRED_ASSETS: AssetRequest[] = SCREEN_ASSET_MANIFESTS.home;
