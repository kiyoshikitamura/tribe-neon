/** 保存済みRoom台帳を確認するRPCを必ず経由して確定先を選ぶ。 */
export async function selectRaidFinalizer(
  replayId: string,
  lookup: (replayId: string) => Promise<{ data: unknown; error: { message: string } | null }>,
): Promise<"finalize_raid_battle" | "finalize_raid_room_battle_v1"> {
  const { data, error } = await lookup(replayId);
  if (error) throw new Error(error.message);
  if (data === "ROOM") return "finalize_raid_room_battle_v1";
  if (data === "LEGACY") return "finalize_raid_battle";
  throw new Error("Invalid Raid authority");
}
