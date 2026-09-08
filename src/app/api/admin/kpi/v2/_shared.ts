import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { calculateCommunityContinuity, calculateFormalOpenStatus, calculateFormalRetention } from "@/utils/kpiFormalOpen";

import { unionTutorialCompletions, TUTORIAL_UNION_AUTHORITY, type TutorialSubject } from "@/utils/kpiTutorialCompletion";

export const TIMEZONE = "Asia/Tokyo";
export const DEFINITION_VERSION = "kpi-v2-20260906";
export type MetricStatus = "PASS" | "FAIL" | "NOT_READY" | "UNAVAILABLE";

type Period = { subject_id: string; classification: string; valid_from: string; valid_to: string | null };
type PageResult<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

async function fetchAll<T>(page: (from: number, to: number) => PageResult<T>) {
  const result: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await page(from, from + 999);
    if (error) throw error;
    const rows = data || [];
    result.push(...rows);
    if (rows.length < 1000) return result;
  }
}

async function fetchBatches<T>(ids: string[], page: (ids: string[], from: number, to: number) => PageResult<T>) {
  const result: T[] = [];
  for (let offset = 0; offset < ids.length; offset += 200) {
    result.push(...await fetchAll((from, to) => page(ids.slice(offset, offset + 200), from, to)));
  }
  return result;
}

export function noStore(value: unknown, status = 200) {
  return NextResponse.json(value, { status, headers: { "Cache-Control": "no-store" } });
}

export function serviceClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || !parsed.hostname.endsWith(".supabase.co") || parsed.pathname !== "/") return null;
  } catch { return null; }
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}

function validDate(value: string | null) {
  return !!value && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

export function rangeFrom(request: NextRequest) {
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const defaultFrom = addDays(today, -29);
  const from = request.nextUrl.searchParams.get("from") || defaultFrom;
  const to = request.nextUrl.searchParams.get("to") || today;
  if (!validDate(from) || !validDate(to) || from > to || diffDays(from, to) > 366) return null;
  return { from, to, fromAt: `${from}T00:00:00+09:00`, toAt: `${addDays(to, 1)}T00:00:00+09:00`, today };
}

export function addDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function diffDays(from: string, to: string) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

function jstDate(timestamp: string) {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(timestamp));
}

async function exclusions(service: SupabaseClient): Promise<Period[]> {
  return fetchAll<Period>((from, to) => service.from("kpi_account_classification_periods")
    .select("subject_id,classification,valid_from,valid_to")
    .in("classification", ["admin", "qa", "test", "fraud_suspended"])
    .order("subject_id").order("valid_from").range(from, to));
}

function excluded(periods: Period[], subjectId: string, at: string) {
  const value = Date.parse(at);
  return periods.some((period) => period.subject_id === subjectId
    && Date.parse(period.valid_from) <= value
    && (!period.valid_to || Date.parse(period.valid_to) > value));
}

export function metric(metricKey: string, numerator: number | null, denominator: number | null, target: number | null,
  options: { pass?: boolean; observationStatus?: string; reason?: string | null; asOf?: string; coverage?: unknown } = {}) {
  const value = numerator == null || denominator == null || denominator === 0 ? null : numerator / denominator;
  const passed = options.pass ?? (target != null && value != null && value >= target);
  const status: MetricStatus = options.observationStatus === "incomplete" || denominator === 0
    ? "NOT_READY"
    : value == null ? "UNAVAILABLE"
      : passed ? "PASS" : "FAIL";
  return {
    metric_key: metricKey, definition_version: DEFINITION_VERSION, numerator, denominator, value, target,
    status, coverage: options.coverage ?? null, observation_status: options.observationStatus || "complete",
    as_of: options.asOf || new Date().toISOString(), timezone: TIMEZONE,
    reason: denominator === 0 ? options.reason || "zero_denominator" : options.reason || null,
  };
}

export function scalarMetric(metricKey: string, value: number | null, target: number | null,
  options: { pass?: boolean; status?: MetricStatus; reason?: string | null; asOf?: string; coverage?: unknown } = {}) {
  const status: MetricStatus = options.status ?? (value == null ? "NOT_READY" : (options.pass ?? (target != null && value >= target)) ? "PASS" : "FAIL");
  return {
    metric_key: metricKey, definition_version: DEFINITION_VERSION, numerator: null, denominator: null,
    value, target, status, coverage: options.coverage ?? null,
    observation_status: value == null ? "incomplete" : "complete",
    as_of: options.asOf || new Date().toISOString(), timezone: TIMEZONE,
    reason: value == null ? options.reason || "no_data" : options.reason || null,
  };
}

