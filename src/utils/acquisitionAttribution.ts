import { supabase, usingMockSupabase } from "./supabase";
import {
  captureAcquisitionLandingMetadata,
  type AcquisitionLandingMetadata,
} from "./acquisitionAttributionMetadata";

const TOKEN_KEY = "tribe_acquisition_journey_token_v1";
const METADATA_KEY = "tribe_acquisition_landing_metadata_v1";
const GAME_START_KEY = "tribe_acquisition_game_start_v1";
const SOURCE = "web_v1";

export type AcquisitionObservation =
  | "TITLE_ARRIVED"
  | "TAP_TO_START"
  | "WORLD_INTRO_STARTED"
  | "WORLD_INTRO_COMPLETED"
  | "NAME_COMPLETED";

let initialization: Promise<string | null> | null = null;
let memoryToken: string | null = null;
let memoryMetadata: AcquisitionLandingMetadata | null = null;
let gameStartObserved = false;

function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}

function getOrCreateToken(): string {
  try {
    const stored = window.sessionStorage.getItem(TOKEN_KEY);
    if (stored && /^[a-f0-9]{64}$/.test(stored)) return stored;
  } catch {
    // Some privacy modes deny browser storage; keep the token for this page lifetime.
  }
  if (memoryToken) return memoryToken;
  const token = generateToken();
  memoryToken = token;
  try {
    window.sessionStorage.setItem(TOKEN_KEY, token);
  } catch {
    // The in-memory token still keeps retries idempotent for this page lifetime.
  }
  return token;
}

function getOrCaptureMetadata(): AcquisitionLandingMetadata {
  try {
    const stored = window.sessionStorage.getItem(METADATA_KEY);
    if (stored) {
      return JSON.parse(stored) as AcquisitionLandingMetadata;
    }
  } catch {
    // Capture a fresh bounded envelope when storage is unavailable or invalid.
  }
  if (memoryMetadata) return memoryMetadata;
  const metadata = captureAcquisitionLandingMetadata(window.location.href, document.referrer);
  memoryMetadata = metadata;
  try {
    window.sessionStorage.setItem(METADATA_KEY, JSON.stringify(metadata));
  } catch {
    // The in-memory envelope still preserves first touch for this page lifetime.
  }
  return metadata;
}

function markGameStartObserved(): void {
  gameStartObserved = true;
  try {
    window.sessionStorage.setItem(GAME_START_KEY, "true");
  } catch {
    // The in-memory marker is sufficient until this page is closed.
  }
}

function hasGameStartObservation(): boolean {
  if (gameStartObserved) return true;
  try {
    return window.sessionStorage.getItem(GAME_START_KEY) === "true";
  } catch {
    return false;
  }
}

async function initialize(): Promise<string | null> {
  if (typeof window === "undefined" || usingMockSupabase) return null;
  const token = getOrCreateToken();
  const metadata = getOrCaptureMetadata();
  const { error: landingError } = await supabase.rpc("record_kpi_acquisition_landing_v1", {
    p_token: token,
    p_metadata: metadata,
    p_source: SOURCE,
  });
  if (landingError) throw landingError;
  return token;
}

export async function initializeAcquisitionAttribution(): Promise<boolean> {
  if (!initialization) {
    initialization = initialize().catch((error) => {
      initialization = null;
      console.warn("Acquisition landing capture failed:", error);
      return null;
    });
  }
  const token = await initialization;
  if (token) void flushWorldIntroObservations(token);
  return Boolean(token);
}

type WorldIntroEvent = "WORLD_INTRO_VIEWED" | "WORLD_INTRO_SKIPPED";
const worldIntroEvents: WorldIntroEvent[] = ["WORLD_INTRO_VIEWED", "WORLD_INTRO_SKIPPED"];
const introObservations = new Map<string, Partial<Record<WorldIntroEvent, "pending" | "sent">>>();
const introWrites = new Map<string, Promise<void>>();

