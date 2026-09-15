import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolveBattleFullSkillLoadFixture, isSkillAction } from "../src/domain/battle/fullSkillLoadFixture.ts";
import {
  BATTLE_HP_PARITY_MAX_ATTEMPTS,
  BATTLE_HP_PARITY_RETRY_DELAY_MS,
  buildBattlePresentationUnit,
  reconcileBattleHpFromReplay,
  waitForBattleHpParityGate,
} from "../src/domain/presentation/battlePresentationUnit.ts";

const runtime = readFileSync(new URL("../src/hooks/useBattle.ts", import.meta.url), "utf8");
const presentation = readFileSync(new URL("../src/domain/presentation/battlePresentationUnit.ts", import.meta.url), "utf8");
const { fixture, replay } = resolveBattleFullSkillLoadFixture();

assert.equal(fixture.player.length, 5, "5人の味方編成が必要です");
assert.equal(fixture.enemy.length, 5, "5人のエネミー編成が必要です");
assert.equal(replay.events.at(-1)?.type, "RESULT", "Canonical 5対5 ReplayはRESULTで終了する必要があります");
assert.ok(replay.events.some((event) => event.type === "ACTION" && !isSkillAction(event)), "通常攻撃回帰が必要です");
assert.ok(replay.events.some((event) => event.type === "ACTION" && isSkillAction(event)), "スキル回帰が必要です");
assert.ok(replay.events.some((event) => event.type === "DEFEAT"), "戦闘不能回帰が必要です");
assert.equal(BATTLE_HP_PARITY_MAX_ATTEMPTS, 2, "HP一致待機は有限回でなければなりません");
assert.equal(BATTLE_HP_PARITY_RETRY_DELAY_MS, 120, "既存の再確認間隔を変更してはいけません");

const mismatch = (kind = "ACTION_HP_PARITY") => ({
  kind,
  parity: false,
  timedOut: true,
  forcedSettle: false,
  sampledAt: 0,
  round: 1,
  actorId: "actor",
  replayStartCursor: 0,
  units: [{
    targetId: "missing-rendered-row",
    canonicalHp: 1,
    renderedHp: null,
    canonicalPercent: 100,
    renderedPercent: null,
    renderedTrackPx: null,
    renderedFillPx: null,
    canonicalDead: false,
    renderedDead: null,
    stateParity: false,
    visualParity: false,
  }],
});

let cursor = 0;
let reachedResult = false;
let normalActions = 0;
let skillActions = 0;
let defeats = 0;
while (cursor < replay.events.length) {
  const event = replay.events[cursor];
  if (event.type === "ACTION") {
    const unit = buildBattlePresentationUnit(replay.events, cursor);
    assert.ok(unit, `ACTION ${cursor}を表示単位へ変換できません`);
    if (isSkillAction(event)) skillActions += 1;
    else normalActions += 1;
    defeats += unit.targets.flatMap((target) => target.events).filter((outcome) => outcome.type === "DEFEAT").length;
    const gate = await waitForBattleHpParityGate(
      async () => mismatch(),
      { boundary: "ACTION", replayId: "raid-five-member-replay", round: event.round, actorId: unit.actorId, replayCursor: cursor },
      { retryDelayMs: 0 },
    );
    assert.equal(gate.status, "timed_out", "DOM不一致でもACTIONは有限時間で解放される必要があります");
    assert.equal(gate.attempts, BATTLE_HP_PARITY_MAX_ATTEMPTS);
    cursor = unit.nextReplayCursor;
    continue;
  }
  if (event.type === "RESULT") {
    const gate = await waitForBattleHpParityGate(
      async () => mismatch("RESULT_HP_PARITY"),
      { boundary: "RESULT", replayId: "raid-five-member-replay", round: event.round, replayCursor: cursor },
      { retryDelayMs: 0 },
    );
    assert.equal(gate.status, "timed_out", "DOM不一致でもRESULT到達を妨げてはいけません");
    reachedResult = true;
    break;
  }
  cursor += 1;
}
assert.ok(reachedResult, "5人編成の自然ReplayがRESULTまで進みませんでした");
assert.ok(normalActions > 0 && skillActions > 0 && defeats > 0, "通常・スキル・戦闘不能の全経路が必要です");

const terminalPlayers = reconcileBattleHpFromReplay(
  fixture.player.map((unit) => ({ id: unit.id, hp: unit.stats.hp, maxHp: unit.stats.hp, isDead: false })),
  replay.events,
);
const terminalEnemies = reconcileBattleHpFromReplay(
  fixture.enemy.map((unit) => ({ id: unit.id, hp: unit.stats.hp, maxHp: unit.stats.hp, isDead: false })),
  replay.events,
);
const skipGate = await waitForBattleHpParityGate(
  async () => mismatch("RESULT_HP_PARITY"),
  { boundary: "SKIP", replayId: "raid-five-member-replay", round: replay.rounds },
  { retryDelayMs: 0 },
);
assert.equal(skipGate.status, "timed_out", "SkipもDOM不一致で永久停止してはいけません");
assert.equal(terminalPlayers.length, 5);
assert.equal(terminalEnemies.length, 5);

let active = true;
const cancelled = await waitForBattleHpParityGate(
  async () => {
    active = false;
    return mismatch();
  },
  { boundary: "ACTION" },
  { retryDelayMs: 0, isActive: () => active },
);
assert.equal(cancelled.status, "cancelled", "Skipや画面破棄後の古いgateは進行してはいけません");

assert.match(runtime, /playerPartyStatesRef\.current=canonicalPlayers; enemyPartyStatesRef\.current=canonicalEnemies;/, "レイド開始時に同期参照を初期化する必要があります");
assert.equal((runtime.match(/waitForBattleHpParityGate\(/g) || []).length, 3, "ACTION・RESULT・SKIPは同じ有限gateを使う必要があります");
assert.doesNotMatch(runtime, /setTimeout\(\(\) => void finishAction\(\), 120\)/, "ACTIONの無限再試行が残っています");
assert.doesNotMatch(runtime, /setTimeout\(\(\) => void finishCanonicalResult\(\), 120\)/, "RESULTの無限再試行が残っています");
assert.doesNotMatch(runtime, /setTimeout\(\(\) => void finishSkip\(\), 120\)/, "Skipの無限再試行が残っています");
assert.match(presentation, /HP_PARITY_LIVENESS_TIMEOUT/, "期限到達traceが必要です");

console.log(JSON.stringify({
  status: "PASS",
  roster: { player: fixture.player.length, enemy: fixture.enemy.length },
  replay: { rounds: replay.rounds, events: replay.events.length, normalActions, skillActions, defeats, reachedResult },
  parityGate: { maxAttempts: BATTLE_HP_PARITY_MAX_ATTEMPTS, retryDelayMs: BATTLE_HP_PARITY_RETRY_DELAY_MS, action: "PASS", result: "PASS", skip: "PASS", cancelled: "PASS" },
  productionImpact: 0,
}, null, 2));