export async function acquisition(service: SupabaseClient, range: NonNullable<ReturnType<typeof rangeFrom>>) {
  const titleRows = await fetchAll<{ journey_id: string; occurred_at: string }>((from, to) => service.from("kpi_acquisition_journey_facts")
    .select("journey_id,occurred_at").eq("event_type", "TITLE_ARRIVED")
    .gte("occurred_at", range.fromAt).lt("occurred_at", range.toAt).range(from, to));
  const ids = [...new Set(titleRows.map((row) => row.journey_id))];
  if (!ids.length) return {
    metric: metric("acquisition.game_start_rate", null, 0, 0.8, { observationStatus: "incomplete", reason: "measurement_not_started" }),
    measurement_status: "NOT_MEASURED",
    journeys: { started_at: null, last_fact_at: null, bound: 0, unbound: 0 },
    steps: ["TITLE_ARRIVED", "TAP_TO_START", "WORLD_INTRO_STARTED", "WORLD_INTRO_COMPLETED", "NAME_COMPLETED", "GAME_START_BOUND"].map((event_type) => ({ event_type, journeys: null })),
  };
  const [{ data: journeys }, { data: bindings }, { data: allFacts }] = await Promise.all([
    service.from("kpi_acquisition_journeys").select("journey_id,started_at,source").in("journey_id", ids),
    service.from("kpi_acquisition_subject_bindings").select("journey_id,subject_id,bound_at").in("journey_id", ids),
    service.from("kpi_acquisition_journey_facts").select("journey_id,event_type,occurred_at").in("journey_id", ids).order("occurred_at", { ascending: false }),
  ]);
  const accepted = new Set(((journeys || []) as any[]).filter((row) => row.source !== "qa_v1").map((row) => row.journey_id));
  const acceptedBindings = ((bindings || []) as any[]).filter((row) => accepted.has(row.journey_id));
  const subjectIds = [...new Set(acceptedBindings.map((row) => row.subject_id))];
  const { data: subjects } = subjectIds.length
    ? await service.from("kpi_subjects").select("subject_id,registered_at").in("subject_id", subjectIds)
    : { data: [] as any[] };
  const periods = await exclusions(service);
  const subjectById = new Map(((subjects || []) as any[]).map((row) => [row.subject_id, row]));
  const excludedBoundJourneys = new Set(acceptedBindings.filter((binding) => {
    const subject = subjectById.get(binding.subject_id);
    return !subject?.registered_at || excluded(periods, binding.subject_id, binding.bound_at || subject.registered_at);
  }).map((row) => row.journey_id));
  const acceptedIds = ids.filter((id) => accepted.has(id) && !excludedBoundJourneys.has(id));
  const numerator = new Set(acceptedBindings
    .filter((row) => acceptedIds.includes(row.journey_id) && subjectById.get(row.subject_id)?.registered_at)
    .map((row) => row.journey_id)).size;
  const facts = ((allFacts || []) as any[]).filter((row) => accepted.has(row.journey_id));
  const eventTypes = ["TITLE_ARRIVED", "TAP_TO_START", "WORLD_INTRO_STARTED", "WORLD_INTRO_COMPLETED", "NAME_COMPLETED"];
  const steps = eventTypes.map((eventType) => {
    const count = new Set(facts.filter((row) => acceptedIds.includes(row.journey_id) && row.event_type === eventType).map((row) => row.journey_id)).size;
    return { event_type: eventType, journeys: count };
  });
  steps.push({ event_type: "GAME_START_BOUND", journeys: numerator });
  return {
    metric: metric("acquisition.game_start_rate", numerator, acceptedIds.length, 0.8),
    journeys: {
      started_at: ((journeys || []) as any[]).filter((row) => accepted.has(row.journey_id)).map((row) => row.started_at).sort()[0] || null,
      last_fact_at: facts.map((row) => row.occurred_at).sort().at(-1) || null,
      bound: numerator, unbound: acceptedIds.length - numerator,
    },
    steps,
  };
}

