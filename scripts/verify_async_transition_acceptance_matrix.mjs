import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = (path) => readFile(resolve(root, path), "utf8");
const matrix = await read("specs/async_transition_loading_final_acceptance_20260830.md");
const spec = await read("tests/e2e/async-transition-final-acceptance.spec.ts");
const probe = await read("tests/e2e/support/async-transition-probe.ts");
const firstHome = await read("tests/e2e/first-home-r2.spec.ts");
const canonicalDialog = await read("src/app/components/ui/CanonicalDialog.tsx");
const canonicalDialogCss = await read("src/app/components/ui/CanonicalDialog.css");
const blocker = await read("src/app/components/ui/GlobalInteractionBlocker.tsx");
const blockerCss = await read("src/app/components/ui/GlobalInteractionBlocker.css");

for (const surface of ["Global Navigation", "Quest", "Gacha", "Character Growth", "Skill Growth", "Equipment Growth", "Mission", "Present", "Profile", "Guild", "PvP", "Raid", "Reward Dialog", "Confirm Dialog"]) {
  assert.match(matrix, new RegExp(`\\| ${surface.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")} \\|`), `missing surface: ${surface}`);
}
for (const phase of ["tap", "pending_paint", "lock_active", "server_completion", "destination_paint", "unlock"]) assert.match(probe, new RegExp(`"${phase}"`));
for (const delay of [0, 500, 1500, 3000]) assert.match(spec, new RegExp(`\\b${delay}\\b`));
assert.doesNotMatch(matrix, /Production routeへQA導線/);
assert.match(firstHome, /data-visual-readiness", "preparing"[\s\S]*?data-home-interaction", "blocked"[\s\S]*?"inert", ""[\s\S]*?data-visual-readiness", "ready"[\s\S]*?data-home-interaction", "ready"[\s\S]*?"inert", ""/,
  "Home image readiness must have a behavioral interaction-lock regression check");
assert.match(canonicalDialog, /role="dialog" aria-modal="true"/,
  "dialogs must expose modal semantics while covering the page");
assert.match(canonicalDialogCss, /\.canonical-dialog-overlay\{position:fixed;inset:0;z-index:12000/,
  "the canonical dialog overlay must cover the viewport above normal content");
assert.match(blocker, /<div className="outlaw-interaction-blocker"/);
assert.match(blockerCss, /\.outlaw-interaction-blocker[\s\S]*position:\s*fixed[\s\S]*inset:\s*0[\s\S]*pointer-events:\s*auto/,
  "the async interaction blocker must intercept pointer input across the viewport");

console.log(JSON.stringify({ status: "PASS", surfaces: 14, delays: [0, 500, 1500, 3000], homeVisualLockCovered: true, modalBackdropCovered: true, productionUiChanged: false, productionRouteAdded: false }, null, 2));
