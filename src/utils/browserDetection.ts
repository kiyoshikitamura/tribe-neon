const X_IN_APP_BROWSER_PATTERNS = [
  /Twitter for iPhone/i,
  /TwitterAndroid/i,
  /(?:^|\s)Twitter\/[\d.]+/i,
  /X for iPhone/i,
  /XAndroid/i,
];

const OAUTH_URL_KEYS = new Set([
  "access_token",
  "refresh_token",
  "provider_token",
  "provider_refresh_token",
  "token_type",
  "expires_in",
  "expires_at",
  "code",
  "error",
  "error_code",
  "error_description",
]);

export const OAUTH_RETURN_INTENT_KEY = "tribe_oauth_return_intent";
const OAUTH_RETURN_INTENT_MAX_AGE_MS = 30 * 60 * 1000;

function isSafeLocalReturnTo(value: string): boolean {
  return value.startsWith("/") && !value.startsWith("//") && !value.includes("\\");
}

export function rememberOAuthReturnTo(returnTo: string): void {
  if (typeof window === "undefined" || !isSafeLocalReturnTo(returnTo)) return;
  window.localStorage.setItem(OAUTH_RETURN_INTENT_KEY, JSON.stringify({
    returnTo,
    origin: window.location.origin,
    startedAt: Date.now(),
  }));
}

export function consumeRememberedOAuthReturnTo(): string | null {
  if (typeof window === "undefined") return null;
  const rawIntent = window.localStorage.getItem(OAUTH_RETURN_INTENT_KEY);
  window.localStorage.removeItem(OAUTH_RETURN_INTENT_KEY);
  if (!rawIntent) return null;
  try {
    const intent = JSON.parse(rawIntent) as Partial<{ returnTo: string; origin: string; startedAt: number }>;
    const age = Date.now() - Number(intent.startedAt || 0);
    if (typeof intent.returnTo !== "string"
      || !isSafeLocalReturnTo(intent.returnTo)
      || intent.origin !== window.location.origin
      || age < 0
      || age > OAUTH_RETURN_INTENT_MAX_AGE_MS) return null;
    return intent.returnTo;
  } catch {
    return null;
  }
}

export function isXInAppBrowser(userAgent?: string): boolean {
  const value = userAgent ?? (typeof navigator === "undefined" ? "" : navigator.userAgent);
  return X_IN_APP_BROWSER_PATTERNS.some((pattern) => pattern.test(value));
}

export type MobilePlatform = "ios" | "android" | "other";

export function getMobilePlatform(userAgent?: string): MobilePlatform {
  const value = userAgent ?? (typeof navigator === "undefined" ? "" : navigator.userAgent);
  if (/Android/i.test(value)) return "android";
  if (/iPhone|iPad|iPod/i.test(value)) return "ios";
  return "other";
}

function removeOAuthParameters(url: URL): URL {
  for (const key of OAUTH_URL_KEYS) url.searchParams.delete(key);

  const hashParams = new URLSearchParams(url.hash.replace(/^#/, ""));
  if ([...hashParams.keys()].some((key) => OAUTH_URL_KEYS.has(key))) {
    url.hash = "";
  }
  return url;
}

export function getExternalBrowserUrl(currentUrl?: string): string {
  const value = currentUrl ?? (typeof window === "undefined" ? "" : window.location.href);
  if (!value) return "/";
  return removeOAuthParameters(new URL(value)).toString();
}

export function getGameUrlFromEntry(entryUrl?: string): string {
  const value = entryUrl ?? (typeof window === "undefined" ? "" : window.location.href);
  if (!value) return "/";
  const entry = removeOAuthParameters(new URL(value));
  const destination = new URL("/", entry.origin);
  entry.searchParams.forEach((paramValue, key) => destination.searchParams.append(key, paramValue));
  return destination.toString();
}

export function getAndroidChromeIntentUrl(httpsUrl: string): string {
  const destination = removeOAuthParameters(new URL(httpsUrl));
  if (destination.protocol !== "https:") return destination.toString();
  const intentTarget = `${destination.host}${destination.pathname}${destination.search}${destination.hash}`;
  return `intent://${intentTarget}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(destination.toString())};end`;
}

export function getExternalBrowserLaunchUrl(httpsUrl: string, userAgent?: string): string {
  return getMobilePlatform(userAgent) === "android"
    ? getAndroidChromeIntentUrl(httpsUrl)
    : httpsUrl;
}

export function getOAuthCallbackUrl(currentUrl?: string): string {
  const value = currentUrl ?? (typeof window === "undefined" ? "" : window.location.href);
  if (!value) return "/auth/callback";
  const current = removeOAuthParameters(new URL(value));
  const callback = new URL("/auth/callback", current.origin);
  current.searchParams.forEach((paramValue, key) => callback.searchParams.append(key, paramValue));
  return callback.toString();
}

export function getOAuthReturnUrl(callbackUrl?: string): string {
  const value = callbackUrl ?? (typeof window === "undefined" ? "" : window.location.href);
  if (!value) return "/";
  const callback = removeOAuthParameters(new URL(value));
  const returnTo = callback.searchParams.get("return_to");
  const returnDestination = returnTo?.startsWith("/")
    && !returnTo.startsWith("//")
    && !returnTo.includes("\\")
    ? new URL(returnTo, callback.origin)
    : null;
  const safePath = returnDestination?.origin === callback.origin
    ? `${returnDestination.pathname}${returnDestination.search}${returnDestination.hash}`
    : "/";
  const destination = new URL(safePath, callback.origin);
  callback.searchParams.forEach((paramValue, key) => {
    if (key !== "return_to") destination.searchParams.append(key, paramValue);
  });
  return destination.toString();
}