async function tutorialCompletions(service: SupabaseClient, subjects: TutorialSubject[], periods: Period[]) {
  const facts: { subject_id: string; completed_at: string }[] = [];
  const mypage: { subject_id: string; completed_at: string }[] = [];
  const milestones: { user_id: string; first_occurred_at: string }[] = [];
  // Bound IN lists and paginate each source; the REST row limit must not truncate UU.
  for (let offset = 0; offset < subjects.length; offset += 200) {
    const batch = subjects.slice(offset, offset + 200);
    const ids = batch.map((row) => row.subject_id);
    const userIds = batch.map((row) => row.source_user_id).filter((id): id is string => !!id);
    const [batchFacts, batchMyPage, batchMilestones] = await Promise.all([
      fetchAll<any>((from, to) => service.from("kpi_tutorial_completion_facts").select("subject_id,completed_at").in("subject_id", ids).order("subject_id").range(from, to)),
      fetchAll<any>((from, to) => service.from("kpi_canonical_tutorial_completions_v1").select("subject_id,completed_at").in("subject_id", ids).order("subject_id").range(from, to)),
      userIds.length ? fetchAll<any>((from, to) => service.from("user_funnel_milestones").select("user_id,first_occurred_at").eq("milestone", "tutorial_complete").in("user_id", userIds).order("user_id").range(from, to)) : Promise.resolve([]),
    ]);
    facts.push(...batchFacts); mypage.push(...batchMyPage); milestones.push(...batchMilestones);
  }
  return unionTutorialCompletions(subjects, facts, milestones, mypage, (id, at) => excluded(periods, id, at));
}

async function tutorialCompletionsInPeriod(service: SupabaseClient, range: NonNullable<ReturnType<typeof rangeFrom>>, periods: Period[]) {
  const subjects = await fetchAll<any>((from, to) => service.from("kpi_subjects").select("subject_id,source_user_id,registered_at")
    .lt("registered_at", range.toAt).order("subject_id").range(from, to));
  const completions = await tutorialCompletions(service, subjects, periods);
  // Choose first completion before filtering its date: later duplicate MyPage evidence cannot re-cohort a user.
  return completions.filter((row) => Date.parse(row.completed_at) >= Date.parse(range.fromAt) && Date.parse(row.completed_at) < Date.parse(range.toAt));
}

export async function tutorial(service: SupabaseClient, range: NonNullable<ReturnType<typeof rangeFrom>>) {
  const subjectData = await fetchAll<any>((from, to) => service.from("kpi_subjects").select("subject_id,source_user_id,registered_at")
    .gte("registered_at", range.fromAt).lt("registered_at", range.toAt).range(from, to));
  const periods = await exclusions(service);
  const subjects = subjectData.filter((row) => !excluded(periods, row.subject_id, row.registered_at));
  const ids = subjects.map((row) => row.subject_id);
  const completed = await tutorialCompletions(service, subjects, periods);
  const { data: factData } = ids.length
    ? await service.from("kpi_tutorial_journey_facts").select("subject_id,fact_type,occurred_at").in("subject_id", ids)
    : { data: [] as any[] };
  const canonicalMeasured = ((factData || []) as any[]).some((row) => row.fact_type === "FIRST_MYPAGE_ACCESS_CONFIRMED");
  const canonicalMetric = { ...metric("tutorial.completion_union_rate", completed.length, ids.length, 0.6), ...TUTORIAL_UNION_AUTHORITY };
  const factTypes = ["TUTORIAL_GACHA_COMPLETED", "TUTORIAL_BATTLE_COMPLETED", "AUTH_CHOICE_SELECTED", "AUTH_CHOICE_RESOLVED", "FIRST_MYPAGE_ACCESS_CONFIRMED"];
  return {
    metric: canonicalMetric,
    measurement_status: "MEASURED",
    strong_target: 0.7,
    steps: [
      { fact_type: "GAME_START", subjects: ids.length, observation_status: "complete" },
      ...factTypes.map((factType) => ({
        fact_type: factType,
        subjects: factType === "FIRST_MYPAGE_ACCESS_CONFIRMED" && !canonicalMeasured ? null : new Set(((factData || []) as any[]).filter((row) => row.fact_type === factType && !excluded(periods, row.subject_id, row.occurred_at)).map((row) => row.subject_id)).size,
        observation_status: factType === "FIRST_MYPAGE_ACCESS_CONFIRMED" ? (canonicalMeasured ? "complete" : "incomplete") : "partial",
        reason: factType === "FIRST_MYPAGE_ACCESS_CONFIRMED" && !canonicalMeasured ? "measurement_not_started" : null,
      })),
    ],
  };
}

