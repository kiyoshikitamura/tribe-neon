export type BattlePresentationTier = "NORMAL" | "STANDARD" | "SR" | "SSR";
export type BattlePresentationBeat = "ACTOR" | "IMPACT" | "RETURN";

export type BattlePresentationReplayEvent = {
  index: number;
  round: number;
  type: string;
  payload: Record<string, unknown>;
};

export type BattleTargetResolutionGroup = {
  targetId: string;
  events: BattlePresentationReplayEvent[];
};

export type BattlePresentationUnit = {
  actorId: string;
  skillId: string;
  round: number;
  replayStartCursor: number;
  nextReplayCursor: number;
  targets: BattleTargetResolutionGroup[];
};

export type BattleActionPresentation = {
  unit: BattlePresentationUnit;
  beat: BattlePresentationBeat;
  tier: BattlePresentationTier;
  skillName: string;
};

const TARGET_RESULT_TYPES = new Set(["DAMAGE", "HEAL", "STATUS", "EFFECT", "DEFEAT"]);

/**
 * Presentation-only projection of one immutable authoritative ACTION.
 * It preserves replay order and only groups already-resolved target results.
 * Targets, values, statuses, active effects and RNG are never derived here.
 */
export function buildBattlePresentationUnit(
  replay: readonly BattlePresentationReplayEvent[],
  actionCursor: number,
): BattlePresentationUnit | null {
  const action = replay[actionCursor];
  if (!action || action.type !== "ACTION") return null;

  const targetGroups = new Map<string, BattleTargetResolutionGroup>();
  let cursor = actionCursor + 1;
  while (cursor < replay.length) {
    const event = replay[cursor];
    if (event.type === "ACTION" || event.type === "RESULT") break;
    if (TARGET_RESULT_TYPES.has(event.type)) {
      const targetId = String(event.payload.targetId ?? "");
      if (targetId) {
        const group = targetGroups.get(targetId) ?? { targetId, events: [] };
        group.events.push(event);
        targetGroups.set(targetId, group);
      }
    }
    cursor += 1;
  }

  return {
    actorId: String(action.payload.actorId ?? ""),
    skillId: String(action.payload.skillId ?? "BASIC_ATTACK"),
    round: action.round,
    replayStartCursor: actionCursor,
    nextReplayCursor: cursor,
    targets: [...targetGroups.values()],
  };
}

export function battlePresentationTier(isSkill: boolean, actorRarity: unknown): BattlePresentationTier {
  if (!isSkill) return "NORMAL";
  const rarity = String(actorRarity ?? "").toUpperCase();
  return rarity === "SSR" ? "SSR" : rarity === "SR" ? "SR" : "STANDARD";
}

export function battlePresentationBudget(tier: BattlePresentationTier, speed: number, street = false): number {
  if (street) return battlePresentationImpactAt(speed, tier, true) + Math.max(900, 1150 / Math.max(1, speed));
  // 2x now tracks the former 1x recognition budget. 1x deliberately has
  // roughly twice that room so a human can read the whole fixed field.
  if (speed > 1) return tier === "NORMAL" ? 720 : tier === "STANDARD" ? 950 : 1200;
  return tier === "NORMAL" ? 1440 : tier === "STANDARD" ? 1900 : 2400;
}

export function battlePresentationImpactAt(speed: number, tier: BattlePresentationTier = "NORMAL", street = false): number {
  if (street) return tier === "NORMAL" ? Math.max(160, 320 / Math.max(1, speed)) : Math.max(tier === "SSR" ? 1200 : 800, (tier === "SSR" ? 1500 : tier === "SR" ? 1000 : 850) / Math.max(1, speed));
  // Preserve a readable Actor/Cut-in beat before Impact. The former shared
  // 120ms boundary made skills resolve almost immediately, leaving only a
  // long post-impact hold and breaking the accepted battle rhythm.
  if (speed > 1) return tier === "NORMAL" ? 260 : tier === "STANDARD" ? 400 : 520;
  return tier === "NORMAL" ? 520 : tier === "STANDARD" ? 820 : tier === "SR" ? 1040 : 1160;
}

export function isActiveEffectSync(event: BattlePresentationReplayEvent): boolean {
  return event.type === "EFFECT" && event.payload.kind === "ACTIVE_EFFECT_SYNC";
}

