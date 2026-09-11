import { chromium, devices } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { spawnSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const environment = String(process.env.NEXT_PUBLIC_APP_ENV || "preview").toLowerCase();
const allowedRefs = { development: "vosbyukxmskvisbgleug", preview: "sufvuqdnqohpfzkwxohq" };
const previewUrl = process.env.MOBILE_PREVIEW_URL || (environment === "development" ? "http://127.0.0.1:3000" : "https://tribe-neon-mobile-preview.vercel.app");
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
let serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const selfScopedQa = process.env.M9X_SELF_SCOPED_QA === "1";
const expectedRef = process.env.SUPABASE_EXPECTED_PROJECT_REF || process.env.SUPABASE_PREVIEW_PROJECT_REF;
const accessToken = process.env.SUPABASE_ACCESS_TOKEN;

if (!supabaseUrl || !expectedRef || !(environment in allowedRefs)) {
  throw new Error("Development/Preview Supabase URL and expected project ref are required.");
}
const actualRef = new URL(supabaseUrl).hostname.split(".")[0];
if (actualRef !== expectedRef || actualRef !== allowedRefs[environment]) {
  throw new Error(`Refusing mismatched or Production Supabase target: environment=${environment}, ref=${actualRef}`);
}
if (!serviceRoleKey && accessToken) {
  const keysResponse = await fetch(`https://api.supabase.com/v1/projects/${actualRef}/api-keys`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!keysResponse.ok) throw new Error(`Could not resolve ${environment} QA key: ${keysResponse.status}`);
  const keys = await keysResponse.json();
  serviceRoleKey = keys.find((key) => key.name === "service_role")?.api_key;
}
if (!serviceRoleKey && !(selfScopedQa && anonKey)) throw new Error(`${environment} service-role QA key or explicit self-scoped QA mode is required.`);
const admin = createClient(supabaseUrl, serviceRoleKey || anonKey, { auth: { persistSession: false, autoRefreshToken: false } });

const artifactsDirectory = path.resolve("test-results", `m9x-${environment}-tutorial-journey`);
await mkdir(artifactsDirectory, { recursive: true });

const browser = await chromium.launch({ headless: true });
const requestedViewport = process.env.M9X_PREVIEW_VIEWPORT === "desktop" ? "desktop" : "390";
const context = await browser.newContext(requestedViewport === "desktop"
  ? { viewport: { width: 1280, height: 900 } }
  : { ...devices["iPhone 13"] });
const page = await context.newPage();
const pageErrors = [];
const consoleErrors = [];
const failedResponses = [];
let userId = null;
let trace = [];
const acquisitionAudit = {};
const battleNetworkTrace = [];
let completedBattlePresentation = { history: [] };
const qaUsername = `QA${Date.now().toString(36).slice(-6)}`;
const resumeAudits = [];

const snapshotAcquisitionState = async (label) => {
  if (!userId) throw new Error(`Cannot snapshot ${label} without the Preview QA user id.`);
  const [{ data: characters, error: characterError }, { data: formation, error: formationError }, { data: history, error: historyError }, { data: profile, error: profileError }, { data: tutorial, error: tutorialError }, { data: patrols, error: patrolError }, { data: skills, error: skillError }, { data: equipment, error: equipmentError }] = await Promise.all([
    admin.from("user_characters").select("id,character_id,level,awakening_level,created_at").eq("user_id", userId).order("created_at"),
    admin.from("user_main_formations").select("slot,user_character_id").eq("user_id", userId).order("slot"),
    admin.from("gacha_execution_history").select("request_id,gacha_id,status,result_payload,created_at").eq("user_id", userId).order("created_at"),
    admin.from("users").select("favorite_character_id").eq("id", userId).single(),
    admin.from("tutorial_progress").select("step_id").eq("user_id", userId).single(),
    admin.from("user_patrols").select("id,status,character_id,has_battle_event,battle_resolved,expires_at").eq("user_id", userId).order("started_at"),
    admin.from("user_skills").select("id,skill_card_id,equipped_character_id,slot_index").eq("user_id", userId).order("created_at"),
    admin.from("user_equipments").select("id,equipment_id,equipped_character_id,slot_index").eq("user_id", userId).order("created_at"),
  ]);
  const errors = { characterError, formationError, historyError, profileError, tutorialError, patrolError, skillError, equipmentError };
  if (!selfScopedQa && Object.values(errors).some(Boolean)) throw new Error(`Acquisition snapshot ${label} failed: ${JSON.stringify(errors)}`);
  acquisitionAudit[label] = { characters: characters || [], formation: formation || [], history: history || [], profile, tutorial, patrols: patrols || [], skills: skills || [], equipment: equipment || [], selfScopedErrors: selfScopedQa ? errors : undefined };
};

page.on("pageerror", (error) => pageErrors.push(error.message));
page.on("console", (message) => {
  if (message.type() === "error") consoleErrors.push(message.text());
});
page.on("response", (response) => {
  const requestUrl = new URL(response.url());
  if (requestUrl.pathname.includes("/rpc/start_patrol") || requestUrl.pathname.includes("/rpc/create_patrol_battle_replay") || requestUrl.pathname.includes("/functions/v1/resolve-battle")) {
    battleNetworkTrace.push({
      method: response.request().method(),
      pathname: requestUrl.pathname,
      status: response.status(),
      occurredAt: new Date().toISOString(),
    });
  }
  if (response.status() < 400) return;
  failedResponses.push({ status: response.status(), pathname: requestUrl.pathname });
});

const visible = async (selector, timeout = 20_000) => {
  const locator = page.locator(selector);
  await locator.waitFor({ state: "visible", timeout });
  return locator;
};

const resumeAfterReload = async (label) => {
  trace.push(...await page.evaluate(() => window.__TRIBE_TUTORIAL_JOURNEY_TRACE__ || []).catch(() => []));
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {});
  await page.waitForTimeout(500);
  const continueButton = page.getByRole("button", { name: /続きから|チュートリアルを続ける/ });
  for (let attempt = 0; attempt < 6 && !(await continueButton.isVisible()); attempt += 1) {
    const titleTap = page.locator(".title-tap-text");
    if (await titleTap.isVisible()) await titleTap.click();
    await continueButton.waitFor({ state: "visible", timeout: 5_000 }).catch(() => {});
  }
  await continueButton.click();
  const loading = await visible(".game-start-transition", 10_000);
  const loadingCopy = (await loading.textContent())?.trim() || "";
  const exposedSurface = await page.locator(".char-tab-container,.mypage-container,.patrol-container,.quest-battle-viewer,.sb-root").evaluateAll((nodes) => nodes.some((node) => {
    const element = node;
    return element.offsetParent !== null && getComputedStyle(element).visibility !== "hidden";
  }));
  if (exposedSurface) throw new Error(`Resume exposed an intermediate game surface: ${label}`);
  resumeAudits.push({ label, firstPaint: loadingCopy, exposedSurface });
};