export async function postTutorial(service: SupabaseClient, range: NonNullable<ReturnType<typeof rangeFrom>>) {
  const periods = await exclusions(service);
  const completions = await tutorialCompletionsInPeriod(service, range, periods);
  const subjectIds = completions.map((row) => row.subject_id);
  if (!subjectIds.length) return {
    cohort: 0,
    metrics: ["SKILL_NORMAL", "EQUIP_NORMAL", "CHARACTER", "BATTLE", "RAID"].map((key) => ({ key, uu: key === "CHARACTER" ? null : 0, observation_status: key === "CHARACTER" ? "unavailable" : "complete" })),
  };
  const { data: subjectData, error: subjectError } = await service.from("kpi_subjects").select("subject_id,source_user_id").in("subject_id", subjectIds);
  if (subjectError) throw subjectError;
  const subjectBySource = new Map(((subjectData || []) as any[]).filter((row) => row.source_user_id).map((row) => [row.source_user_id, row.subject_id]));
  const sourceIds = [...subjectBySource.keys()];
  const [{ data: gachaData, error: gachaError }, { data: milestoneData, error: milestoneError }] = await Promise.all([
    service.from("kpi_gacha_execution_facts").select("subject_id,gacha_id,completed_at").in("subject_id", subjectIds).in("gacha_id", ["SKILL_NORMAL", "EQUIP_NORMAL"]),
    sourceIds.length
      ? service.from("user_funnel_milestones").select("user_id,milestone,first_occurred_at").in("user_id", sourceIds).in("milestone", ["first_battle", "first_raid"])
      : Promise.resolve({ data: [] as any[], error: null }),
  ]);
  if (gachaError) throw gachaError;
  if (milestoneError) throw milestoneError;
  const completedAt = new Map(completions.map((row) => [row.subject_id, row.completed_at]));
  const afterCompletion = (subjectId: string, at: string) => !!completedAt.get(subjectId) && Date.parse(at) >= Date.parse(completedAt.get(subjectId) || "");
  const gachaCount = (gachaId: string) => new Set(((gachaData || []) as any[])
    .filter((row) => row.gacha_id === gachaId && afterCompletion(row.subject_id, row.completed_at)).map((row) => row.subject_id)).size;
  const milestoneCount = (milestone: string) => new Set(((milestoneData || []) as any[]).filter((row) => {
    const subjectId = subjectBySource.get(row.user_id);
    return subjectId && row.milestone === milestone && afterCompletion(subjectId, row.first_occurred_at);
  }).map((row) => subjectBySource.get(row.user_id))).size;
  return {
    cohort: completions.length,
    metrics: [
      { key: "SKILL_NORMAL", label: "スキルガチャ", uu: gachaCount("SKILL_NORMAL"), observation_status: "complete" },
      { key: "EQUIP_NORMAL", label: "装備ガチャ", uu: gachaCount("EQUIP_NORMAL"), observation_status: "complete" },
      { key: "CHARACTER", label: "Character", uu: null, observation_status: "unavailable", reason: "canonical_character_activation_authority_not_fixed" },
      { key: "BATTLE", label: "Battle", uu: milestoneCount("first_battle"), observation_status: "complete" },
      { key: "RAID", label: "Raid", uu: milestoneCount("first_raid"), observation_status: "complete" },
    ],
    authority: { SKILL_NORMAL: "kpi_gacha_execution_facts", EQUIP_NORMAL: "kpi_gacha_execution_facts", BATTLE: "user_funnel_milestones.first_battle", RAID: "user_funnel_milestones.first_raid" },
  };
}

