import { battleDisplayText } from "./battleTerminology.ts";

// マスターの達成条件・IDは保持し、表示文だけをページの呼称へ揃える。
export function missionDisplayText(value: unknown): string {
  return battleDisplayText(value)
    .replace(/Raid\s+Boss\s+Clear/gi, "レイドボス撃破")
    .replace(/Raid\s+Boss/gi, "レイドボス")
    .replace(/Character/gi, "キャラ")
    .replace(/Equipment/gi, "装備")
    .replace(/Skill/gi, "スキル")
    .replace(/Quest/gi, "クエスト")
    .replace(/Raid/gi, "レイド")
    .replace(/Guild/gi, "ギルド")
    .replace(/派遣/g, "探索");
}
