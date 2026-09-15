import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Evidence = { from: string; to: string; destinationUserId: string; expiresAt: number; contextId: string };

function configuration() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceKey) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || !parsed.hostname.endsWith(".supabase.co") || parsed.pathname !== "/") return null;
  } catch { return null; }
  return { url, serviceKey, service: createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } }) };
}

function bearer(request: NextRequest) {
  const value = request.headers.get("authorization") || "";
  return value.startsWith("Bearer ") ? value.slice(7) : null;
}

function sign(value: Evidence, secret: string) {
  const payload = Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${payload}.${createHmac("sha256", secret).update(payload).digest("base64url")}`;
}

function stableContextId(userId: string, secret: string) {
  const digest = createHmac("sha256", secret).update(`kpi-identity-same:${userId}`).digest("hex");
  return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-4${digest.slice(13, 16)}-a${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
}

function verify(value: string, secret: string): Evidence | null {
  const [payload, signature] = value.split(".");
  if (!payload || !signature) return null;
  const expected = createHmac("sha256", secret).update(payload).digest();
  const actual = Buffer.from(signature, "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  try {
    const result = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Evidence;
    return result.expiresAt > Date.now() ? result : null;
  } catch { return null; }
}

export async function POST(request: NextRequest) {
  const config = configuration();
  const destinationToken = bearer(request);
  if (!config || !destinationToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const { data: destinationAuth } = await config.service.auth.getUser(destinationToken);
  const destinationUser = destinationAuth.user;
  if (!destinationUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: destinationSubject } = await config.service.from("kpi_subjects").select("subject_id")
    .eq("source_user_id", destinationUser.id).is("detached_at", null).maybeSingle();
  if (!destinationSubject?.subject_id) return NextResponse.json({ error: "Subject unavailable" }, { status: 409 });

  if (body?.phase === "same") {
    const { error } = await config.service.rpc("record_kpi_subject_identity_transition_v1", {
      p_from_subject_id: destinationSubject.subject_id,
      p_to_subject_id: destinationSubject.subject_id,
      p_transition_type: "AUTH_LINK_SAME_SUBJECT",
      p_context_id: stableContextId(destinationUser.id, config.serviceKey),
      p_idempotency_key: `same:${destinationUser.id}`,
      p_metadata: {},
      p_source: "server_v1",
    });
    return error ? NextResponse.json({ error: "Identity evidence unavailable" }, { status: 500 }) : NextResponse.json({ recorded: true });
  }

  if (body?.phase === "prepare_switch" && typeof body.sourceAccessToken === "string") {
    const { data: sourceAuth } = await config.service.auth.getUser(body.sourceAccessToken);
    if (!sourceAuth.user?.is_anonymous || sourceAuth.user.id === destinationUser.id) {
      return NextResponse.json({ error: "Invalid transition" }, { status: 409 });
    }
    const { data: sourceSubject } = await config.service.from("kpi_subjects").select("subject_id")
      .eq("source_user_id", sourceAuth.user.id).is("detached_at", null).maybeSingle();
    if (!sourceSubject?.subject_id) return NextResponse.json({ error: "Source subject unavailable" }, { status: 409 });
    return NextResponse.json({ evidence: sign({
      from: sourceSubject.subject_id,
      to: destinationSubject.subject_id,
      destinationUserId: destinationUser.id,
      expiresAt: Date.now() + 5 * 60_000,
      contextId: randomUUID(),
    }, config.serviceKey) });
  }

  if (body?.phase === "commit_switch" && typeof body.evidence === "string") {
    const evidence = verify(body.evidence, config.serviceKey);
    if (!evidence || evidence.destinationUserId !== destinationUser.id || evidence.to !== destinationSubject.subject_id) {
      return NextResponse.json({ error: "Invalid evidence" }, { status: 409 });
    }
    const { error } = await config.service.rpc("record_kpi_subject_identity_transition_v1", {
      p_from_subject_id: evidence.from,
      p_to_subject_id: evidence.to,
      p_transition_type: "ACCOUNT_SWITCH_TO_EXISTING",
      p_context_id: evidence.contextId,
      p_idempotency_key: `switch:${evidence.contextId}`,
      p_metadata: {},
      p_source: "server_v1",
    });
    return error ? NextResponse.json({ error: "Identity evidence unavailable" }, { status: 500 }) : NextResponse.json({ recorded: true });
  }
  return NextResponse.json({ error: "Invalid request" }, { status: 400 });
}