export async function guild(service: SupabaseClient, range: NonNullable<ReturnType<typeof rangeFrom>>) {
  const periods = await exclusions(service);
  const completions = await tutorialCompletionsInPeriod(service, range, periods);
  const tutorialSubjects = new Set(completions.map((row) => row.subject_id));
  const ids = [...tutorialSubjects];
  const { data: conversionData } = ids.length
    ? await service.from("kpi_guild_conversion_facts").select("subject_id,conversion_type,membership_period_id,occurred_at").in("subject_id", ids)
    : { data: [] as any[] };
  const conversions = ((conversionData || []) as any[]).filter((row) => !excluded(periods, row.subject_id, row.occurred_at));
  const conversionSubjects = new Set(conversions.map((row) => row.subject_id));
  const periodsIds = [...new Set(conversions.map((row) => row.membership_period_id))];
  const { data: activationData } = periodsIds.length
    ? await service.from("kpi_guild_chat_activation_facts").select("subject_id,membership_period_id,occurred_at").in("membership_period_id", periodsIds)
    : { data: [] as any[] };
  const activationSubjects = new Set(((activationData || []) as any[])
    .filter((row) => !excluded(periods, row.subject_id, row.occurred_at)).map((row) => row.subject_id));
  return {
    conversion: metric("guild.conversion_rate", conversionSubjects.size, tutorialSubjects.size, 0.4),
    conversion_strong_target: 0.6,
    chat_activation: metric("guild.chat_activation_rate", activationSubjects.size, conversionSubjects.size, 0.3),
    create: new Set(conversions.filter((row) => row.conversion_type === "CREATE").map((row) => row.subject_id)).size,
    join: new Set(conversions.filter((row) => row.conversion_type === "JOIN").map((row) => row.subject_id)).size,
  };
}

export async function retention(service: SupabaseClient, range: NonNullable<ReturnType<typeof rangeFrom>>) {
  const subjectData = await fetchAll<any>((from, to) => service.from("kpi_subjects").select("subject_id,registered_at")
    .gte("registered_at", range.fromAt).lt("registered_at", range.toAt).range(from, to));
  const periods = await exclusions(service);
  const subjects = subjectData.filter((row) => !excluded(periods, row.subject_id, row.registered_at));
  const ids = subjects.map((row) => row.subject_id);
  const activityData = await fetchBatches<any>(ids, (batch, from, to) => service.from("kpi_daily_user_activity")
    .select("subject_id,activity_date,last_active_at").in("subject_id", batch)
    .gte("activity_date", range.from).lte("activity_date", addDays(range.to, 5))
    .order("subject_id").order("activity_date").range(from, to));
  const active = new Set(((activityData || []) as any[])
    .filter((row) => !excluded(periods, row.subject_id, row.last_active_at)).map((row) => `${row.subject_id}:${row.activity_date}`));
  const targets = [0, .38, .30, .26, .23, .21];
  const cohorts = [...new Set(subjects.map((row) => jstDate(row.registered_at)))].sort().map((cohortDate) => {
    const cohort = subjects.filter((row) => jstDate(row.registered_at) === cohortDate);
    return {
      cohort_date: cohortDate,
      game_start_uu: cohort.length,
      days: [1, 2, 3, 4, 5].map((day) => {
        const observationDate = addDays(cohortDate, day);
        const mature = observationDate < range.today;
        const numerator = mature ? cohort.filter((row) => active.has(`${row.subject_id}:${observationDate}`)).length : null;
        return { day, ...metric(`retention.d${day}`, numerator, mature ? cohort.length : null, targets[day], { observationStatus: mature ? "complete" : "incomplete" }) };
      }),
    };
  });
  const { count: transitionCount, error: transitionError } = await service.from("kpi_subject_identity_transition_facts")
    .select("id", { count: "exact", head: true }).eq("transition_type", "ACCOUNT_SWITCH_TO_EXISTING")
    .gte("occurred_at", range.fromAt).lt("occurred_at", range.toAt);
  if (transitionError) throw transitionError;
  return { cohorts, formal_open: calculateFormalRetention(cohorts), identity: "subject_id", account_switch_diagnostic_count: transitionCount || 0 };
}

