import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveBattle, type Tactic } from "./engine.ts";

const allowedTactics = new Set<Tactic>(["ATTACK_PRIORITY", "HEAL_PRIORITY", "SKILL_PRIORITY", "BALANCED", "WEAKNESS_FOCUS"]);
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, init: ResponseInit = {}) => Response.json(body, {
  ...init,
  headers: { ...corsHeaders, ...(init.headers || {}) },
});

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  const authorization = request.headers.get("Authorization");
  if (!authorization) return new Response("Unauthorized", { status: 401, headers: corsHeaders });
  const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authorization } } });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401, headers: corsHeaders });
  const { replaySessionId } = await request.json().catch(() => ({}));
  if (typeof replaySessionId !== "string") return json({ error: "replaySessionId is required" }, { status: 400 });
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: session, error } = await admin.from("battle_replay_sessions").select("*").eq("id", replaySessionId).eq("requester_user_id", user.id).maybeSingle();
  if (error || !session) return json({ error: "Replay session was not found" }, { status: 404 });

  const finalizePatrol = async (winner: "PLAYER" | "ENEMY") => {
    if (session.battle_mode !== "QUEST" || !session.source_reference_id) return null;
    const { data: patrol, error: patrolError } = await admin.from("user_patrols")
      .select("id, course_id, quest_id, battle_resolved")
      .eq("id", session.source_reference_id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (patrolError || !patrol) return patrolError?.message ?? "Patrol was not found";

    // Tutorial defeat is retryable without another dispatch/AP payment.
    let retryableTutorialDefeat = false;
    if (winner === "ENEMY" && (patrol.course_id ?? patrol.quest_id) === "q_shinjuku_1") {
      const { data: progress } = await admin.from("tutorial_progress")
        .select("step_id").eq("user_id", user.id).maybeSingle();
      retryableTutorialDefeat = progress?.step_id === "TUTORIAL_BATTLE";
    }
    if (retryableTutorialDefeat) return null;

    const { error: updatePatrolError } = await admin.from("user_patrols").update({
      battle_resolved: true,
      battle_result: winner === "PLAYER" ? "VICTORY" : "DEFEAT",
    }).eq("id", patrol.id).eq("user_id", user.id).eq("battle_resolved", false);
    return updatePatrolError?.message ?? null;
  };

  if (session.status === "RESOLVED") {
    const storedEvents = Array.isArray(session.result?.events) ? session.result.events : [];
    if (storedEvents.length > 0) {
      const { count, error: countError } = await admin.from("battle_replay_events")
        .select("id", { count: "exact", head: true })
        .eq("battle_replay_session_id", session.id);
      if (countError) return json({ error: countError.message }, { status: 500 });
      if (count === 0) {
        const events = storedEvents.map((item: { index: number; round: number; type: string; payload: Record<string, unknown> }) => ({
          battle_replay_session_id: session.id,
          event_index: item.index,
          round_number: Math.max(1, item.round),
          event_type: item.type,
          payload: item.payload,
        }));
        const { error: eventError } = await admin.from("battle_replay_events").insert(events);
        if (eventError) return json({ error: eventError.message }, { status: 500 });
      }
    }
    if (session.battle_mode === "QUEST" && (session.result?.winner === "PLAYER" || session.result?.winner === "ENEMY")) {
      const patrolFinalizeError = await finalizePatrol(session.result.winner);
      if (patrolFinalizeError) return json({ error: patrolFinalizeError }, { status: 500 });
    }
    return json(session.result);
  }
  const isOfficialGvg = session.battle_mode === "GVG" && Boolean(session.source_reference_id);
  const isOfficialPatrol = session.battle_mode === "QUEST"
    && session.resolution_authority === "PATROL_SERVER"
    && Boolean(session.source_reference_id);
  const isOfficialPvp = session.battle_mode === "PVP"
    && session.resolution_authority === "PVP_SERVER"
    && session.finalization_status === "PENDING"
    && Boolean(session.source_reference_id);
  const isOfficialRaid = session.battle_mode === "RAID"
    && session.resolution_authority === "RAID_SERVER"
    && session.finalization_status === "PENDING"
    && Boolean(session.source_reference_id);
  if (!isOfficialGvg && !isOfficialPatrol && !isOfficialPvp && !isOfficialRaid) {
    return json({ error: "Only an official GvG, patrol, PvP or Raid replay can be resolved by this function" }, { status: 409 });
  }
  if (session.status !== "PENDING" || !allowedTactics.has(session.tactic_id)) return json({ error: "Replay session is not resolvable" }, { status: 409 });
  if (isOfficialGvg) {
    const { data: attack, error: attackError } = await admin.from("gvg_attack_logs")
      .select("id").eq("id", session.source_reference_id).eq("attacker_user_id", user.id).eq("battle_result", "PENDING").maybeSingle();
    if (attackError || !attack) return json({ error: "The official GvG attack is not resolvable" }, { status: 409 });
  } else if (isOfficialPatrol) {
    const { data: patrol, error: patrolError } = await admin.from("user_patrols")
      .select("id").eq("id", session.source_reference_id).eq("user_id", user.id)
      .eq("status", "CLAIMABLE").eq("has_battle_event", true).eq("battle_resolved", false).maybeSingle();
    if (patrolError || !patrol) return json({ error: "The official patrol encounter is not resolvable" }, { status: 409 });
  }
  const result = resolveBattle(Number(session.random_seed), session.tactic_id, session.battle_mode === "RAID" ? 30 : session.battle_mode === "PVP" || session.battle_mode === "GVG" ? 20 : 15, session.player_snapshot, session.enemy_snapshot, session.enemy_tactic_id ?? undefined);
  if (isOfficialPvp) {
    const { data: finalized, error: finalizeError } = await admin.rpc("finalize_pvp_battle", {
      p_replay_id: session.id,
      p_result: result,
    });
    if (finalizeError) return json({ error: finalizeError.message }, { status: 500 });
    return json(finalized);
  }
  if (isOfficialRaid) {
    const { data: finalized, error: finalizeError } = await admin.rpc("finalize_raid_battle", {
      p_replay_id: session.id,
      p_result: result,
    });
    if (finalizeError) return json({ error: finalizeError.message }, { status: 500 });
    return json(finalized);
  }
  const { data: resolvedSession, error: updateError } = await admin.from("battle_replay_sessions")
    .update({ status: "RESOLVED", result, resolved_at: new Date().toISOString() })
    .eq("id", session.id).eq("status", "PENDING").select("id").maybeSingle();
  if (updateError) return json({ error: updateError.message }, { status: 500 });
  if (!resolvedSession) {
    const { data: latest } = await admin.from("battle_replay_sessions").select("result").eq("id", session.id).maybeSingle();
    return json(latest?.result ?? { error: "Replay resolution is in progress" }, { status: latest?.result ? 200 : 409 });
  }
  const events = result.events.map((item) => ({ battle_replay_session_id: session.id, event_index: item.index, round_number: Math.max(1, item.round), event_type: item.type, payload: item.payload }));
  if (events.length) {
    const { error: eventError } = await admin.from("battle_replay_events").insert(events);
    if (eventError) return json({ error: eventError.message }, { status: 500 });
  }
  if (isOfficialPatrol) {
    const patrolFinalizeError = await finalizePatrol(result.winner);
    if (patrolFinalizeError) return json({ error: patrolFinalizeError }, { status: 500 });
  }
  return json(result);
});
