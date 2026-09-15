import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { Jimp } from "jimp";

const PUBLIC_ROOT = path.resolve("public");
const SOURCE_ROOT = path.resolve("src");
const IMAGE_EXTENSION = /\.(png|jpe?g|webp)$/i;

const walk = (directory) => fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
  const target = path.join(directory, entry.name);
  return entry.isDirectory() ? walk(target) : [target];
});

const relativePublicPath = (file) => path.relative(PUBLIC_ROOT, file).replaceAll("\\", "/");
const isDeploymentExcluded = (assetPath) =>
  assetPath.startsWith("old/")
  || assetPath.startsWith("raw_assets/")
  || assetPath.startsWith("bg/bg_base_")
  || assetPath === "menu/event_banner_placeholder.png"
  || [
    "promotion/gacha_sp_skill.png",
    "promotion/gacha_sp_equipment.png",
    "promotion/gacha_normal_skill.png",
    "promotion/gacha_normal_equipment.png",
  ].includes(assetPath);

function actualImageType(buffer) {
  if (buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "png";
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "jpg";
  if (buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") return "webp";
  return "unknown";
}

const allPublicFiles = walk(PUBLIC_ROOT).map(relativePublicPath);
const exactPublicFiles = new Set(allPublicFiles);
const caseFoldedPublicFiles = new Map(allPublicFiles.map((assetPath) => [assetPath.toLowerCase(), assetPath]));
assert.equal(caseFoldedPublicFiles.size, allPublicFiles.length, "Case-colliding public asset paths detected");

const deployedImages = allPublicFiles.filter((assetPath) => IMAGE_EXTENSION.test(assetPath) && !isDeploymentExcluded(assetPath));
const mismatch = [];
const decodeFailures = [];

for (const assetPath of deployedImages) {
  const buffer = fs.readFileSync(path.join(PUBLIC_ROOT, assetPath));
  const extension = path.extname(assetPath).slice(1).toLowerCase().replace("jpeg", "jpg");
  const actualType = actualImageType(buffer);
  if (extension !== actualType) mismatch.push({ assetPath, extension, actualType });
  if (actualType === "png" || actualType === "jpg") {
    try {
      await Jimp.read(buffer);
    } catch (error) {
      decodeFailures.push({ assetPath, error: String(error?.message || error) });
    }
  }
}

assert.deepEqual(mismatch, [], `Extension/actual format mismatch: ${JSON.stringify(mismatch)}`);
assert.deepEqual(decodeFailures, [], `Asset decode failures: ${JSON.stringify(decodeFailures)}`);

const sourceFiles = walk(SOURCE_ROOT).filter((file) => /\.(ts|tsx|css|json)$/i.test(file));
const sourceText = sourceFiles
  .filter((file) => !file.endsWith(path.join("utils", "assetPresentation.ts")))
  .map((file) => fs.readFileSync(file, "utf8"))
  .join("\n");
const presentationResolver = fs.readFileSync(path.join(SOURCE_ROOT, "utils/assetPresentation.ts"), "utf8");
assert.match(presentationResolver, /bg_street_[^\n]+replace\(\/\\\.png\$\/i, "\.jpg"\)/, "Persisted Town background paths are not normalized");
assert.match(presentationResolver, /bg_gacha_[^\n]+replace\(\/\\\.png\$\/i, "\.jpg"\)/, "Persisted Gacha background paths are not normalized");
const forbiddenRuntimeReferences = [
  "/old/", "/raw_assets/", "event_banner_placeholder", "bg_base_",
  "/reiji_final_asset.png", "/rui_final_asset.png", "/chang_final_asset.png",
  "/gacha/bg_gacha_normal.png", "/gacha/bg_gacha_sr.png", "/gacha/bg_gacha_ssr.png",
  "/banner_beginner_pack.png",
];
for (const reference of forbiddenRuntimeReferences) {
  assert.equal(sourceText.includes(reference), false, `Forbidden runtime asset reference remains: ${reference}`);
}
assert.doesNotMatch(
  sourceText,
  /["'(`]\/(?:reiji|rui|chang)_transparent_asset\.png/,
  "Legacy root character asset reference remains",
);

const staticReferencePattern = /\/(?:[A-Za-z0-9_.@-]+\/)*[A-Za-z0-9_.@-]+\.(?:png|jpe?g|webp)/gi;
const staticReferences = new Set(
  [...sourceText.matchAll(staticReferencePattern)]
    .filter((match) => sourceText[Number(match.index) - 1] !== "}")
    .map((match) => match[0]),
);
const missingStaticReferences = [];
const casingErrors = [];
for (const reference of staticReferences) {
  const assetPath = reference.slice(1);
  if (exactPublicFiles.has(assetPath)) continue;
  const caseMatch = caseFoldedPublicFiles.get(assetPath.toLowerCase());
  if (caseMatch) casingErrors.push({ reference, actual: `/${caseMatch}` });
  else missingStaticReferences.push(reference);
}
assert.deepEqual(casingErrors, [], `Asset reference casing mismatch: ${JSON.stringify(casingErrors)}`);
assert.deepEqual(missingStaticReferences, [], `Missing static asset references: ${JSON.stringify(missingStaticReferences)}`);

const categoryCount = (prefix, extension) => deployedImages.filter((assetPath) =>
  assetPath.startsWith(prefix) && (!extension || assetPath.endsWith(extension))).length;
const inventory = {
  character: categoryCount("characters/", ".png"),
  skill: categoryCount("skills/", ".jpg"),
  equipment: categoryCount("equipments/", ".png"),
  item: categoryCount("items/", ".png"),
  townBackground: categoryCount("bg/bg_street_", ".jpg"),
  gachaBackground: categoryCount("gacha/bg_gacha_", ".jpg"),
  promotion: categoryCount("promotion/"),
};
assert.deepEqual(inventory, {
  character: 60,
  skill: 105,
  equipment: 170,
  item: 18,
  townBackground: 7,
  gachaBackground: 3,
  promotion: 23,
});

const rarityFrameDimensions = {};
for (const rarity of ["n", "r", "sr", "ssr"]) {
  const frame = await Jimp.read(path.join(PUBLIC_ROOT, `ui/rarity/equipment-frame-${rarity}.png`));
  rarityFrameDimensions[rarity] = `${frame.bitmap.width}x${frame.bitmap.height}`;
}
assert.deepEqual(new Set(Object.values(rarityFrameDimensions)), new Set(["192x192"]));
const globalCss = fs.readFileSync(path.join(SOURCE_ROOT, "app/globals.css"), "utf8");
assert.doesNotMatch(globalCss, /equipment-frame-n\.png[\s\S]*scale\(1\.319\)/, "Normalized Equipment N must not use the legacy geometry correction");

const raidMaster = JSON.parse(fs.readFileSync(
  path.join(SOURCE_ROOT, "domain/gameplay/canonical/data/raid_production_20260830.json"),
  "utf8",
));
assert.equal(raidMaster.variants.length, 7, "Canonical Raid must expose seven area variants");
assert.equal(new Set(raidMaster.variants.map((variant) => variant.areaId)).size, 7, "Canonical Raid area variants must be unique");
for (const variant of raidMaster.variants) {
  assert.equal(variant.memberCharacterIds.length, 5, `${variant.raidVariantId} must use the canonical five-character party`);
}
const raidPartyContract = {
  areaCount: raidMaster.variants.length,
  partySize: raidMaster.partySize,
  dedicatedLegacyBossAssetRequired: false,
};

console.log(JSON.stringify({
  status: "PASS",
  deployedImages: deployedImages.length,
  staticReferences: staticReferences.size,
  inventory,
  mismatch: mismatch.length,
  decodeFailures: decodeFailures.length,
  casingErrors: casingErrors.length,
  missingStaticReferences: missingStaticReferences.length,
  rarityFrameDimensions,
  raidPartyContract,
}, null, 2));