export type BattleHpParityParticipant = {
  id: string;
  hp: number;
  maxHp: number;
  isDead?: boolean;
};

export type BattleHpParityUnit = {
  targetId: string;
  canonicalHp: number;
  renderedHp: number | null;
  canonicalPercent: number;
  renderedPercent: number | null;
  renderedTrackPx: number | null;
  renderedFillPx: number | null;
  canonicalDead: boolean;
  renderedDead: boolean | null;
  stateParity: boolean;
  visualParity: boolean;
};

export type BattleHpParityTrace = {
  kind: "RESULT_HP_PARITY";
  parity: boolean;
  timedOut: boolean;
  forcedSettle: boolean;
  sampledAt: number;
  units: BattleHpParityUnit[];
};

export type BattleHpProjectionTrace = {
  kind: "ACTION_HP_PROJECTION";
  actorId: string;
  targetId: string;
  side: "player" | "enemy";
  eventType: "DAMAGE" | "HEAL" | "DEFEAT";
  eventIndex: number;
  round: number;
  source: string | null;
  canonicalHpBefore: number | null;
  canonicalDamage: number;
  canonicalHeal: number;
  replayRemainingHp: number;
  presentationProjectedHp: number;
  stateBefore: number | null;
  isDead: boolean;
  projectedAt: number;
  renderedHp?: number;
  renderedPercent?: number;
  renderedTrackPx?: number | null;
  renderedFillPx?: number | null;
  renderedIsDead?: boolean;
  renderedAt?: number;
  settledFillPx?: number | null;
  settledFillPercent?: number | null;
  settledAt?: number;
  parity?: boolean;
  actionEndAt?: number;
  actionEndParity?: boolean;
};

export type BattleActionHpParityTrace = {
  kind: "ACTION_HP_PARITY";
  round: number;
  actorId: string;
  replayStartCursor: number;
  parity: boolean;
  sampledAt: number;
  units: BattleHpParityUnit[];
};

export type BattleHpParityBoundary = "ACTION" | "RESULT" | "SKIP";

export type BattleHpParityLivenessTrace = {
  kind: "HP_PARITY_LIVENESS_TIMEOUT";
  boundary: BattleHpParityBoundary;
  replayId: string | null;
  round: number | null;
  actorId: string | null;
  replayCursor: number | null;
  attempts: number;
  sampledAt: number;
  units: BattleHpParityUnit[];
};

export type BattleHpParityGateResult = {
  status: "parity" | "timed_out" | "cancelled";
  attempts: number;
};

/**
 * DOM/CSS一致は表示診断であり、バトル結果のAuthorityではない。
 * 欠落行や古い描画が確定済みReplayを永久停止させないよう再試行を有限にする。
 */
export const BATTLE_HP_PARITY_MAX_ATTEMPTS = 2;
export const BATTLE_HP_PARITY_RETRY_DELAY_MS = 120;

export async function waitForBattleHpParityGate(
  sample: () => Promise<BattleActionHpParityTrace | BattleHpParityTrace | null>,
  context: {
    boundary: BattleHpParityBoundary;
    replayId?: string | null;
    round?: number | null;
    actorId?: string | null;
    replayCursor?: number | null;
  },
  options: {
    maxAttempts?: number;
    retryDelayMs?: number;
    isActive?: () => boolean;
  } = {},
): Promise<BattleHpParityGateResult> {
  const maxAttempts = Math.max(1, Math.floor(options.maxAttempts ?? BATTLE_HP_PARITY_MAX_ATTEMPTS));
  const retryDelayMs = Math.max(0, options.retryDelayMs ?? BATTLE_HP_PARITY_RETRY_DELAY_MS);
  let lastTrace: BattleActionHpParityTrace | BattleHpParityTrace | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    if (options.isActive && !options.isActive()) return { status: "cancelled", attempts: attempt - 1 };
    lastTrace = await sample();
    if (options.isActive && !options.isActive()) return { status: "cancelled", attempts: attempt };
    if (!lastTrace || lastTrace.parity) return { status: "parity", attempts: attempt };
    if (attempt < maxAttempts) {
      await new Promise<void>((resolve) => setTimeout(resolve, retryDelayMs));
    }
  }

  if (typeof window !== "undefined") {
    const timeoutTrace: BattleHpParityLivenessTrace = {
      kind: "HP_PARITY_LIVENESS_TIMEOUT",
      boundary: context.boundary,
      replayId: context.replayId ?? null,
      round: context.round ?? null,
      actorId: context.actorId ?? null,
      replayCursor: context.replayCursor ?? null,
      attempts: maxAttempts,
      sampledAt: performance.now(),
      units: lastTrace?.units ?? [],
    };
    const battleWindow = window as typeof window & { __TRIBE_BATTLE_HP_TRACE__?: unknown[] };
    (battleWindow.__TRIBE_BATTLE_HP_TRACE__ ||= []).push(timeoutTrace);
    document.documentElement.dataset.battleHpLivenessTimeout = context.boundary.toLowerCase();
    document.documentElement.dataset.battleHpLivenessAttempts = String(maxAttempts);
  }
  return { status: "timed_out", attempts: maxAttempts };
}

