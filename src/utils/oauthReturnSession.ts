import type { SupabaseClient } from "@supabase/supabase-js";

// The callback must inspect the original session before accepting an OAuth
// session. SDK auto-detection otherwise replaces it (or clears it on error).
export function shouldAutoDetectAuthReturn(href?: string): boolean {
  if (!href) return true;
  const url = new URL(href);
  const hash = new URLSearchParams(url.hash.slice(1));
  return url.pathname.replace(/\/$/, "") !== "/auth/callback"
    && ![url.searchParams, hash].some(params =>
      params.has("error") || params.has("error_code") || params.has("error_description"));
}

type CallbackAuth = Pick<SupabaseClient["auth"], "exchangeCodeForSession" | "setSession" | "getSession">;

export async function acceptOAuthReturn(auth: CallbackAuth, href: string) {
  const url = new URL(href);
  const hash = new URLSearchParams(url.hash.slice(1));
  const error = url.searchParams.get("error_description") || url.searchParams.get("error")
    || hash.get("error_description") || hash.get("error");
  if (error) throw new Error(error);
  const code = url.searchParams.get("code");
  if (code) return auth.exchangeCodeForSession(code);
  const accessToken = hash.get("access_token");
  const refreshToken = hash.get("refresh_token");
  if (accessToken || refreshToken) {
    if (!accessToken || !refreshToken) throw new Error("Google認証の戻り情報が不足しています。もう一度お試しください。");
    return auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
  }
  return auth.getSession();
}