export async function dailyOverview(service: SupabaseClient, range: NonNullable<ReturnType<typeof rangeFrom>>) {
  const [retentionResult, subjectData, periods] = await Promise.all([
    retention(service, range),
    fetchAll<any>((from, to) => service.from("kpi_subjects").select("subject_id,source_user_id,registered_at")
      .gte("registered_at", range.fromAt).lt("registered_at", range.toAt).range(from, to)),
    exclusions(service),
  ]);
  const subjects = subjectData.filter((row) => !excluded(periods, row.subject_id, row.registered_at));
  const subjectIds = subjects.map((row) => row.subject_id);
  const subjectLinks = subjects;
  const completions = await tutorialCompletions(service, subjectLinks || [], periods);
  const [membershipData, conversionData] = await Promise.all([
    fetchBatches<any>(subjectIds, (batch, from, to) => service.from("kpi_guild_membership_periods")
      .select("id,subject_id,guild_id,joined_at,left_at").in("subject_id", batch).order("id").range(from, to)),
    fetchBatches<any>(subjectIds, (batch, from, to) => service.from("kpi_guild_conversion_facts")
      .select("subject_id,conversion_type,membership_period_id,occurred_at").in("subject_id", batch).order("subject_id").order("membership_period_id").range(from, to)),
  ]);
  const memberships = (membershipData || []) as any[];
  const conversions = ((conversionData || []) as any[]).filter((row) => !excluded(periods, row.subject_id, row.occurred_at));
  const membershipPeriodIds = memberships.map((row) => row.id);
  const sourceUserIds = ((subjectLinks || []) as any[]).map((row) => row.source_user_id).filter(Boolean);
  const [activationData, rawPosts] = await Promise.all([
    fetchBatches<any>(membershipPeriodIds, (batch, from, to) => service.from("kpi_guild_chat_activation_facts")
      .select("subject_id,membership_period_id,occurred_at").in("membership_period_id", batch).order("membership_period_id").range(from, to)),
    fetchBatches<any>(sourceUserIds, (batch, from, to) => service.from("board_posts").select("id,user_id,target_id,created_at,is_system")
      .eq("target_type", "GUILD").eq("is_system", false).in("user_id", batch).order("id").range(from, to)),
  ]);
  const activations = ((activationData || []) as any[]).filter((row) => !excluded(periods, row.subject_id, row.occurred_at));
  const subjectBySource = new Map(((subjectLinks || []) as any[]).filter((row) => row.source_user_id).map((row) => [row.source_user_id, row.subject_id]));
  const retentionByDate = new Map(retentionResult.cohorts.map((cohort) => [cohort.cohort_date, cohort]));
  const dates: string[] = [];
  for (let date = range.to; date >= range.from; date = addDays(date, -1)) dates.push(date);
  return {
    definition_version: DEFINITION_VERSION,
    timezone: TIMEZONE,
    rows: dates.map((date) => {
      const cohort = retentionByDate.get(date);
      const cohortSubjects = subjects.filter((row) => jstDate(row.registered_at) === date);
      const cohortIds = new Set(cohortSubjects.map((row) => row.subject_id));
      const selectedCompletions = completions.filter((row) => cohortIds.has(row.subject_id));
      const completedSubjects = new Set(selectedCompletions.map((row) => row.subject_id));
      const tutorialMetric = { ...metric("tutorial.completion_union_rate", completedSubjects.size, cohortIds.size, .6), ...TUTORIAL_UNION_AUTHORITY };
      const completionAt = new Map(selectedCompletions.map((row) => [row.subject_id, row.completed_at]));
      const dateMemberships = memberships.filter((row) => completedSubjects.has(row.subject_id)
        && Date.parse(row.joined_at) >= Date.parse(completionAt.get(row.subject_id) || ""));
      const conversionSubjects = new Set(dateMemberships.map((row) => row.subject_id));
      const conversionPeriods = new Set(dateMemberships.map((row) => row.id));
      const typedConversions = conversions.filter((row) => conversionPeriods.has(row.membership_period_id));
      const rawActivatedSubjects = new Set(rawPosts.filter((post) => {
        const subjectId = subjectBySource.get(post.user_id);
        if (!subjectId || !conversionSubjects.has(subjectId)) return false;
        return dateMemberships.some((membership) => membership.subject_id === subjectId
          && membership.guild_id === post.target_id
          && Date.parse(post.created_at) >= Date.parse(membership.joined_at)
          && (!membership.left_at || Date.parse(post.created_at) < Date.parse(membership.left_at)));
      }).map((post) => subjectBySource.get(post.user_id)));
      const activationSubjects = new Set([
        ...activations.filter((row) => conversionPeriods.has(row.membership_period_id)).map((row) => row.subject_id),
        ...rawActivatedSubjects,
      ]);
      const guildAuthority = typedConversions.length === dateMemberships.length && dateMemberships.length > 0 ? "canonical" : "membership_periods";
      const chatAuthority = activations.some((row) => conversionPeriods.has(row.membership_period_id)) ? "canonical_and_legacy" : "legacy_surviving_posts";
      return {
        date,
        new_users: cohortSubjects.length,
        tutorial: tutorialMetric,
        guild: { ...metric("guild.conversion_rate", conversionSubjects.size, completedSubjects.size, .4), authority: guildAuthority,
          create: guildAuthority === "canonical" ? new Set(typedConversions.filter((row) => row.conversion_type === "CREATE").map((row) => row.subject_id)).size : null,
          join: guildAuthority === "canonical" ? new Set(typedConversions.filter((row) => row.conversion_type === "JOIN").map((row) => row.subject_id)).size : null },
        chat: { ...metric("guild.chat_activation_rate", activationSubjects.size, conversionSubjects.size, .3), authority: chatAuthority },
        retention: cohort?.days || [1, 2, 3, 4, 5].map((day) => ({ day, ...metric(`retention.d${day}`, null, null, [0, .38, .30, .26, .23, .21][day], { observationStatus: "incomplete", reason: "no_cohort" }) })),
      };
    }),
  };
}

