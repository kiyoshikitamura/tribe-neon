"use client";

import { useEffect, useState } from "react";
import { discardAnonymousAccountForSwitch, supabase } from "@/utils/supabase";
import { consumeRememberedOAuthReturnTo, getOAuthReturnUrl } from "@/utils/browserDetection";
import { commitAccountSwitchIdentityTransition, prepareAccountSwitchIdentityTransition, recordSameSubjectIdentityTransition } from "@/utils/kpiInstrumentation";

const ONBOARDING_AUTH_INTENT_KEY = "tribe_onboarding_auth_intent";
const ONBOARDING_AUTH_INTENT_MAX_AGE_MS = 30 * 60 * 1000;
const AUTH_CALLBACK_TIMEOUT_MS = 15_000;

type GoogleOnboardingIntent = {
  method: "GOOGLE";
  userId: string;
  startedAt: number;
};

function readGoogleOnboardingIntent(): { present: boolean; intent: GoogleOnboardingIntent | null } {
  const rawIntent = window.localStorage.getItem(ONBOARDING_AUTH_INTENT_KEY);
  if (!rawIntent) return { present: false, intent: null };
  try {
    const value = JSON.parse(rawIntent) as Partial<GoogleOnboardingIntent>;
    const age = Date.now() - Number(value.startedAt || 0);
    const valid = value.method === "GOOGLE"
      && typeof value.userId === "string"
      && value.userId.length > 0
      && age >= 0
      && age <= ONBOARDING_AUTH_INTENT_MAX_AGE_MS;
    return { present: true, intent: valid ? value as GoogleOnboardingIntent : null };
  } catch {
    return { present: true, intent: null };
  }
}

async function withAuthCallbackTimeout<T>(operation: Promise<T>): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error("Googleログインの確認がタイムアウトしました。もう一度お試しください。")), AUTH_CALLBACK_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

