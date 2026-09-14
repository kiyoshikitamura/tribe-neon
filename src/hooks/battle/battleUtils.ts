"use client";

import { supabase, usingMockSupabase } from "@/utils/supabase";
import { ParticipantState } from "./battleTypes";

export async function postNpcYajiMessage(
  session: any,
  username: string,
  type: "GLOBAL" | "BASE",
  baseId: string,
  triggerReason: string
) {
  if (!session) return;
  const npcs = ["リュウ", "カイ", "シン", "ハヤト", "ユキ"];
  const npc = npcs[Math.floor(Math.random() * npcs.length)];

  let text = "";
  if (triggerReason === "PVP_WIN") {
    text = `${username} がバトルで荒稼ぎしているらしいぞ。`;
  } else if (triggerReason === "GVG_WIN") {
    text = `拠点 ${baseId.toUpperCase()} でGvGが発生！ポイントが更新されました。`;
  } else if (triggerReason === "RAID_DAMAGE") {
    text = `新宿カイザーのHPが削られたぞ！全員、攻撃を緩めるな！`;
  } else {
    text = `今夜の歓楽街、なんだかネオンが怪しく発光しているな。`;
  }

  try {
    await supabase.from("board_posts").insert({
      user_id: "00000000-0000-0000-0000-000000000099",
      author_name: npc,
      content: text,
      target_type: type,
      target_id: type === "BASE" ? baseId : null,
      is_system: false
    });
  } catch (e) {
    console.warn("NPC chat post failed:", e);
  }
}

export async function saveBattleSessionState(
  sId: string,
  playerStates: ParticipantState[],
  enemyStates: ParticipantState[],
  apVal: number,
  maxApVal: number,
  tacticVal: any,
  logs: string[],
  tlIdx: number,
  gvgAreaId: string | null
) {
  if (!usingMockSupabase) return;
  try {
    await supabase.from("battle_sessions").update({
      player_state: { playerStates, ap: apVal, maxAp: maxApVal, tactic: tacticVal, log: logs, timelineIndex: tlIdx, gvgAreaId },
      enemy_state: { enemyStates }
    }).eq("id", sId);
  } catch (err) {
    console.warn(err);
  }
}
