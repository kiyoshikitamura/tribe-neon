import { RAID_DIFFICULTIES } from "./raidRoom.ts";

function findDifficulty(difficultyId: unknown) {
  return RAID_DIFFICULTIES.find((difficulty) => difficulty.id === difficultyId);
}

function formatPower(power: number): string {
  return power.toLocaleString("ja-JP");
}

export function getRaidDifficultyLabel(difficultyId: unknown): string {
  return findDifficulty(difficultyId)?.label ?? "難易度不明";
}

export function getRaidParticipationRequirement(difficultyId: unknown): string {
  const difficulty = findDifficulty(difficultyId);
  if (!difficulty) return "参加条件を確認できません";
  return difficulty.minimumPower === null
    ? "総合力制限なし"
    : `最低参加総合力：${formatPower(difficulty.minimumPower)}以上`;
}

export function getRaidRecommendedPowerLabel(difficultyId: unknown): string {
  const difficulty = findDifficulty(difficultyId);
  if (!difficulty) return "推奨総合力：未確認";
  const recommended = difficulty.recommendedPower;
  if (recommended === null) return "推奨総合力：ゲーム開始直後";
  return recommended.max === null
    ? `推奨総合力：${formatPower(recommended.min)}以上`
    : `推奨総合力：${formatPower(recommended.min)}〜${formatPower(recommended.max)}`;
}

export type RaidEligibilityPresentation = Readonly<{
  canJoin: boolean;
  label: string;
}>;

/** サーバーの参加判定だけを表示し、ローカルの総合力チェックでは参加を許可しない。 */
export function getRaidEligibilityPresentation(eligibility: unknown): RaidEligibilityPresentation {
  const unavailable: RaidEligibilityPresentation = {
    canJoin: false,
    label: "参加条件を確認できません",
  };
  if (typeof eligibility !== "object" || eligibility === null) return unavailable;
  const decision = eligibility as Record<string, unknown>;
  if (typeof decision.evaluatedAt !== "string" || !Number.isFinite(Date.parse(decision.evaluatedAt))) {
    return unavailable;
  }
  if (decision.status === "eligible") {
    if (decision.reasons !== undefined && (!Array.isArray(decision.reasons) || decision.reasons.length > 0)) {
      return unavailable;
    }
    return { canJoin: true, label: "参加する" };
  }
  if (decision.status === "ineligible" && Array.isArray(decision.reasons)
    && decision.reasons.every((reason) => typeof reason === "string")) {
    // 個別の理由コードは未定義でも、サーバーによる不許可判定は表示できる。
    return { canJoin: false, label: "参加条件を満たしていません" };
  }
  return unavailable;
}
