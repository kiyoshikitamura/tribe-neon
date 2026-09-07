import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const instrumentation = read("src/utils/kpiInstrumentation.ts");
const title = read("src/app/components/TitleView.tsx");
const setup = read("src/app/components/SetupView.tsx");
const auth = read("src/app/context/hooks/useAuth.ts");
const home = read("src/app/components/HomeTab.tsx");
const identity = read("src/app/api/kpi/identity-transition/route.ts");
const shared = read("src/app/api/admin/kpi/v2/_shared.ts");
const marketing = read("src/app/api/admin/kpi/marketing/route.ts");

for (const event of ["TITLE_ARRIVED", "TAP_TO_START", "WORLD_INTRO_STARTED", "WORLD_INTRO_COMPLETED", "NAME_COMPLETED"]) {
  assert.match(instrumentation, new RegExp(event), `${event} must be in the instrumentation allowlist`);
}
assert.match(title, /recordAcquisitionObservation\("TITLE_ARRIVED"\)/);
assert.match(title, /recordAcquisitionObservation\("TAP_TO_START"\)/);
assert.match(setup, /recordAcquisitionObservation\("WORLD_INTRO_STARTED"\)/);
assert.match(setup, /recordAcquisitionObservation\("WORLD_INTRO_COMPLETED"\)/);
assert.match(auth, /data\?\.status !== "success"[\s\S]*void bindCurrentAcquisitionJourney\(true\)/,
  "binding must only be attempted after initialize_current_player success validation");
assert.match(home, /identityLeaderAuthorityReady[\s\S]*guildMembershipAuthorityReady[\s\S]*confirmCanonicalFirstMyPage/);
for (const auxiliary of ["visibleBanners", "mission", "chat", "activity", "ranking", "loginBonus", "notifications"]) {
  const handshakeEffect = home.match(/useEffect\(\(\) => \{[\s\S]*?confirmCanonicalFirstMyPage[\s\S]*?\}, \[[^\]]+\]\);/)?.[0] || "";
  assert.doesNotMatch(handshakeEffect, new RegExp(auxiliary, "i"), `${auxiliary} must not gate canonical My Page completion`);
}
assert.match(instrumentation, /requestAnimationFrame\(\(\) => requestAnimationFrame/,
  "client acknowledgement must wait for primary render readiness");
assert.match(identity, /auth\.getUser\(destinationToken\)/);
assert.match(identity, /auth\.getUser\(body\.sourceAccessToken\)/);
assert.doesNotMatch(identity, /body\.(fromSubject|toSubject|subjectId)/,
  "client-supplied subject identifiers are forbidden");
assert.doesNotMatch(identity, /update\("kpi_subjects"\)|registered_at|cohort/i,
  "identity evidence must not merge or rewrite Retention authority");

for (const route of ["validation", "acquisition", "tutorial", "guild", "retention", "community", "marketing"]) {
  read(`src/app/api/admin/kpi/v2/${route}/route.ts`);
}
for (const key of ["metric_key", "definition_version", "numerator", "denominator", "target", "status", "coverage", "observation_status", "as_of", "timezone", "reason"]) {
  assert.match(shared, new RegExp(key));
}
assert.match(shared, /TITLE_ARRIVED/);
assert.match(shared, /registered_at/);
assert.match(shared, /observationDate < range\.today/);
assert.match(shared, /identity: "subject_id"/);
assert.match(shared, /calculateFormalRetention/);
assert.match(shared, /calculateCommunityContinuity/);
assert.match(shared, /calculateFormalOpenStatus/);
assert.match(shared, /INVALID_GRAIN_MIX/);
assert.match(marketing, /row\.currency === "JPY"/);
assert.match(marketing, /INVALID_GRAIN_MIX/);
assert.match(marketing, /record_kpi_marketing_daily_revision_v1/);
assert.doesNotMatch(marketing, /feature_operating_states|kpi_metric_snapshots|refresh_kpi/);

console.log("KPI V2 M2 instrumentation/read contract: PASS");