export async function community(service: SupabaseClient, range: NonNullable<ReturnType<typeof rangeFrom>>) {
  const [{ data: effective, error }, { data: chat }] = await Promise.all([
    service.from("kpi_effective_active_guild_daily_v1").select("activity_date,guild_id,game_active_members,guild_chat_active_members,is_active_guild,is_effective_active_guild")
      .gte("activity_date", range.from).lte("activity_date", range.to).order("activity_date"),
    service.from("kpi_guild_daily_chat_activity_v1").select("activity_date_jst,guild_id,chat_active_uu,message_count")
      .gte("activity_date_jst", range.from).lte("activity_date_jst", range.to).order("activity_date_jst"),
  ]);
  if (error) throw error;
  const rows = (effective || []) as any[];
  const dates = [...new Set(rows.map((row) => row.activity_date))];
  const series = dates.map((date) => ({
    date,
    active_guild_count: rows.filter((row) => row.activity_date === date && row.is_active_guild).length,
    effective_active_guild_count: rows.filter((row) => row.activity_date === date && row.is_effective_active_guild).length,
    guild_active_uu: rows.filter((row) => row.activity_date === date).reduce((sum, row) => sum + Number(row.game_active_members || 0), 0),
    guild_chat_active_uu: (chat || []).filter((row: any) => row.activity_date_jst === date).reduce((sum: number, row: any) => sum + Number(row.chat_active_uu || 0), 0),
    guild_chat_message_count: (chat || []).filter((row: any) => row.activity_date_jst === date).reduce((sum: number, row: any) => sum + Number(row.message_count || 0), 0),
  }));
  const effectiveActiveGuild = calculateCommunityContinuity(series, range.today, range.to);
  return { target: 18, continuity_status: effectiveActiveGuild.status, reason: effectiveActiveGuild.reason, effective_active_guild: effectiveActiveGuild, series };
}

export async function marketing(service: SupabaseClient, range: NonNullable<ReturnType<typeof rangeFrom>>, grain: string | null) {
  let query = service.from("kpi_marketing_latest_revisions_v1").select("*")
    .gte("report_date_jst", range.from).lte("report_date_jst", range.to).order("report_date_jst");
  if (grain) query = query.eq("reporting_grain", grain);
  const { data, error } = await query.limit(100000);
  if (error) throw error;
  const rows = (data || []) as any[];
  const grains = [...new Set(rows.map((row) => row.reporting_grain))];
  if (!grain && grains.length > 1) return { status: "UNAVAILABLE", reason: "INVALID_GRAIN_MIX", grains, rows: [] };
  return { status: rows.length ? "PASS" : "NOT_READY", reason: rows.length ? null : "no_data", grain: grain || grains[0] || null, rows };
}

