export function battleDisplayText(value: unknown): string {
  return String(value ?? "")
    .replace(/PVP POINT/gi, "BP")
    .replace(/PvP[\s　]*Point/gi, "BP")
    .replace(/PvPポイント/gi, "BP")
    .replace(/PvP/gi, "バトル");
}
