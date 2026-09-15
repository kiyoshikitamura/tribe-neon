import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function bearer(request: NextRequest) {
  const value = request.headers.get("authorization") || "";
  return value.startsWith("Bearer ") ? value.slice(7) : null;
}

async function isActiveQa(service: SupabaseClient, userId: string) {
  const { data: subject } = await service.from("kpi_subjects")
    .select("subject_id")
    .eq("source_user_id", userId)
    .is("detached_at", null)
    .maybeSingle();
  if (!subject?.subject_id) return false;
  const { data: classification } = await service.from("kpi_account_classification_periods")
    .select("classification,valid_from,valid_to")
    .eq("subject_id", subject.subject_id)
    .order("valid_from", { ascending: false })
    .limit(1)
    .maybeSingle();
  const now = Date.now();
  return classification?.classification === "qa"
    && Date.parse(classification.valid_from) <= now
    && (!classification.valid_to || Date.parse(classification.valid_to) > now);
}

export async function GET(request: NextRequest) {
  if (process.env.NEXT_PUBLIC_APP_ENV !== "preview") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const accessToken = bearer(request);
  const actorId = request.nextUrl.searchParams.get("actor")?.trim() || "";
  if (!url || !serviceKey || !accessToken || !UUID_PATTERN.test(actorId)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const service = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: authData } = await service.auth.getUser(accessToken);
  const viewerId = authData.user?.id;
  if (!viewerId || !(await isActiveQa(service, viewerId)) || !(await isActiveQa(service, actorId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const [feedResult, userResult, membershipResult] = await Promise.all([
    service.from("social_activity_feed")
      .select("id,activity_type,actor_user_id,actor_display_name,guild_id,object_master_id,display_payload,permanent,created_at")
      .eq("actor_user_id", actorId)
      .order("created_at", { ascending: false })
      .limit(20),
    service.from("users").select("username,favorite_character_id").eq("id", actorId).maybeSingle(),
    service.from("guild_members").select("guild_id").eq("user_id", actorId).maybeSingle(),
  ]);
  if (feedResult.error || userResult.error || membershipResult.error) {
    return NextResponse.json({ error: "Activity unavailable" }, { status: 500 });
  }

  const guildId = membershipResult.data?.guild_id || null;
  const guildResult = guildId
    ? await service.from("guilds").select("name").eq("id", guildId).maybeSingle()
    : { data: null, error: null };
  if (guildResult.error) return NextResponse.json({ error: "Activity unavailable" }, { status: 500 });

  return NextResponse.json({
    activities: feedResult.data || [],
    profile: {
      username: userResult.data?.username || null,
      favorite_character_id: userResult.data?.favorite_character_id || null,
      guild_id: guildId,
      guild_name: guildResult.data?.name || null,
    },
  }, { headers: { "Cache-Control": "no-store" } });
}
