export const LEGAL_SETTINGS_RETURN_QUERY = "return_from";
export const LEGAL_SETTINGS_RETURN_VALUE = "legal_settings";
const LEGAL_SETTINGS_RETURN_KEY = "tribe_legal_settings_return";
const LEGAL_SETTINGS_RETURN_MAX_AGE_MS = 5 * 60 * 1000;

type LegalSettingsReturnMarker = {
  userId: string;
  startedAt: number;
};

export function armLegalSettingsReturn(userId: string): void {
  if (typeof window === "undefined" || !userId) return;
  const marker: LegalSettingsReturnMarker = { userId, startedAt: Date.now() };
  window.sessionStorage.setItem(LEGAL_SETTINGS_RETURN_KEY, JSON.stringify(marker));
}

export function isLegalSettingsReturnRequested(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get(LEGAL_SETTINGS_RETURN_QUERY) === LEGAL_SETTINGS_RETURN_VALUE;
}

export function hasPendingLegalSettingsReturn(userId?: string): boolean {
  if (typeof window === "undefined") return false;
  if (!isLegalSettingsReturnRequested()) return false;
  try {
    const marker = JSON.parse(window.sessionStorage.getItem(LEGAL_SETTINGS_RETURN_KEY) || "null") as LegalSettingsReturnMarker | null;
    const age = Date.now() - Number(marker?.startedAt || 0);
    const valid = Boolean(marker?.userId)
      && age >= 0
      && age <= LEGAL_SETTINGS_RETURN_MAX_AGE_MS
      && (!userId || marker?.userId === userId);
    if (valid) return true;
  } catch {
    // 壊れた復帰情報は未認証の直接アクセスと同じく扱う。
  }
  clearLegalSettingsReturn();
  return false;
}

export function clearLegalSettingsReturn(): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(LEGAL_SETTINGS_RETURN_KEY);
  const url = new URL(window.location.href);
  if (url.searchParams.get(LEGAL_SETTINGS_RETURN_QUERY) === LEGAL_SETTINGS_RETURN_VALUE) {
    url.searchParams.delete(LEGAL_SETTINGS_RETURN_QUERY);
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }
}
