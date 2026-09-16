import test from "node:test";
import assert from "node:assert/strict";
import { RAID_DIFFICULTIES, evaluateRaidPowerGate } from "../../src/domain/raidRoom.ts";

// 実装定数から期待値を作らず、Product Owner確定値を独立して固定する。
const requirements = [
  ["intermediate", 160000],
  ["advanced", 200000],
  ["expert", 240000],
];

test("4難度の参加下限と推奨値を別々に保持する", () => {
  assert.deepEqual(RAID_DIFFICULTIES.map(({ id, minimumPower }) => [id, minimumPower]), [
    ["beginner", null], ...requirements,
  ]);
  assert.deepEqual(RAID_DIFFICULTIES.map(({ recommendedPower }) => recommendedPower), [
    null, { min: 180000, max: 220000 }, { min: 220000, max: 260000 }, { min: 260000, max: null },
  ]);
});

for (const [difficulty, minimum] of requirements) {
  for (const [power, status, reason] of [
    [minimum - 1, "failed", "below_minimum"],
    [minimum, "passed", "meets_minimum"],
    [minimum + 1, "passed", "meets_minimum"],
  ]) {
    test(`${difficulty}: 総合力${power}の境界`, () => {
      assert.deepEqual(evaluateRaidPowerGate(difficulty, power), {
        status, reason, minimumPower: minimum, actualPower: power,
      });
    });
  }
  test(`${difficulty}: 未取得値を0や参加可と扱わない`, () => {
    for (const power of [null, undefined]) {
      assert.deepEqual(evaluateRaidPowerGate(difficulty, power), {
        status: "unknown", reason: "power_unavailable", minimumPower: minimum, actualPower: null,
      });
    }
  });
  test(`${difficulty}: 不正値を暗黙変換しない`, () => {
    for (const power of [NaN, Infinity, -Infinity, -1, "999999", "", true, {}, [], 999999n]) {
      assert.deepEqual(evaluateRaidPowerGate(difficulty, power), {
        status: "unknown", reason: "invalid_power", minimumPower: minimum, actualPower: null,
      });
    }
    assert.equal(evaluateRaidPowerGate(difficulty, 0).reason, "below_minimum");
  });
}

test("初級は総合力ゲートのみ無制限で、Room参加全体の許可を返さない", () => {
  for (const power of [0, 1, 160000, null, undefined, NaN, -1, "999999"]) {
    const result = evaluateRaidPowerGate("beginner", power);
    assert.equal(result.status, "passed");
    assert.equal(result.reason, "no_power_restriction");
    assert.equal(result.minimumPower, null);
    assert.equal("canJoin" in result, false);
  }
});

test("未知難度を初級へフォールバックしない", () => {
  for (const difficulty of [undefined, null, "", "normal", "BEGINNER", "toString", "__proto__"]) {
    const result = evaluateRaidPowerGate(difficulty, 999999);
    assert.equal(result.status, "unknown");
    assert.equal(result.reason, "invalid_difficulty");
  }
});