function getIntroObservations(token: string) {
  let observations = introObservations.get(token);
  if (!observations) {
    observations = {};
    try {
      const stored = JSON.parse(window.sessionStorage.getItem(`tribe_world_intro_events_v1:${token}`) || "{}");
      for (const event of worldIntroEvents) {
        if (stored[event] === "pending" || stored[event] === "sent") observations[event] = stored[event];
      }
    } catch { /* 保存不可でも、このページ内の再送を維持する。 */ }
    introObservations.set(token, observations);
  }
  return observations;
}

function saveIntroObservations(token: string) {
  try {
    window.sessionStorage.setItem(`tribe_world_intro_events_v1:${token}`, JSON.stringify(getIntroObservations(token)));
  } catch { /* 計測の保存失敗で画面遷移を止めない。 */ }
}

function flushWorldIntroObservations(token: string): Promise<void> {
  const active = introWrites.get(token);
  if (active) return active;
  const write = (async () => {
    const observations = getIntroObservations(token);
    for (const event of worldIntroEvents) {
      if (observations[event] !== "pending") continue;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          const { error } = await supabase.rpc("record_kpi_acquisition_observation_v1", {
            p_token: token,
            p_event_type: event,
            p_idempotency_key: `${event.toLowerCase()}:v1`,
            p_metadata: {},
            p_source: SOURCE,
          });
          if (error) throw error;
          observations[event] = "sent";
          saveIntroObservations(token);
          break;
        } catch {
          if (attempt === 2) {
            console.warn("World introduction observation pending retry");
            return;
          }
          await new Promise(resolve => window.setTimeout(resolve, 1000 * (attempt + 1)));
        }
      }
    }
  })().finally(() => introWrites.delete(token));
  introWrites.set(token, write);
  return write;
}

export function recordWorldIntroObservation(event: WorldIntroEvent): void {
  if (typeof window === "undefined" || usingMockSupabase) return;
  const token = getOrCreateToken();
  const observations = getIntroObservations(token);
  if (!observations[event]) observations[event] = "pending";
  saveIntroObservations(token);
  // 既存Landing初期化を再利用。未送信分はreload後の初期化でも再送する。
  void initializeAcquisitionAttribution();
}

export async function recordAcquisitionGameStart(): Promise<boolean> {
  if (typeof window === "undefined" || usingMockSupabase) return false;
  markGameStartObserved();
  if (!await initializeAcquisitionAttribution()) return false;
  const token = getOrCreateToken();
  const { error } = await supabase.rpc("record_kpi_acquisition_observation_v1", {
    p_token: token,
    p_event_type: "TAP_TO_START",
    p_idempotency_key: "tap_to_start:v1",
    p_metadata: {},
    p_source: SOURCE,
  });
  if (error) {
    console.warn("Acquisition Game Start capture failed:", error);
    return false;
  }
  return true;
}

export async function recordAcquisitionObservation(
  eventType: AcquisitionObservation,
): Promise<boolean> {
  if (eventType === "TITLE_ARRIVED") return initializeAcquisitionAttribution();
  if (eventType === "TAP_TO_START") return recordAcquisitionGameStart();
  if (typeof window === "undefined" || usingMockSupabase) return false;
  if (!await initializeAcquisitionAttribution()) return false;
  const token = getOrCreateToken();
  const { error } = await supabase.rpc("record_kpi_acquisition_observation_v1", {
    p_token: token,
    p_event_type: eventType,
    p_idempotency_key: `${eventType.toLowerCase()}:v1`,
    p_metadata: {},
    p_source: SOURCE,
  });
  if (error) {
    console.warn(`Acquisition ${eventType} capture failed:`, error);
    return false;
  }
  return true;
}

export async function bindAcquisitionSubject(): Promise<boolean> {
  if (typeof window === "undefined" || usingMockSupabase) return false;
  if (!hasGameStartObservation()) return false;
  if (!await initializeAcquisitionAttribution()) return false;
  const token = getOrCreateToken();
  const { error } = await supabase.rpc("bind_kpi_acquisition_subject_v1", {
    p_token: token,
    p_source: SOURCE,
  });
  if (error) {
    console.warn("Acquisition subject binding failed:", error);
    return false;
  }
  return true;
}