try {
  await page.goto(previewUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
  const legacyTitleTap = await visible(".title-tap-text", 30_000);
  await legacyTitleTap.click();
  await (await visible(".title-entry-primary")).click();

  await visible('[data-entry-state="WORLD_INFORMATION"]');
  const worldCharacters = [];
  for (const expected of ["レイジ", "アゲハ", "ゴウ"]) {
    await page.waitForFunction((name) => document.querySelector('[data-world-stage="1"]')?.getAttribute("data-character") === name, expected, { timeout: 10_000 });
    worldCharacters.push(expected);
  }
  await (await visible('[data-world-stage="1"] .setup-world-tap', 10_000)).click();
  for (const expected of ["カレン", "カエデ"]) {
    await page.waitForFunction((name) => document.querySelector('[data-world-stage="2"]')?.getAttribute("data-character") === name, expected, { timeout: 10_000 });
    worldCharacters.push(expected);
  }
  await (await visible('[data-world-stage="2"] .setup-world-tap', 10_000)).click();
  await visible('[data-world-stage="3"] .setup-world-logo', 10_000);
  await page.waitForFunction(() => {
    const logo = document.querySelector('[data-world-stage="3"] .setup-world-logo');
    return logo instanceof HTMLImageElement && logo.complete && logo.naturalWidth > 0;
  }, undefined, { timeout: 10_000 });
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(artifactsDirectory, "preview-world-introduction.png"), fullPage: true });
  await (await visible('[data-world-stage="3"] .setup-world-tap', 10_000)).click();
  await visible('[data-entry-state="AGEHA_INTRO"]');
  await page.locator(".setup-ageha-presentation .setup-primary-action").click();
  await visible('[data-entry-state="NAME_INPUT"]');
  await page.locator("#setup-player-name").fill(qaUsername);
  await page.locator(".setup-name-dialog .setup-primary-action").click();

  // Preview cold starts may still be finishing the existing full bootstrap
  // after the authoritative profile transaction. This is a harness ceiling,
  // not a presentation delay introduced by the Battle remediation.
  await visible(".tutorial-world", 60_000);
  userId = await page.evaluate(() => {
    const authKey = Object.keys(localStorage).find((key) => /^sb-.*-auth-token$/.test(key));
    if (!authKey) return null;
    try { return JSON.parse(localStorage.getItem(authKey) || "null")?.user?.id || null; } catch { return null; }
  });
  if (!userId) {
    const { data: qaProfile, error: qaProfileError } = await admin.from("users").select("id").eq("username", qaUsername).single();
    if (qaProfileError) throw qaProfileError;
    userId = qaProfile?.id || null;
  }
  if (selfScopedQa) {
    const browserSession = await page.evaluate(() => {
      const authKey = Object.keys(localStorage).find((key) => /^sb-.*-auth-token$/.test(key));
      if (!authKey) return null;
      try { return JSON.parse(localStorage.getItem(authKey) || "null"); } catch { return null; }
    });
    if (!browserSession?.access_token || !browserSession?.refresh_token) throw new Error("Self-scoped QA session could not be resolved.");
    const { error: sessionError } = await admin.auth.setSession({ access_token: browserSession.access_token, refresh_token: browserSession.refresh_token });
    if (sessionError) throw sessionError;
  }
  await snapshotAcquisitionState("INITIAL_CHARACTER");
  await page.locator(".tutorial-world button").click();
  await (await visible(".gacha-free-btn", 25_000)).click();
  await (await visible(".cg-opening", 25_000)).click();
  const reveal = page.locator(".cg-reveal");
  const resultPanel = page.locator(".cg-summary");
  for (let transition = 0; transition < 50 && !(await resultPanel.isVisible()); transition += 1) {
    await page.waitForFunction(() => ["QUOTE", "REVEAL", "SETTLED", "SUMMARY"].includes(document.querySelector(".cg-shell")?.getAttribute("data-stage")), undefined, { timeout: 20_000 });
    if (await resultPanel.isVisible()) break;
    await reveal.click();
    await page.waitForTimeout(250);
  }

  await resultPanel.waitFor({ state: "visible", timeout: 20_000 });
  await snapshotAcquisitionState("TUTORIAL_GACHA_RESULT");
  await page.screenshot({ path: path.join(artifactsDirectory, "preview-gacha-result.png"), fullPage: true });
  await (await visible(".cg-continue", 20_000)).click();
  await page.screenshot({ path: path.join(artifactsDirectory, "preview-formation-owned.png"), fullPage: true });
  await (await visible(".char-party-auto-btn", 20_000)).click();
  const formationCompletion = await visible('[data-acceptance-state="AUTO_FORMATION_COMPLETE"]', 20_000);
  await formationCompletion.getByRole("button", { name: "OK" }).click();
  const skillStep = await visible('[data-acceptance-state="TUTORIAL_SKILL_STEP"]', 20_000);
  for (const skillId of ["SKILL_001", "SKILL_003", "SKILL_022"]) {
    if (await skillStep.locator(`[data-skill-id="${skillId}"]`).count() !== 1) throw new Error(`Missing tutorial Skill card: ${skillId}`);
  }
  await page.waitForFunction(() => Array.from(document.querySelectorAll('[data-acceptance-state="TUTORIAL_SKILL_STEP"] .shared-skill-icon img'))
    .filter((image) => image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0).length === 3, undefined, { timeout: 10_000 });
  if (await page.locator('[data-acceptance-state="TUTORIAL_GROWTH_STEP"]').count()) throw new Error("Level Up Tutorial must not be rendered.");
  await page.screenshot({ path: path.join(artifactsDirectory, "preview-tutorial-skills.png"), fullPage: true });
  await page.getByRole("button", { name: "装備する" }).click();
  await visible('[data-acceptance-state="Q1"]', 30_000);
  await snapshotAcquisitionState("RECOMMENDED_FORMATION");
  const tutorialSkills = acquisitionAudit.RECOMMENDED_FORMATION.skills || [];
  for (const skillId of ["SKILL_001", "SKILL_003", "SKILL_022"]) {
    const matches = tutorialSkills.filter((skill) => skill.skill_card_id === skillId && Number(skill.slot_index) === 0 && skill.equipped_character_id);
    if (matches.length !== 1) throw new Error(`Tutorial Skill assignment is not canonical: ${skillId} ${JSON.stringify(matches)}`);
  }
  if ((acquisitionAudit.RECOMMENDED_FORMATION.equipment || []).length !== 5) {
    throw new Error(`Initial Equipment handoff did not persist five items: ${JSON.stringify(acquisitionAudit.RECOMMENDED_FORMATION.equipment)}`);
  }
  await page.screenshot({ path: path.join(artifactsDirectory, "preview-formation-skill.png"), fullPage: true });

  const stateSequence = [];
  const recordState = async (state, timeout = 25_000) => {
    await visible(`[data-acceptance-state="${state}"]`, timeout);
    stateSequence.push(state);
  };
  await recordState("Q1");
  await page.locator('[data-acceptance-state="Q1"] button').click();
  await recordState("Q2");
  await recordState("Q3");
  await page.locator('[data-acceptance-state="Q3"] button').evaluate((button) => {
    button.click();
    button.click();
  });
  await recordState("Q4");
  await recordState("Q5");
  await snapshotAcquisitionState("TUTORIAL_SPEEDUP");
  trace.push(...await page.evaluate(() => window.__TRIBE_TUTORIAL_JOURNEY_TRACE__ || []));
  await resumeAfterReload("QUEST_SPEEDUP_COMPLETE");
  await visible('[data-acceptance-state="Q5"]', 30_000);
  await page.waitForFunction(() => {
    const button = document.querySelector('[data-acceptance-state="Q5"] button');
    return button instanceof HTMLButtonElement && !button.disabled;
  }, undefined, { timeout: 20_000 });
  await page.locator('[data-acceptance-state="Q5"] button').click();
  await recordState("Q6");
  await resumeAfterReload("BATTLE_READY");
  await visible('[data-acceptance-state="Q5"],[data-acceptance-state="Q6"]', 30_000);
  if (await page.locator('[data-acceptance-state="Q5"]').isVisible()) {
    await page.locator('[data-acceptance-state="Q5"] button').click();
  }
  await visible('[data-acceptance-state="Q6"]', 30_000);
  await page.waitForFunction(() => {
    const button = document.querySelector('[data-acceptance-state="Q6"] button');
    return button instanceof HTMLButtonElement && !button.disabled;
  }, undefined, { timeout: 10_000 });
  if (process.env.M9X_PROBE_CONCURRENT_CREATE === "1") {
    const authState = await page.evaluate(() => {
      const authKey = Object.keys(localStorage).find((key) => /^sb-.*-auth-token$/.test(key));
      if (!authKey) return null;
      try { return JSON.parse(localStorage.getItem(authKey) || "null"); } catch { return null; }
    });
    const accessToken = authState?.access_token;
    const patrolId = acquisitionAudit.TUTORIAL_SPEEDUP?.patrols?.find((entry) => entry.has_battle_event && !entry.battle_resolved)?.id;
    if (!accessToken || !patrolId) throw new Error("Concurrent create probe could not resolve the authenticated patrol context.");
    const probeClient = createClient(supabaseUrl, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    });
    const createResponses = await Promise.all([
      probeClient.rpc("create_patrol_battle_replay", { p_patrol_id: patrolId, p_tactic_id: "ATTACK_PRIORITY" }),
      probeClient.rpc("create_patrol_battle_replay", { p_patrol_id: patrolId, p_tactic_id: "ATTACK_PRIORITY" }),
    ]);
    const { data: replayRows, error: replayRowsError } = await admin.from("battle_replay_sessions")
      .select("id,status,resolution_authority,finalization_status,result")
      .eq("requester_user_id", userId)
      .eq("source_reference_id", patrolId)
      .order("created_at");
    if (replayRowsError) throw replayRowsError;
    const probeReport = { patrolId, createResponses, replayRows };
    await writeFile(path.join(artifactsDirectory, "preview-concurrent-create-probe.json"), `${JSON.stringify(probeReport, null, 2)}\n`, "utf8");
    console.log(JSON.stringify({ status: "DIAGNOSTIC", concurrentCreateProbe: probeReport }, null, 2));
    if ((replayRows || []).length !== 1) {
      throw new Error(`Confirmed duplicate patrol replay creation: ${JSON.stringify(probeReport)}`);
    }
  }

  await page.locator('[data-acceptance-state="Q6"] button').evaluate((button) => {
    button.click();
    button.click();
  });
  await recordState("B1");

  await page.screenshot({ path: path.join(artifactsDirectory, "preview-B1.png"), fullPage: true });
  await page.locator('[data-acceptance-state="B1"] .start-battle-btn').click();
  await recordState("B2");
  await visible(".sb-root", 30_000);
  const speedToggle = page.locator(".sb-controls button").filter({ hasText: /^×[123]$/ }).first();
  if ((await speedToggle.textContent())?.trim() === "×1") {
    await speedToggle.click();
  }
  await page.locator('.sb-root[data-battle-speed="2"]').waitFor({ state: "visible", timeout: 10_000 });
  await page.waitForFunction(() => (window.__TRIBE_BATTLE_PRESENTATION__?.history || []).some((entry) => entry?.kind === "normal" && entry?.actionCompleteAt), undefined, { timeout: 45_000, polling: 50 });
  stateSequence.push("B3");
  await resumeAfterReload("BATTLE_IN_PROGRESS");
  await visible(".sb-root", 30_000);
  await page.waitForFunction(() => (window.__TRIBE_BATTLE_PRESENTATION__?.history || []).some((entry) => entry?.kind === "skill" && entry?.actionCompleteAt), undefined, { timeout: 45_000, polling: 50 });
  stateSequence.push("B4");
  await page.screenshot({ path: path.join(artifactsDirectory, "preview-B4.png"), fullPage: true });
  await page.screenshot({ path: path.join(artifactsDirectory, "preview-enemy-impact-damage.png"), fullPage: true });
  await visible('[data-acceptance-state="B6"]', 180_000);
  stateSequence.push("B5", "B6");
  await page.screenshot({ path: path.join(artifactsDirectory, "preview-B6.png"), fullPage: true });
  completedBattlePresentation = await page.evaluate(() => window.__TRIBE_BATTLE_PRESENTATION__ || { history: [] });
  await page.locator('[data-acceptance-state="B6"] button').click();

  await visible('[data-acceptance-state="FINAL_GUIDE"]', 20_000);
  await page.screenshot({ path: path.join(artifactsDirectory, "preview-final-guide.png"), fullPage: true });
  await page.getByRole("button", { name: "街へ出る →" }).click();
  await visible(".modal-overlay.background-black-95 .modal-card", 20_000);
  stateSequence.push("ACCOUNT_AUTHENTICATION");
  await page.screenshot({ path: path.join(artifactsDirectory, "preview-account-authentication.png"), fullPage: true });
  const browserState = await page.evaluate(() => {
    const authKey = Object.keys(localStorage).find((key) => /^sb-.*-auth-token$/.test(key));
    let storedUserId = null;
    if (authKey) {
      try { storedUserId = JSON.parse(localStorage.getItem(authKey) || "null")?.user?.id || null; } catch { /* audit below */ }
    }
    return {
      userId: storedUserId,
      trace: window.__TRIBE_TUTORIAL_JOURNEY_TRACE__ || [],
      actionMetrics: window.__TRIBE_ACTION_METRICS__ || [],
      battlePresentation: window.__TRIBE_BATTLE_PRESENTATION__ || { history: [] },
      errorDialogs: Array.from(document.querySelectorAll(".modal-card.border-danger,[role=alert]")).map((node) => node.textContent?.trim()).filter(Boolean),
    };
  });
  userId = browserState.userId;
  trace = [...trace, ...browserState.trace];
  if (!userId) throw new Error("The anonymous Preview user id could not be resolved from the browser session.");
  if (browserState.errorDialogs.length) throw new Error(`Unexpected error UI: ${browserState.errorDialogs.join(" | ")}`);
  if (pageErrors.length) throw new Error(`Browser page errors: ${pageErrors.join(" | ")}`);
  if (stateSequence.join(">") !== "Q1>Q2>Q3>Q4>Q5>Q6>B1>B2>B3>B4>B5>B6>ACCOUNT_AUTHENTICATION") {
    throw new Error(`Unexpected UI state sequence: ${stateSequence.join(">")}`);
  }
  const requiredTracePhases = ["dispatch_request", "dispatch_committed", "speed_up_request", "speed_up_committed", "quest_completion_observed", "quest_return_confirmed", "battle_cta_request"];
  const tracePhases = new Set(trace.map((entry) => entry.phase));
  const missingTracePhases = requiredTracePhases.filter((phase) => !tracePhases.has(phase));
  if (missingTracePhases.length) throw new Error(`Missing journey trace phases: ${missingTracePhases.join(", ")}`);
  const completedBattleActions = (completedBattlePresentation.history || browserState.battlePresentation.history || []).filter((entry) => entry?.actionCompleteAt);
  const normalMetric = completedBattleActions.find((entry) => entry.kind === "normal");
  if (!normalMetric) throw new Error("Completed normal action presentation timing is missing.");
  for (const metric of completedBattleActions) {
    const kind = metric.kind || "unknown";
    const stages = metric && [metric.actorFocusAt, metric.impactAt, metric.damageAt, metric.hpSettledAt, metric.actionCompleteAt];
    if (!stages.every((value) => typeof value === "number") || stages.some((value, index) => index > 0 && value < stages[index - 1])) {
      throw new Error(`Incomplete ${kind} action presentation timing: ${JSON.stringify(metric)}`);
    }
    if (!metric.targetId) throw new Error(`Missing ${kind} target presentation identity: ${JSON.stringify(metric)}`);
  }

  let selfScopedReplayContract = null;
  if (selfScopedQa) {
    const { data: replay, error: replayError } = await admin.from("battle_replay_sessions")
      .select("player_snapshot,enemy_snapshot,result")
      .eq("requester_user_id", userId)
      .eq("battle_mode", "QUEST")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    if (replayError) throw new Error(`Self-scoped replay query failed: ${JSON.stringify(replayError)}`);
    const events = Array.isArray(replay?.result?.events) ? replay.result.events : [];
    const actionIndex = (skillId, actorId) => events.findIndex((event) => event.type === "ACTION" && event.payload?.skillId === skillId && (!actorId || event.payload?.actorId === actorId));
    const openingIndex = actionIndex("SKILL_001");
    const enemyAttackIndex = actionIndex("BASIC_ATTACK", replay?.enemy_snapshot?.[0]?.id);
    const healActionIndex = actionIndex("SKILL_003");
    const healEventIndex = events.findIndex((event, index) => index > healActionIndex && event.type === "HEAL" && Number(event.payload?.effectiveAmount || 0) > 0);
    const finisherIndex = actionIndex("SKILL_022");
    const finisherRound = Number(events[finisherIndex]?.round);
    const defeatedEnemyCount = new Set(events.slice(finisherIndex + 1)
      .filter((event) => event.type === "DEFEAT" && String(event.payload?.targetId || "").startsWith("enemy_"))
      .map((event) => event.payload.targetId)).size;
    if (!(openingIndex >= 0 && enemyAttackIndex > openingIndex && healActionIndex > enemyAttackIndex
        && healEventIndex > healActionIndex && finisherIndex > healEventIndex && finisherRound === 2
        && defeatedEnemyCount === (replay?.enemy_snapshot || []).length && replay?.result?.winner === "PLAYER")) {
      throw new Error(`Self-scoped authored battle contract failed: ${JSON.stringify({ openingIndex, enemyAttackIndex, healActionIndex, healEventIndex, finisherIndex, finisherRound, defeatedEnemyCount, enemyCount: replay?.enemy_snapshot?.length, winner: replay?.result?.winner })}`);
    }
    selfScopedReplayContract = { openingIndex, enemyAttackIndex, healActionIndex, healEventIndex, finisherIndex, finisherRound, defeatedEnemyCount, winner: replay.result.winner };
    const report = {
      status: "PASS",
      previewUrl,
      projectRef: actualRef,
      environment,
      viewport: requestedViewport,
      userId,
      uiOnly: true,
      selfScopedQa: true,
      directStateMutation: false,
      stateSequence,
      pageErrors,
      consoleErrors,
      failedResponses,
      actionMetrics: browserState.actionMetrics,
      battlePresentation: browserState.battlePresentation,
      trace,
      battleNetworkTrace,
      resumeAudits,
      acquisitionAudit,
      worldCharacters,
      replayContract: selfScopedReplayContract,
      artifact: path.join(artifactsDirectory, "preview-B1.png"),
    };
    await writeFile(path.join(artifactsDirectory, "preview-journey-report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
    console.log(JSON.stringify(report, null, 2));
  } else {
  const [{ data: skills, error: skillError }, { data: replay, error: replayError }, { count: skillGachaCount, error: skillGachaError }] = await Promise.all([
    admin.from("user_skills").select("id,skill_card_id,plus_val,equipped_character_id,slot_index").eq("user_id", userId),
    admin.from("battle_replay_sessions").select("player_snapshot,enemy_snapshot,result").eq("requester_user_id", userId).eq("battle_mode", "QUEST").order("created_at", { ascending: false }).limit(1).single(),
    admin.from("gacha_execution_history").select("request_id", { count: "exact", head: true }).eq("user_id", userId).like("gacha_id", "SKILL%"),
  ]);
  if (skillError || replayError || skillGachaError) {
    throw new Error(`Preview contract query failed: ${JSON.stringify({ skillError, replayError, skillGachaError })}`);
  }
  const starterSkills = (skills || []).filter((skill) => ["SKILL_001", "SKILL_003", "SKILL_022"].includes(skill.skill_card_id));
  if (starterSkills.length !== 3 || new Set(starterSkills.map((skill) => skill.skill_card_id)).size !== 3
      || starterSkills.some((skill) => Number(skill.plus_val) !== 0 || Number(skill.slot_index) !== 0 || !skill.equipped_character_id)) {
    throw new Error(`Invalid tutorial Skill ownership: ${JSON.stringify(starterSkills)}`);
  }
  if (skillGachaCount !== 0) throw new Error("Tutorial starter skill incorrectly created Skill Gacha history.");
  const events = Array.isArray(replay?.result?.events) ? replay.result.events : [];
  const actionIndex = (skillId, actorId) => events.findIndex((event) => event.type === "ACTION" && event.payload?.skillId === skillId && (!actorId || event.payload?.actorId === actorId));
  const openingIndex = actionIndex("SKILL_001");
  const firstEnemyId = replay?.enemy_snapshot?.[0]?.id;
  const enemyAttackIndex = actionIndex("BASIC_ATTACK", firstEnemyId);
  const healActionIndex = actionIndex("SKILL_003");
  const healEventIndex = events.findIndex((event, index) => index > healActionIndex && event.type === "HEAL" && Number(event.payload?.effectiveAmount || 0) > 0);
  const finisherIndex = actionIndex("SKILL_022");
  const finisherEvent = events[finisherIndex];
  const defeatedAfterFinisher = new Set(events.slice(finisherIndex + 1)
    .filter((event) => event.type === "DEFEAT" && String(event.payload?.targetId || "").startsWith("enemy_"))
    .map((event) => event.payload.targetId));
  if (!(openingIndex >= 0 && enemyAttackIndex > openingIndex && healActionIndex > enemyAttackIndex
      && healEventIndex > healActionIndex && finisherIndex > healEventIndex
      && Number(finisherEvent?.round) === 2 && defeatedAfterFinisher.size === (replay?.enemy_snapshot || []).length)) {
    throw new Error(`Authored Tutorial Battle sequence is incomplete: ${JSON.stringify({ openingIndex, enemyAttackIndex, healActionIndex, healEventIndex, finisherIndex, finisherRound: finisherEvent?.round, defeatedAfterFinisher: [...defeatedAfterFinisher] })}`);
  }
  if (replay?.result?.winner !== "PLAYER") throw new Error("Tutorial expected winner was not preserved.");

  const initialCharacters = acquisitionAudit.INITIAL_CHARACTER?.characters || [];
  if (initialCharacters.length !== 0) {
    throw new Error(`Fresh-player roster must be empty before tutorial gacha: ${JSON.stringify(initialCharacters)}`);
  }
  if ((acquisitionAudit.INITIAL_CHARACTER?.formation || []).length !== 0 || (acquisitionAudit.INITIAL_CHARACTER?.history || []).length !== 0) {
    throw new Error(`Fresh-player formation/gacha history must be empty: ${JSON.stringify(acquisitionAudit.INITIAL_CHARACTER)}`);
  }
  if (acquisitionAudit.INITIAL_CHARACTER?.profile?.favorite_character_id !== null
      || acquisitionAudit.INITIAL_CHARACTER?.tutorial?.step_id !== "WORLD_INTRO"
      || (acquisitionAudit.INITIAL_CHARACTER?.patrols || []).length !== 0) {
    throw new Error(`Fresh-player profile/tutorial/patrol contract failed: ${JSON.stringify(acquisitionAudit.INITIAL_CHARACTER)}`);
  }
  const tutorialHistory = acquisitionAudit.TUTORIAL_GACHA_RESULT?.history || [];
  const tutorialResults = tutorialHistory.at(-1)?.result_payload?.results || [];
  const guaranteedResult = tutorialResults[9];
  if (!guaranteedResult?.character_id || String(guaranteedResult.rarity).toUpperCase() !== "SSR") {
    throw new Error(`Tutorial tenth-result SSR contract failed: ${JSON.stringify(guaranteedResult)}`);
  }
  const postGachaOwnedIds = new Set((acquisitionAudit.TUTORIAL_GACHA_RESULT?.characters || []).map((character) => character.id));
  const guaranteedOwned = (acquisitionAudit.TUTORIAL_GACHA_RESULT?.characters || []).find((character) => character.character_id === guaranteedResult.character_id);
  if (!guaranteedOwned) throw new Error(`Tenth SSR is not owned after gacha: ${JSON.stringify(guaranteedResult)}`);
  const formationRows = acquisitionAudit.RECOMMENDED_FORMATION?.formation || [];
  const unownedFormationRows = formationRows.filter((row) => !postGachaOwnedIds.has(row.user_character_id));
  if (formationRows.length !== 5 || unownedFormationRows.length || !formationRows.some((row) => row.user_character_id === guaranteedOwned.id)) {
    throw new Error(`Recommended formation contains an unowned character: ${JSON.stringify({ formationRows, unownedFormationRows })}`);
  }
  const dispatchTrace = trace.find((entry) => entry.phase === "dispatch_committed");
  if (dispatchTrace?.dispatchedCharacterId !== guaranteedResult.character_id) {
    throw new Error(`Tenth SSR continuity drifted before dispatch: ${JSON.stringify({ guaranteedResult, dispatchTrace })}`);
  }
  const speedupPatrols = acquisitionAudit.TUTORIAL_SPEEDUP?.patrols || [];
  const tutorialPatrol = speedupPatrols.find((patrol) => patrol.character_id === guaranteedResult.character_id);
  if (!tutorialPatrol || tutorialPatrol.status !== "CLAIMABLE" || tutorialPatrol.has_battle_event !== true || tutorialPatrol.battle_resolved !== false
      || new Date(tutorialPatrol.expires_at).getTime() > Date.now() + 1000
      || acquisitionAudit.TUTORIAL_SPEEDUP?.tutorial?.step_id !== "TUTORIAL_BATTLE") {
    throw new Error(`Tutorial speed-up authoritative state failed: ${JSON.stringify(acquisitionAudit.TUTORIAL_SPEEDUP)}`);
  }

  const [{ data: finalPatrol, error: finalPatrolError }, { data: patrolReplays, error: patrolReplayError }] = await Promise.all([
    admin.from("user_patrols").select("id,status,battle_resolved,battle_result").eq("id", tutorialPatrol.id).single(),
    admin.from("battle_replay_sessions").select("id,status,resolution_authority,finalization_status,result").eq("requester_user_id", userId).eq("source_reference_id", tutorialPatrol.id).order("created_at"),
  ]);
  if (finalPatrolError || patrolReplayError) throw new Error(`Battle resolve audit query failed: ${JSON.stringify({ finalPatrolError, patrolReplayError })}`);
  const canonicalReplay = patrolReplays?.[0];
  if (patrolReplays?.length !== 1 || !canonicalReplay || canonicalReplay.status !== "RESOLVED" || canonicalReplay.finalization_status !== "NOT_REQUIRED"
      || finalPatrol?.battle_resolved !== true || !canonicalReplay.result || !finalPatrol.battle_result) {
    throw new Error(`Battle resolve contract drift: ${JSON.stringify({ finalPatrol, patrolReplays })}`);
  }
  const createResponses = battleNetworkTrace.filter((entry) => entry.pathname.includes("create_patrol_battle_replay"));
  const resolveResponses = battleNetworkTrace.filter((entry) => entry.pathname.includes("resolve-battle"));
  const dispatchResponses = battleNetworkTrace.filter((entry) => entry.pathname.includes("/rpc/start_patrol"));
  if (dispatchResponses.length !== 1 || dispatchResponses[0]?.status >= 400) {
    throw new Error(`Fresh tutorial dispatch RPC count drifted: ${JSON.stringify(dispatchResponses)}`);
  }
  if (process.env.M9X_PROBE_CONCURRENT_CREATE !== "1" && (createResponses.length !== 1 || resolveResponses.length !== 1)) {
    throw new Error(`Battle start handler was re-entered: ${JSON.stringify({ createResponses, resolveResponses })}`);
  }

  const enemyParticipantIds = new Set((replay?.enemy_snapshot || []).map((participant) => String(participant.id)));
  const replayEvents = Array.isArray(replay?.result?.events) ? replay.result.events : [];
  const authoritativeActions = replayEvents.flatMap((event, index) => {
    if (event.type !== "ACTION") return [];
    const unit = replayEvents.slice(index + 1);
    const nextActionOffset = unit.findIndex((candidate) => candidate.type === "ACTION");
    const bounded = nextActionOffset < 0 ? unit : unit.slice(0, nextActionOffset);
    const impact = bounded.find((candidate) => ["DAMAGE", "HEAL", "STATUS", "EFFECT"].includes(candidate.type)
      && candidate.payload?.kind !== "ACTIVE_EFFECT_SYNC");
    return [{ actorId: String(event.payload?.actorId || ""), targetId: String(event.payload?.targetId || impact?.payload?.targetId || "") }];
  });
  const completedPresentationActions = [...(browserState.battlePresentation.history || []), browserState.battlePresentation.current]
    .filter((entry) => entry?.actionCompleteAt);
  const enemyPresentationActions = completedPresentationActions.filter((entry) => enemyParticipantIds.has(String(entry.actorId))).slice(0, 3);
  if (enemyPresentationActions.length < 3) {
    throw new Error(`Expected at least 3 Enemy presentation actions: ${JSON.stringify({
      enemyPresentationActions,
      enemyParticipantIds: [...enemyParticipantIds],
      completedPresentationActorIds: completedPresentationActions.map((entry) => String(entry.actorId)),
      authoritativeEnemyActions: authoritativeActions.filter((entry) => enemyParticipantIds.has(entry.actorId)),
    })}`);
  }
  for (const presentation of enemyPresentationActions) {
    const stageTargets = [presentation.targetFocusAtTargetId, presentation.impactAtTargetId, presentation.damageAtTargetId, presentation.hpSettledAtTargetId].filter(Boolean);
    const presentedTargetId = String(presentation.targetId || stageTargets[0] || "");
    const authoritative = authoritativeActions.find((action) => action.actorId === String(presentation.actorId) && action.targetId === presentedTargetId);
    if (!authoritative || stageTargets.some((target) => target !== authoritative.targetId)) {
      throw new Error(`Enemy presentation target drift: ${JSON.stringify({ presentation, authoritative, stageTargets })}`);
    }
  }

  const report = {
    status: "PASS",
    previewUrl,
    projectRef: actualRef,
    environment,
    viewport: requestedViewport,
    userId,
    uiOnly: true,
    directStateMutation: false,
    stateSequence,
    pageErrors,
    consoleErrors,
    failedResponses,
    actionMetrics: browserState.actionMetrics,
    battlePresentation: browserState.battlePresentation,
    trace,
    battleNetworkTrace,
    resumeAudits,
    starterSkills: starterSkills.map((skill) => ({ skillId: skill.skill_card_id, plusValue: skill.plus_val, slotIndex: skill.slot_index, characterId: skill.equipped_character_id })),
    replayContract: { openingIndex, enemyAttackIndex, healActionIndex, healEventIndex, finisherIndex, finisherRound: finisherEvent.round, defeatedEnemyCount: defeatedAfterFinisher.size, winner: replay.result.winner },
    battleResolveContract: { patrol: finalPatrol, replay: canonicalReplay, dispatchResponseCount: dispatchResponses.length, createResponseCount: createResponses.length, resolveResponseCount: resolveResponses.length },
    acquisitionAudit,
    worldCharacters,
    guaranteedTutorialSsr: guaranteedResult.character_id,
    enemyPresentationActions,
    artifact: path.join(artifactsDirectory, "preview-B1.png"),
  };
  await writeFile(path.join(artifactsDirectory, "preview-journey-report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));
  }
} catch (error) {
  trace = await page.evaluate(() => window.__TRIBE_TUTORIAL_JOURNEY_TRACE__ || []).catch(() => trace);
  const battleDiagnostics = await page.evaluate(() => ({
    presentation: window.__TRIBE_BATTLE_PRESENTATION__ || null,
    hpTrace: window.__TRIBE_BATTLE_HP_TRACE__ || [],
    actionParity: document.documentElement.dataset.battleHpActionParity || null,
  })).catch(() => null);
  await writeFile(path.join(artifactsDirectory, "preview-failure-diagnostics.json"), `${JSON.stringify(battleDiagnostics, null, 2)}\n`, "utf8").catch(() => {});
  userId ||= trace.find((entry) => typeof entry?.userId === "string")?.userId || null;
  await page.screenshot({ path: path.join(artifactsDirectory, "preview-failure.png"), fullPage: true }).catch(() => {});
  console.error(JSON.stringify({ status: "FAIL", previewUrl, userId, pageErrors, consoleErrors, failedResponses, trace }, null, 2));
  throw error;
} finally {
  await context.close();
  await browser.close();
  if (userId) {
    if (selfScopedQa) {
      const { error } = await admin.rpc("discard_current_anonymous_account_for_switch");
      if (error && !/not found/i.test(error.message)) console.warn(`Disposable self-scoped QA user cleanup needs follow-up: ${userId} (${error.message})`);
    } else if (accessToken) {
      const cleanup = spawnSync(process.execPath, ["scripts/cleanup_preview_qa_users.mjs", userId, "--environment", environment], {
        cwd: process.cwd(),
        env: process.env,
        encoding: "utf8",
      });
      if (cleanup.status !== 0) console.warn(`Disposable Preview user cleanup needs follow-up: ${userId} (${cleanup.stderr || cleanup.stdout})`);
    } else {
      const { error } = await admin.auth.admin.deleteUser(userId);
      if (error && !/not found/i.test(error.message)) {
        console.warn(`Disposable Preview Auth cleanup needs follow-up: ${userId} (${error.message})`);
      }
    }
  }
}
