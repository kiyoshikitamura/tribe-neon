import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const expectedProjectRef = process.env.SUPABASE_EXPECTED_PROJECT_REF;
if (!url || !anonKey || !serviceRoleKey || !expectedProjectRef) {
  throw new Error("Missing Supabase Preview verification configuration.");
}
const actualProjectRef = new URL(url).hostname.split(".")[0];
assert.equal(actualProjectRef, expectedProjectRef, "Refusing unexpected Supabase target");
assert.equal(actualProjectRef, "sufvuqdnqohpfzkwxohq", "This verification is Preview-only");

const admin = createClient(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function metadata(source, content) {
  return {
    utm_source: source,
    utm_medium: source === "direct" ? null : "paid_social",
    utm_campaign: source === "direct" ? null : "preview-fresh-journey",
    utm_content: content,
    utm_term: null,
    referrer: source === "x" ? "https://t.co/example" : source === "meta" ? "https://facebook.com/" : null,
    landing_path: "/",
    fbclid: source === "meta" ? `meta-${Date.now()}` : null,
    x_click_id: source === "x" ? `x-${Date.now()}` : null,
  };
}

async function runJourney(source, content, ordinal) {
  const client = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const token = randomBytes(32).toString("hex");
  const landing = metadata(source, content);

  const firstLanding = await client.rpc("record_kpi_acquisition_landing_v1", {
    p_token: token,
    p_metadata: landing,
    p_source: "web_v1",
  });
  if (firstLanding.error) throw firstLanding.error;

  const retryLanding = await client.rpc("record_kpi_acquisition_landing_v1", {
    p_token: token,
    p_metadata: landing,
    p_source: "web_v1",
  });
  if (retryLanding.error) throw retryLanding.error;
  assert.equal(retryLanding.data, firstLanding.data);

  const conflict = await client.rpc("record_kpi_acquisition_landing_v1", {
    p_token: token,
    p_metadata: { ...landing, utm_content: `conflict-${ordinal}` },
    p_source: "web_v1",
  });
  assert.equal(conflict.error?.code, "23505");

  const gameStart = await client.rpc("record_kpi_acquisition_observation_v1", {
    p_token: token,
    p_event_type: "TAP_TO_START",
    p_idempotency_key: "tap_to_start:v1",
    p_metadata: {},
    p_source: "web_v1",
  });
  if (gameStart.error) throw gameStart.error;

  const auth = await client.auth.signInAnonymously();
  if (auth.error || !auth.data.user || !auth.data.session) {
    throw auth.error || new Error("Anonymous Preview user creation failed");
  }

  const username = `A${source[0].toUpperCase()}${Date.now().toString(36).slice(-4)}${ordinal}`.slice(0, 8);
  const initialized = await client.rpc("initialize_current_player", { p_username: username, p_invite_code: null });
  if (initialized.error) throw initialized.error;
  assert.ok(["success", "already_initialized"].includes(initialized.data?.status));

  const bound = await client.rpc("bind_kpi_acquisition_subject_v1", {
    p_token: token,
    p_source: "web_v1",
  });
  if (bound.error) throw bound.error;
  const boundRetry = await client.rpc("bind_kpi_acquisition_subject_v1", {
    p_token: token,
    p_source: "web_v1",
  });
  if (boundRetry.error) throw boundRetry.error;
  assert.equal(boundRetry.data, bound.data);

  const tokenHash = createHash("sha256").update(token, "utf8").digest("hex");
  const journeyResult = await admin
    .from("kpi_acquisition_journeys")
    .select("journey_id,started_at,first_arrived_at,source,metadata")
    .eq("journey_token_hash", tokenHash)
    .single();
  if (journeyResult.error) throw journeyResult.error;
  assert.deepEqual(journeyResult.data.metadata, landing);
  assert.equal(journeyResult.data.started_at, journeyResult.data.first_arrived_at);

  const factsResult = await admin
    .from("kpi_acquisition_journey_facts")
    .select("event_type,idempotency_key,metadata")
    .eq("journey_id", journeyResult.data.journey_id)
    .order("occurred_at");
  if (factsResult.error) throw factsResult.error;
  assert.deepEqual(factsResult.data.map((fact) => fact.event_type), ["TITLE_ARRIVED", "TAP_TO_START"]);
  assert.deepEqual(factsResult.data.map((fact) => fact.metadata), [{}, {}]);

  const bindingResult = await admin
    .from("kpi_acquisition_subject_bindings")
    .select("subject_id,source")
    .eq("journey_id", journeyResult.data.journey_id)
    .single();
  if (bindingResult.error) throw bindingResult.error;
  assert.equal(bindingResult.data.subject_id, bound.data);

  const subjectResult = await admin
    .from("kpi_subjects")
    .select("subject_id,source_user_id,detached_at")
    .eq("subject_id", bound.data)
    .single();
  if (subjectResult.error) throw subjectResult.error;
  assert.equal(subjectResult.data.source_user_id, auth.data.user.id);
  assert.equal(subjectResult.data.detached_at, null);

  return {
    source,
    campaign: landing.utm_campaign,
    content: landing.utm_content,
    journeyId: journeyResult.data.journey_id,
    subjectId: bound.data,
    userId: auth.data.user.id,
    retry: "PASS",
    canonicalBinding: "PASS",
  };
}

const results = [];
results.push(await runJourney("x", "x-video-a", 1));
results.push(await runJourney("meta", "meta-static-a", 2));
results.push(await runJourney("direct", null, 3));

console.log(JSON.stringify({
  projectRef: actualProjectRef,
  journeys: results,
  authUpgradeRebind: "PASS",
}, null, 2));
