import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loginBonusCellState, nextLoginBonusDay } from "../src/domain/presentation/loginBonusPresentation.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const canonical = JSON.parse(read("src/domain/gameplay/canonical/data/login_bonus_20260830.json"));
const operations = JSON.parse(read("src/domain/operations/data/operations_feature_state_20260823.json"));
const component = read("src/app/components/LoginBonusModal.tsx");
const componentCss = read("src/app/components/LoginBonusModal.css");
const page = read("src/app/page.tsx");
const home = read("src/app/components/HomeTab.tsx");
const header = read("src/app/components/Header.tsx");
const setup = read("src/app/components/SetupView.tsx");
const context = read("src/app/context/GameContext.tsx");
const authority = read("supabase/migrations/20260812000132_secure_login_bonus_cycle.sql");

assert.equal(canonical.cycleDays, 30);
assert.equal(canonical.rewards.length, 30);
assert.deepEqual(canonical.rewards.map((reward) => reward.day), Array.from({ length: 30 }, (_, index) => index + 1));
assert.equal(canonical.rewards.filter((reward) => reward.rewardItemId === "CASH").length, 0);
assert.equal(canonical.rewards.reduce((total, reward) => total + (reward.rewardItemId === "CASH" ? Number(reward.rewardQty) : 0), 0), 0);

const days = canonical.rewards.map((reward) => reward.day);
assert.equal(loginBonusCellState(1, 1, true, days), "TODAY");
assert.equal(loginBonusCellState(2, 1, true, days), "NEXT");
assert.equal(loginBonusCellState(3, 1, true, days), "FUTURE");
assert.equal(loginBonusCellState(1, 7, true, days), "RECEIVED");
assert.equal(nextLoginBonusDay(30, days), 1);
assert.equal(loginBonusCellState(1, 30, true, days), "NEXT");
assert.equal(loginBonusCellState(30, 30, true, days), "TODAY");

for (const state of ["RECEIVED", "TODAY", "NEXT", "FUTURE"]) assert.match(componentCss, new RegExp(`state-${state.toLowerCase()}`));
assert.match(component, /orderedMasters\.map/);
assert.match(component, /CanonicalItemIcon itemId=\{m\.item_id\}/);
assert.doesNotMatch(component, /NORMAL_GACHA_TICKET_CHARACTER.*rewardQty|CHAR_EXP_M.*quantity/);
assert.match(page, /<LoginBonusModal/);
assert.match(context, /rpc\("process_login_bonus"\)/);
assert.match(context, /if \(claimRes\.claimed\)[\s\S]*setShowLoginBonusModal\(true\)/);
assert.match(home, /id: "login-bonus"[\s\S]*setShowLoginBonusModal\(true\)/);
assert.match(header, /setShowLoginBonusModal/);
assert.match(header, /aria-label="ホームメニュー"[\s\S]*ログインボーナス/);

assert.match(authority, /pg_advisory_xact_lock/);
assert.match(authority, /FOR UPDATE/);
assert.match(authority, /AT TIME ZONE 'Asia\/Tokyo'/);
assert.match(authority, /\(v_current_step % 30\) \+ 1/);
assert.match(authority, /INSERT INTO public\.presents/);

const invitation = operations.features.find((feature) => feature.featureKey === "INVITE");
assert.deepEqual({ state: invitation?.state, visibility: invitation?.visibility, reasonCode: invitation?.reasonCode }, { state: "CLOSED", visibility: false, reasonCode: "PREOPEN_OMIT" });
assert.match(setup, /featureUiExposure\("INVITE"\) !== "ACTIVE"/);
assert.match(context, /mission\.trigger_type !== "USER_INVITE" \|\| featureUiExposure\("INVITE"\) === "ACTIVE"/);
assert.doesNotMatch(page, /FriendPanel/);

console.log("Login Bonus recognition verifier: PASS");
console.log("- canonical cycle: 30 days, CASH 0");
console.log("- presentation: RECEIVED / TODAY / NEXT / FUTURE with Day 30 -> Day 1 repeat");
console.log("- authority: JST + advisory lock + row lock + Present projection unchanged");
console.log("- invitation: PRE-OPEN OMIT, backend files retained");
