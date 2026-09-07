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
  return Boolean(await initialization);
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