/** Records replay-derived HP projection only; it never derives battle results. */
export function recordBattleHpProjection(trace: Omit<BattleHpProjectionTrace, "kind" | "projectedAt">): void {
  if (typeof window === "undefined") return;
  const battleWindow = window as typeof window & { __TRIBE_BATTLE_HP_TRACE__?: unknown[] };
  (battleWindow.__TRIBE_BATTLE_HP_TRACE__ ||= []).push({
    kind: "ACTION_HP_PROJECTION",
    projectedAt: performance.now(),
    ...trace,
  } satisfies BattleHpProjectionTrace);
}

/** Reads final HP values explicitly recorded by canonical replay events. */
export function reconcileBattleHpFromReplay<T extends BattleHpParityParticipant>(
  participants: readonly T[],
  replay: readonly BattlePresentationReplayEvent[],
  resultCursor = replay.length,
): T[] {
  const canonicalHp = new Map<string, number>();
  for (let cursor = 0; cursor < Math.min(resultCursor, replay.length); cursor += 1) {
    const event = replay[cursor];
    const targetId = String(event.payload.targetId ?? "");
    if (!targetId) continue;
    if (event.type === "DEFEAT") canonicalHp.set(targetId, 0);
    else if ((event.type === "DAMAGE" || event.type === "HEAL") && Number.isFinite(Number(event.payload.remainingHp ?? event.payload.hpAfter))) {
      canonicalHp.set(targetId, Math.max(0, Number(event.payload.remainingHp ?? event.payload.hpAfter)));
    }
  }
  return participants.map((participant) => {
    const hp = canonicalHp.get(participant.id);
    return hp == null ? participant : { ...participant, hp, isDead: hp <= 0 };
  });
}

function captureRenderedBattleHp(participants: readonly BattleHpParityParticipant[]): BattleHpParityUnit[] {
  return participants.map((participant) => {
    const unit = document.getElementById(participant.id);
    const track = unit?.querySelector<HTMLElement>(".battle-unit-hp");
    const fill = unit?.querySelector<HTMLElement>("[data-hp-fill]");
    const canonicalHp = Math.max(0, Number(participant.hp) || 0);
    const maxHp = Math.max(1, Number(participant.maxHp) || 1);
    const canonicalPercent = Math.min(100, (canonicalHp / maxHp) * 100);
    const renderedValue = unit?.dataset.hp;
    const renderedHp = renderedValue == null ? null : Number(renderedValue);
    const trackWidth = track?.getBoundingClientRect().width ?? 0;
    const fillWidth = fill?.getBoundingClientRect().width ?? 0;
    const renderedPercent = trackWidth > 0 ? Math.min(100, (fillWidth / trackWidth) * 100) : null;
    return {
      targetId: participant.id,
      canonicalHp,
      renderedHp: Number.isFinite(renderedHp) ? renderedHp : null,
      canonicalPercent: Number(canonicalPercent.toFixed(2)),
      renderedPercent: renderedPercent == null ? null : Number(renderedPercent.toFixed(2)),
      renderedTrackPx: trackWidth > 0 ? Number(trackWidth.toFixed(2)) : null,
      renderedFillPx: fill ? Number(fillWidth.toFixed(2)) : null,
      canonicalDead: participant.isDead === true || canonicalHp <= 0,
      renderedDead: unit ? unit.dataset.isDead === "true" : null,
      stateParity: renderedHp === canonicalHp && (unit?.dataset.isDead === "true") === (participant.isDead === true || canonicalHp <= 0),
      visualParity: renderedPercent != null && Math.abs(renderedPercent - canonicalPercent) <= 1,
    };
  });
}

