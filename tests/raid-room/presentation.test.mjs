import test from "node:test";
import assert from "node:assert/strict";
import {
  getRaidDifficultyLabel,
  getRaidParticipationRequirement,
  getRaidRecommendedPowerLabel,
  getRaidEligibilityPresentation,
} from "../../src/domain/raidRoomPresentation.ts";

const displayCases = [
  ["beginner", "初級", "総合力制限なし", "推奨総合力：ゲーム開始直後"],
  ["intermediate", "中級", "最低参加総合力：160,000以上", "推奨総合力：180,000〜220,000"],
  ["advanced", "上級", "最低参加総合力：200,000以上", "推奨総合力：220,000〜260,000"],
  ["expert", "超級", "最低参加総合力：240,000以上", "推奨総合力：260,000以上"],
];

for (const [difficulty, label, requirement, recommendation] of displayCases) {
  test(`${label}: 参加下限と推奨値を分離表示`, () => {
    assert.equal(getRaidDifficultyLabel(difficulty), label);
    assert.equal(getRaidParticipationRequirement(difficulty), requirement);
    assert.equal(getRaidRecommendedPowerLabel(difficulty), recommendation);
  });
}

test("未知難度に既存難度の表示値を流用しない", () => {
  for (const value of [null, undefined, "normal", "toString", {}, 0]) {
    assert.equal(getRaidDifficultyLabel(value), "難易度不明");
    assert.equal(getRaidParticipationRequirement(value), "参加条件を確認できません");
    assert.equal(getRaidRecommendedPowerLabel(value), "推奨総合力：未確認");
  }
});

const evaluatedAt = "2026-09-08T00:00:00.000Z";
test("サーバーの有効な参加可判定だけを参加可表示にする", () => {
  assert.deepEqual(getRaidEligibilityPresentation({ status: "eligible", evaluatedAt }), {
    canJoin: true, label: "参加する",
  });
});

test("サーバーの有効な参加不可判定を未取得と区別する", () => {
  for (const reasons of [[], [""], ["below_minimum"], ["unknown_reason"]]) {
    assert.deepEqual(getRaidEligibilityPresentation({ status: "ineligible", evaluatedAt, reasons }), {
      canJoin: false, label: "参加条件を満たしていません",
    });
  }
});

test("未取得・未知・不正・矛盾判定は参加可にならない", () => {
  for (const value of [
    null, undefined, true, "eligible", {},
    { status: "eligible" },
    { status: "eligible", evaluatedAt: null },
    { status: "eligible", evaluatedAt: "invalid" },
    { status: "future_status", evaluatedAt },
    { status: "unknown", evaluatedAt },
    { status: "ineligible", evaluatedAt, reasons: [null] },
    { status: "ineligible", evaluatedAt, reasons: "below_minimum" },
    { status: "eligible", evaluatedAt, reasons: ["below_minimum"] },
    { status: "eligible", evaluatedAt, reasons: "none" },
    // 初級の総合力ゲート通過も、全体のサーバー参加資格に代用できない。
    { status: "passed", reason: "no_power_restriction", minimumPower: null, actualPower: null },
  ]) {
    assert.deepEqual(getRaidEligibilityPresentation(value), {
      canJoin: false, label: "参加条件を確認できません",
    });
  }
});
