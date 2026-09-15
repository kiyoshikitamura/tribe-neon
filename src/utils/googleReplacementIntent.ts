export const GOOGLE_REPLACEMENT_INTENT_KEY = "tribe_google_replacement_intent";
const SESSION_KEY = "tribe_google_replacement_guest_session";
export type GoogleReplacementIntent = {
  method: "GOOGLE_REPLACE";
  userId: string;
  startedAt: number;
  intentId?: string;
  currentUsername?: string;
  existingUsername?: string;
  deletionStarted?: boolean;
  phase: "VERIFY" | "CONFIRM" | "LINK";
};
export type ReplacementSession = { access_token: string; refresh_token: string; user: { id: string } };
export function readGoogleReplacementIntent(): GoogleReplacementIntent | null {
  try {
    const value = JSON.parse(window.localStorage.getItem(GOOGLE_REPLACEMENT_INTENT_KEY) || "null");
    if (value?.method !== "GOOGLE_REPLACE" || typeof value.userId !== "string"
      || !["VERIFY", "CONFIRM", "LINK"].includes(value.phase)
      || !Number.isFinite(value.startedAt) || Date.now() < value.startedAt) return null;
    // Once deletion may have begun, keep the durable server intent resumable.
    // Server-side proof and intent status remain authoritative.
    if (Date.now() - value.startedAt > 30 * 60 * 1000
      && value.phase !== "LINK" && !(value.phase === "CONFIRM" && value.deletionStarted && value.intentId)) return null;
    return value;
  } catch { return null; }
}
export function saveGoogleReplacementIntent(intent: GoogleReplacementIntent) {
  window.localStorage.setItem(GOOGLE_REPLACEMENT_INTENT_KEY, JSON.stringify(intent));
}
export function saveReplacementGuestSession(session: ReplacementSession) {
  window.sessionStorage.setItem(SESSION_KEY, JSON.stringify({ access_token: session.access_token, refresh_token: session.refresh_token, user: { id: session.user.id } }));
}
export function readReplacementGuestSession(): ReplacementSession | null {
  try {
    const value = JSON.parse(window.sessionStorage.getItem(SESSION_KEY) || "null");
    return typeof value?.access_token === "string" && typeof value?.refresh_token === "string" && typeof value?.user?.id === "string" ? value : null;
  } catch { return null; }
}
export function clearGoogleReplacementIntent() {
  window.localStorage.removeItem(GOOGLE_REPLACEMENT_INTENT_KEY);
  window.sessionStorage.removeItem(SESSION_KEY);
}