async function waitForStableRenderedBattleHp(
  participants: readonly BattleHpParityParticipant[],
  timeoutMs: number,
): Promise<BattleHpParityUnit[]> {
  const startedAt = performance.now();
  let units = captureRenderedBattleHp(participants);
  let stableFrames = 0;
  while (performance.now() - startedAt < timeoutMs) {
    const parity = units.every((unit) => unit.stateParity && unit.visualParity);
    stableFrames = parity ? stableFrames + 1 : 0;
    if (stableFrames >= 2) break;
    await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
    units = captureRenderedBattleHp(participants);
  }
  return units;
}

/**
 * Action boundary gate. It only waits for replay-projected state and CSS width
 * to agree; it never mutates HP or forces a visual settle.
 */
export async function waitForRenderedBattleActionHpParity(
  participants: readonly BattleHpParityParticipant[],
  action: { round: number; actorId: string; replayStartCursor: number },
  timeoutMs = 900,
): Promise<BattleActionHpParityTrace | null> {
  if (typeof window === "undefined" || typeof document === "undefined" || participants.length === 0) return null;
  const units = await waitForStableRenderedBattleHp(participants, timeoutMs);
  const parity = units.every((unit) => unit.stateParity && unit.visualParity);
  const sampledAt = performance.now();
  const trace: BattleActionHpParityTrace = { kind: "ACTION_HP_PARITY", ...action, parity, sampledAt, units };
  const battleWindow = window as typeof window & { __TRIBE_BATTLE_HP_TRACE__?: unknown[] };
  const traces = battleWindow.__TRIBE_BATTLE_HP_TRACE__ ||= [];
  traces.push(trace);
  for (const entry of traces) {
    const projection = entry as Partial<BattleHpProjectionTrace>;
    if (projection.kind !== "ACTION_HP_PROJECTION" || projection.actionEndAt != null) continue;
    if (!units.some((unit) => unit.targetId === projection.targetId)) continue;
    projection.actionEndAt = sampledAt;
    projection.actionEndParity = parity;
  }
  document.documentElement.dataset.battleHpActionParity = parity ? "pass" : "fail";
  document.documentElement.dataset.battleHpActionRound = String(action.round);
  document.documentElement.dataset.battleHpActionCursor = String(action.replayStartCursor);
  return trace;
}

/** Waits only for React/CSS to visually settle to canonical replay HP. */
export async function waitForRenderedBattleHpParity(
  participants: readonly BattleHpParityParticipant[],
  timeoutMs = 620,
): Promise<BattleHpParityTrace | null> {
  if (typeof window === "undefined" || typeof document === "undefined") return null;
  const units = await waitForStableRenderedBattleHp(participants, timeoutMs);
  const parity = units.every((unit) => unit.stateParity && unit.visualParity);
  const trace: BattleHpParityTrace = {
    kind: "RESULT_HP_PARITY",
    parity,
    timedOut: !parity,
    forcedSettle: false,
    sampledAt: performance.now(),
    units,
  };
  const battleWindow = window as typeof window & { __TRIBE_BATTLE_HP_TRACE__?: unknown[] };
  (battleWindow.__TRIBE_BATTLE_HP_TRACE__ ||= []).push(trace);
  document.documentElement.dataset.battleHpParity = parity ? "pass" : "fail";
  document.documentElement.dataset.battleHpParityTimedOut = trace.timedOut ? "true" : "false";
  document.documentElement.dataset.battleHpCanonicalZero = String(units.filter((unit) => unit.canonicalHp === 0).length);
  document.documentElement.dataset.battleHpParityZero = String(
    units.filter((unit) => unit.canonicalHp === 0 && unit.stateParity && unit.visualParity).length,
  );
  return trace;
}