export async function validation(service: SupabaseClient, range: NonNullable<ReturnType<typeof rangeFrom>>, grain: string | null) {
  const [acquisitionResult, tutorialResult, guildResult, marketingResult, retentionResult, communityResult] = await Promise.all([
    acquisition(service, range), tutorial(service, range), guild(service, range), marketing(service, range, grain), retention(service, range), community(service, range),
  ]);
  let marketingDays: unknown[] = [];
  if (marketingResult.status !== "UNAVAILABLE") {
    const grouped = new Map<string, { spend: number; impressions: number; clicks: number }>();
    for (const row of marketingResult.rows as any[]) {
      if (row.currency !== "JPY") continue;
      const current = grouped.get(row.report_date_jst) || { spend: 0, impressions: 0, clicks: 0 };
      current.spend += Number(row.spend || 0);
      current.impressions += Number(row.impressions || 0);
      current.clicks += Number(row.clicks || 0);
      grouped.set(row.report_date_jst, current);
    }
    marketingDays = [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, totals]) => {
      const cpc = totals.clicks === 0 ? null : totals.spend / totals.clicks;
      const ctr = totals.impressions === 0 ? null : totals.clicks / totals.impressions;
      const cpm = totals.impressions === 0 ? null : totals.spend * 1000 / totals.impressions;
      return {
        date,
        cpc: metric("marketing.cpc", totals.spend, totals.clicks, 28.5, { pass: cpc != null && cpc <= 28.5, reason: cpc == null ? "zero_denominator" : null }),
        clicks: scalarMetric("marketing.clicks", totals.clicks, 350),
        ctr: scalarMetric("marketing.ctr", ctr, 0.007, { reason: ctr == null ? "zero_denominator" : null }),
        cpm: scalarMetric("marketing.cpm", cpm, null, { status: cpm == null ? "NOT_READY" : "UNAVAILABLE", reason: cpm == null ? "zero_denominator" : "no_gate_threshold" }),
        gate_status: cpc != null && cpc <= 28.5 && totals.clicks >= 350 ? "PASS" : "FAIL",
      };
    });
  }
  const latestMarketing = (marketingDays as any[]).at(-1);
  const formalRetention = retentionResult.formal_open;
  const components: Record<string, string> = {
    marketing: latestMarketing?.gate_status || "NOT_READY",
    acquisition: acquisitionResult.metric.status,
    tutorial: tutorialResult.metric.status,
    guild_chat_activation: guildResult.chat_activation.status,
    ...Object.fromEntries(formalRetention.map((item) => [`retention_d${item.metric_key.at(-1)}`, item.status])),
    community_continuity: communityResult.effective_active_guild.status,
  };
  const overall = calculateFormalOpenStatus(components);
  const evaluatedAt = new Date().toISOString();
  return {
    definition_version: DEFINITION_VERSION, timezone: TIMEZONE, as_of: new Date().toISOString(),
    acquisition: acquisitionResult.metric,
    tutorial: tutorialResult.metric,
    guild_conversion: guildResult.conversion,
    guild_chat_activation: guildResult.chat_activation,
    marketing: marketingResult.status === "UNAVAILABLE"
      ? { status: "UNAVAILABLE", reason: marketingResult.reason, days: [] }
      : { status: marketingDays.length ? "AVAILABLE" : "NOT_READY", reason: marketingDays.length ? null : "no_jpy_data", days: marketingDays },
    formal_open: {
      ...overall,
      evaluated_at: evaluatedAt,
      timezone: TIMEZONE,
      components,
      retention: Object.fromEntries(formalRetention.map((item) => [`d${item.metric_key.at(-1)}`, item])),
      effective_active_guild: communityResult.effective_active_guild,
    },
    formal_open_status: overall.status,
    formal_open_reason: overall.reasons[0] || null,
  };
}

export async function respond(request: NextRequest, loader: (service: SupabaseClient, range: NonNullable<ReturnType<typeof rangeFrom>>) => Promise<unknown>) {
  const service = serviceClient();
  const range = rangeFrom(request);
  if (!service) return noStore({ error: "KPI server configuration unavailable" }, 503);
  if (!range) return noStore({ error: "Invalid JST date range" }, 400);
  try { return noStore(await loader(service, range)); }
  catch (error) { console.error("KPI V2 read failed", error); return noStore({ error: "KPI authority unavailable" }, 500); }
}