export default function AuthCallbackPage() {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let redirected = false;

    const returnToApp = (accountSwitch?: "google", accountSwitchError?: string) => {
      if (!active || redirected) return;
      redirected = true;
      const callbackUrl = new URL(window.location.href);
      const rememberedReturnTo = consumeRememberedOAuthReturnTo();
      const destination = new URL(
        !callbackUrl.searchParams.has("return_to") && rememberedReturnTo
          ? rememberedReturnTo
          : getOAuthReturnUrl(),
        callbackUrl.origin,
      );
      if (accountSwitch) destination.searchParams.set("account_switch", accountSwitch);
      if (accountSwitchError) destination.searchParams.set("account_switch_error", accountSwitchError);
      window.location.replace(destination.toString());
    };

    const completeCallback = async () => {
      const callbackUrl = new URL(window.location.href);
      const callbackHash = new URLSearchParams(callbackUrl.hash.replace(/^#/, ""));
      const oauthError = callbackUrl.searchParams.get("error_description")
        || callbackUrl.searchParams.get("error")
        || callbackHash.get("error_description")
        || callbackHash.get("error");
      if (oauthError) {
        const errorCode = callbackUrl.searchParams.get("error_code") || callbackUrl.searchParams.get("error")
          || callbackHash.get("error_code") || callbackHash.get("error");
        if (errorCode === "identity_already_exists" || /already linked to another user/i.test(oauthError)) {
          returnToApp("google");
          return;
        }
        setError(oauthError);
        return;
      }

      const code = callbackUrl.searchParams.get("code");
      if (code) {
        // linkIdentity can return a session for an already-linked Google
        // account. Preserve the anonymous tutorial session in memory so that
        // this collision can be presented as an explicit choice instead of
        // silently replacing the player at the title screen.
        const { data: beforeExchange } = await withAuthCallbackTimeout(supabase.auth.getSession());
        let loginIntent: { method?: string; sourceUserId?: string } | null = null;
        try {
          loginIntent = JSON.parse(window.localStorage.getItem("tribe_existing_google_login_intent") || "null");
        } catch {
          loginIntent = null;
        }
        const onboardingIntentState = readGoogleOnboardingIntent();
        const onboardingIntent = onboardingIntentState.intent;
        const switchingToExistingData = loginIntent?.method === "GOOGLE_SWITCH";
        const tutorialSession = beforeExchange.session?.user?.is_anonymous ? beforeExchange.session : null;
        if (onboardingIntentState.present && !onboardingIntent) {
          setError("Google連携の開始情報を確認できませんでした。データ保護のため連携を中止しました。「はじめから」は押さず、サポートへお問い合わせください。");
          return;
        }
        if (onboardingIntent && (!tutorialSession || tutorialSession.user.id !== onboardingIntent.userId)) {
          setError("Google連携を開始したゲームデータのセッションを確認できませんでした。データ保護のため連携を中止しました。「はじめから」は押さず、サポートへお問い合わせください。");
          return;
        }
        const { data: exchangeData, error: exchangeError } = await withAuthCallbackTimeout(
          supabase.auth.exchangeCodeForSession(code),
        );
        if (exchangeError) {
          setError(exchangeError.message);
          return;
        }
        if (!exchangeData.session) {
          setError("Googleログイン後のセッションを確認できませんでした。");
          return;
        }
        if (switchingToExistingData) {
          if (!tutorialSession || tutorialSession.user.id !== loginIntent?.sourceUserId) {
            window.localStorage.removeItem("tribe_existing_google_login_intent");
            setError("切り替え元のチュートリアルデータを確認できませんでした。データ保護のため処理を中止しました。");
            return;
          }
          const { data: existingState, error: existingStateError } = await supabase.rpc("get_current_onboarding_state");
          if (existingStateError || !existingState?.has_profile) {
            await supabase.auth.setSession({
              access_token: tutorialSession.access_token,
              refresh_token: tutorialSession.refresh_token,
            });
            window.localStorage.removeItem("tribe_existing_google_login_intent");
            returnToApp(undefined, "NO_EXISTING_GAME_DATA");
            return;
          }
          const transitionEvidence = await prepareAccountSwitchIdentityTransition(
            tutorialSession.access_token,
            exchangeData.session.access_token,
          );
          const { data: discarded, error: discardError } = await discardAnonymousAccountForSwitch(tutorialSession);
          if (discardError || discarded?.discardedUserId !== tutorialSession.user.id || discarded?.gameplayMerged !== false) {
            await supabase.auth.setSession({
              access_token: tutorialSession.access_token,
              refresh_token: tutorialSession.refresh_token,
            });
            window.localStorage.removeItem("tribe_existing_google_login_intent");
            returnToApp(undefined, "ANONYMOUS_DISCARD_FAILED");
            return;
          }
          if (transitionEvidence) void commitAccountSwitchIdentityTransition(transitionEvidence, exchangeData.session.access_token);
          returnToApp();
          return;
        }
        if (onboardingIntent && exchangeData.session.user.id !== onboardingIntent.userId) {
          const { error: restoreError } = await supabase.auth.setSession({
            access_token: tutorialSession!.access_token,
            refresh_token: tutorialSession!.refresh_token,
          });
          if (restoreError) {
            setError("元のゲームデータを保護できませんでした。この画面を閉じず、サポートへお問い合わせください。");
            return;
          }
          setError("選択されたGoogleアカウントは別のユーザーに登録されています。元のゲームデータは保持されています。TRIBE NEONへ戻り、別のGoogleアカウントを選択してください。");
          return;
        }
        if (tutorialSession && exchangeData.session.user.id !== tutorialSession.user.id) {
          const { error: restoreError } = await supabase.auth.setSession({
            access_token: tutorialSession.access_token,
            refresh_token: tutorialSession.refresh_token,
          });
          if (restoreError) {
            setError("チュートリアルデータを保護できませんでした。画面を閉じてサポートへお問い合わせください。");
            return;
          }
          returnToApp("google");
          return;
        }
        if (onboardingIntent && exchangeData.session.user.id === onboardingIntent.userId) {
          void recordSameSubjectIdentityTransition(exchangeData.session.access_token);
        }
        returnToApp();
        return;
      }

      const { data, error: sessionError } = await withAuthCallbackTimeout(supabase.auth.getSession());
      if (sessionError) {
        setError(sessionError.message);
        return;
      }
      if (data.session) {
        returnToApp();
        return;
      }
      setError("Googleログイン後のセッションを確認できませんでした。もう一度お試しください。");
    };

    void completeCallback().catch((callbackError: unknown) => {
      if (!active) return;
      setError(callbackError instanceof Error
        ? callbackError.message
        : "Googleログインの完了処理に失敗しました。もう一度お試しください。");
    });

    return () => {
      active = false;
    };
  }, []);

  return (
    <main className="app-container">
      <div className="app-loading-screen">
        {error ? (
          <div className="modal-card border-danger" style={{ maxWidth: 420 }}>
            <div className="modal-title text-color-danger">Googleログインに失敗しました</div>
            <div className="modal-desc">{error}</div>
            <a className="modal-close-btn background-danger" href={getOAuthReturnUrl()}>
              TRIBE NEONへ戻る
            </a>
          </div>
        ) : (
          <>
            <div className="spinner" />
            <div className="modal-desc mt-3">Googleログインを完了しています...</div>
          </>
        )}
      </div>
    </main>
  );
}
