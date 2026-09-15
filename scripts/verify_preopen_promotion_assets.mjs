import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const publicRoot = path.resolve("public/promotion");
const expected = new Map([
  ["gvg_preopen_mission_keyvisual.webp", [860, 1292]],
  ["guild_power_ranking_keyvisual.webp", [860, 1292]],
  ["mypage_banner_gvg_prep.webp", [1200, 200]],
  ["mypage_banner_guild_power_ranking.webp", [1200, 200]],
  ["mypage_banner_quest.webp", [1200, 200]],
  ["mypage_banner_battle.webp", [1200, 200]],
  ["mypage_banner_ranking.webp", [1200, 200]],
  ["mypage_banner_community.webp", [1200, 200]],
  ["battle_page_header.webp", [1200, 300]],
]);

for (const [filename, dimensions] of expected) {
  const target = path.join(publicRoot, filename);
  assert.equal(fs.existsSync(target), true, `missing promotion asset: ${filename}`);
  const metadata = await sharp(target).metadata();
  assert.deepEqual([metadata.width, metadata.height], dimensions, `${filename} dimensions mismatch`);
  assert.equal(metadata.format, "webp", `${filename} must remain WebP`);
}

const home = fs.readFileSync("src/app/components/HomeTab.tsx", "utf8");
const prepDialog = fs.readFileSync("src/app/components/mission/PrepMissionEventDialogController.tsx", "utf8");
const homeCss = fs.readFileSync("src/app/components/HomeTab.css", "utf8");
const prepDialogCss = fs.readFileSync("src/app/components/mission/PrepMissionEventDialogController.css", "utf8");
const battle = fs.readFileSync("src/app/components/PvpTab.tsx", "utf8");
const migration = fs.readFileSync("supabase/migrations/20260903000238_preopen_promotion_asset_urls.sql", "utf8");

assert.match(home, /campaignOpen[\s\S]*mypage_banner_gvg_prep\.webp[\s\S]*mypage_banner_guild_power_ranking\.webp/);
assert.match(home, /campaign:GUILD_POWER/);
assert.match(home, /destination\.startsWith\("mission:"\)/);
assert.match(home, /data-banner-id/);
assert.match(home, /guild_power_ranking_keyvisual\.webp/);
assert.match(home, /ランキングを見る/);
assert.match(home, /await Promise\.all\(loadableBanners\.map/);
assert.match(prepDialog, /imageReady[\s\S]*mark_mission_event_dialog_viewed/);
assert.match(prepDialog, /gvg_preopen_mission_keyvisual\.webp/);
assert.match(homeCss, /campaign-keyvisual-dialog img[^}]*max-height:44dvh/);
assert.match(prepDialogCss, /prep-mission-dialog-image[^}]*max-height:44dvh/);
assert.match(battle, /battle_page_header\.webp/);
assert.match(migration, /mypage_banner_gvg_prep\.webp/);
assert.match(migration, /gvg_preopen_mission_keyvisual\.webp/);

console.log("Pre-open promotion asset integration verification PASS");
