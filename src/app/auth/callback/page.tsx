"use client";

import { useEffect, useRef, useState } from "react";
import { discardAnonymousAccountForSwitch, supabase } from "@/utils/supabase";
import { consumeRememberedOAuthReturnTo, getOAuthReturnUrl, getOAuthCallbackUrl } from "@/utils/browserDetection";
import { commitAccountSwitchIdentityTransition, prepareAccountSwitchIdentityTransition, recordSameSubjectIdentityTransition } from "@/utils/kpiInstrumentation";

import { GOOGLE_REPLACEMENT_INTENT_KEY, clearGoogleReplacementIntent, readGoogleReplacementIntent, readReplacementGuestSession, saveGoogleReplacementIntent, saveReplacementGuestSession, type GoogleReplacementIntent, type ReplacementSession } from "@/utils/googleReplacementIntent";

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
  const [accountConflictReturnUrl, setAccountConflictReturnUrl] = useState<string | null>(null);

  const [replacement, setReplacement] = useState<{ intent: GoogleReplacementIntent; guest: ReplacementSession; currentUsername: string; existingUsername: string; deletionStarted?: boolean } | null>(null);
  const [replacementWorking, setReplacementWorking] = useState(false);
  const googleButton = useRef<HTMLDivElement>(null);
  const [googleIdToken, setGoogleIdToken] = useState<string | null>(null);
  const [googleCredentialReady, setGoogleCredentialReady] = useState(false);
  const [replacementComplete, setReplacementComplete] = useState(false);

  const replacementRequest = async (guest: ReplacementSession, body: Record<string, unknown>) => {
    const response = await fetch("/api/auth/replace-google", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${guest.access_token}` }, body: JSON.stringify(body) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "置き換え処理を完了できませんでした。");
    return result;
  };
  const restoreGuest = async (guest: ReplacementSession) => {
    const { data, error: restoreError } = await supabase.auth.setSession({ access_token: guest.access_token, refresh_token: guest.refresh_token });
    if (restoreError || data.session?.user.id !== guest.user.id) throw new Error("現在のゲームデータのセッションを復元できませんでした。この画面を閉じず、サポートへお問い合わせください。");
    saveReplacementGuestSession(data.session);
    return data.session;
  };
  const finishReplacement = async (state: NonNullable<typeof replacement>) => {
    // A successful native link can outlive a failed refresh/finalize response.
    // Recover the linked source directly; never send it back through guest-only confirm.
    const { data: current, error: userError } = await supabase.auth.getUser();
    if (userError || current.user?.id !== state.intent.userId) throw new Error("現在のゲームデータの認証状態を確認できませんでした。この画面で再試行してください。");
    if (current.user.is_anonymous) return false;
    if (!current.user.identities?.some((identity: { provider?: string }) => identity.provider === "google")) throw new Error("想定と異なる認証方法です。現在のゲームデータを保持して処理を停止しました。");
    const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
    if (refreshError || refreshed.session?.user.id !== state.intent.userId) throw new Error("現在のゲームデータへの連携確認を再試行してください。");
    saveReplacementGuestSession(refreshed.session);
    setReplacement({ ...state, guest: refreshed.session });
    await replacementRequest(refreshed.session, { phase: "finalize", intentId: state.intent.intentId });
    clearGoogleReplacementIntent();
    window.localStorage.removeItem(ONBOARDING_AUTH_INTENT_KEY);
    setGoogleIdToken(null); setReplacement(null); setReplacementComplete(true);
    return true;
  };
  const linkReplacement = async (state: NonNullable<typeof replacement>, token: string) => {
    const intent = { ...state.intent, phase: "LINK" as const };
    saveGoogleReplacementIntent(intent);
    setReplacement({ ...state, intent, deletionStarted: true });
    const guest = await restoreGuest(state.guest);
    setReplacement({ ...state, guest, intent, deletionStarted: true });
    // The server verified this exact Google credential before deletion. There
    // must be no second account picker after the destructive confirmation.
    const { data, error: linkError } = await supabase.auth.linkIdentity({ provider: "google", token, nonce: intent.intentId });
    if (linkError || data.user?.id !== guest.user.id) throw new Error("旧データは削除済みです。現在のゲームデータは保持されています。同じGoogleアカウントを確認し、連携を再開してください。");
    const { data: linkedSession } = await supabase.auth.getSession();
    if (linkedSession.session?.user.id === guest.user.id) saveReplacementGuestSession(linkedSession.session);
    if (!await finishReplacement({ ...state, intent })) throw new Error("Google連携の反映を確認できませんでした。この画面で再試行してください。");
  };
  const confirmReplacement = async () => {
    if (!replacement || replacementWorking) return;
    setReplacementWorking(true); setError(null);
    const state = { ...replacement, intent: { ...replacement.intent, deletionStarted: true }, deletionStarted: true };
    saveGoogleReplacementIntent(state.intent);
    setReplacement(state);
    try {
      if (state.intent.phase === "LINK" && await finishReplacement(state)) return;
      if (!googleIdToken) throw new Error("同じGoogleアカウントを確認してから連携を再開してください。");
      state.guest = await restoreGuest(state.guest);
      setReplacement(state);
      await replacementRequest(state.guest, { phase: "confirm", intentId: state.intent.intentId, confirmed: true, googleIdToken });
      await linkReplacement(state, googleIdToken);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "置き換え処理を確認できませんでした。同じ操作で再試行してください。");
      setReplacementWorking(false);
    }
  };
  const cancelReplacement = async () => {
    if (!replacement || replacementWorking || replacement.intent.phase === "LINK") return;
    setReplacementWorking(true); setError(null);
    try {
      if (replacement.intent.intentId) await replacementRequest(replacement.guest, { phase: "cancel", intentId: replacement.intent.intentId });
      await restoreGuest(replacement.guest);
      clearGoogleReplacementIntent();
      window.localStorage.removeItem(ONBOARDING_AUTH_INTENT_KEY);
      window.location.replace(getOAuthReturnUrl());
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "中止処理を完了できませんでした。");
      setReplacementWorking(false);
    }
  };

  useEffect(() => {
    if (!replacement?.intent.intentId) return;
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    if (!clientId) { setError("Googleアカウント置き換えの認証設定が未完了です。削除せず中止してください。"); return; }
    let active = true;
    const initialize = async () => {
      if (!active || !googleButton.current) return;
      const gis = (window as unknown as { google?: { accounts?: { id?: {
        initialize: (options: Record<string, unknown>) => void;
        renderButton: (element: HTMLElement, options: Record<string, unknown>) => void;
      } } } }).google?.accounts?.id;
      if (!gis) return;
      const nonceBytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(replacement.intent.intentId));
      const nonce = Array.from(new Uint8Array(nonceBytes), byte => byte.toString(16).padStart(2, "0")).join("");
      if (!active || !googleButton.current) return;
      gis.initialize({ client_id: clientId, nonce, auto_select: false, callback: (response: { credential?: string }) => {
        if (!active || !response.credential) return;
        // This callback only stores proof. Deletion still needs the explicit
        // confirmation below, and the server checks the exact Google subject.
        setGoogleIdToken(response.credential); setGoogleCredentialReady(true);
      } });
      gis.renderButton(googleButton.current, { theme: "outline", size: "large", text: "continue_with" });
    };
    const existing = document.getElementById("google-identity-services");
    if (existing) {
      void initialize();
      existing.addEventListener("load", initialize, { once: true });
    }
    else {
      const script = document.createElement("script");
      script.id = "google-identity-services"; script.src = "https://accounts.google.com/gsi/client"; script.async = true;
      script.onload = initialize;
      script.onerror = () => { if (active) setError("Google確認を読み込めませんでした。データは削除していません。"); };
      document.head.appendChild(script);
    }
    return () => { active = false; };
  }, [replacement?.intent.intentId]);

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
      if (accountSwitch) {
        // OAuth collisions must be acknowledged here, before returning to Home.
        setAccountConflictReturnUrl(destination.toString());
        return;
      }
      window.location.replace(destination.toString());
    };

    const completeCallback = async () => {
      const callbackUrl = new URL(window.location.href);
      const callbackHash = new URLSearchParams(callbackUrl.hash.replace(/^#/, ""));
      const replacementIntent = readGoogleReplacementIntent();
      const replacementGuest = readReplacementGuestSession();
      if (window.localStorage.getItem(GOOGLE_REPLACEMENT_INTENT_KEY) && (!replacementIntent || !replacementGuest || replacementGuest.user.id !== replacementIntent.userId)) {
        setError("置き換えの開始情報を確認できませんでした。現在のゲームデータは保持されています。この画面を閉じず、サポートへお問い合わせください。");
        return;
      }
      if (replacementIntent && replacementGuest) {
        let state = { intent: replacementIntent, guest: replacementGuest, currentUsername: replacementIntent.currentUsername || "現在のプレイヤー", existingUsername: replacementIntent.existingUsername || "登録済みプレイヤー", deletionStarted: Boolean(replacementIntent.deletionStarted) || replacementIntent.phase === "LINK" };
        setReplacement(state);
        if (replacementIntent.phase === "LINK") {
          await restoreGuest(replacementGuest);
          await finishReplacement(state);
          return;
        }
        const providerError = callbackUrl.searchParams.get("error") || callbackHash.get("error");
        if (providerError) {
          await restoreGuest(replacementGuest);
          setError("Google認証が完了しませんでした。データの削除は行っていません。中止して元のデータへ戻れます。");
          return;
        }
        const code = callbackUrl.searchParams.get("code");
        if (!code && replacementIntent.phase === "CONFIRM") {
          await restoreGuest(replacementGuest);
          return;
        }
        const exchange = code ? await withAuthCallbackTimeout(supabase.auth.exchangeCodeForSession(code)) : await withAuthCallbackTimeout(supabase.auth.getSession());
        if (exchange.error || !exchange.data.session) throw new Error("Google認証を確認できませんでした。データの選択をやり直してください。");
        const prepared = await replacementRequest(replacementGuest, { phase: "prepare", googleAccessToken: exchange.data.session.access_token });
        const guest = await restoreGuest(replacementGuest);
        const intent = { ...replacementIntent, intentId: prepared.intentId, currentUsername: prepared.currentUsername, existingUsername: prepared.existingUsername, phase: "CONFIRM" as const };
        saveGoogleReplacementIntent(intent);
        state = { intent, guest, currentUsername: prepared.currentUsername, existingUsername: prepared.existingUsername, deletionStarted: false };
        setReplacement(state);
        window.history.replaceState({}, "", callbackUrl.pathname);
        return;
      }
      const oauthError = callbackUrl.searchParams.get("error_description")
        || callbackUrl.searchParams.get("error")
        || callbackHash.get("error_description")
        || callbackHash.get("error");
      if (oauthError) {
        const errorCode = callbackUrl.searchParams.get("error_code") || callbackUrl.searchParams.get("error")
          || callbackHash.get("error_code") || callbackHash.get("error");
        if (errorCode === "identity_already_exists" || errorCode === "user_already_exists" || /already linked to another user/i.test(oauthError)) {
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
          returnToApp("google");
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
        {replacementComplete ? (
          <div className="modal-card"><div className="modal-title">Google連携が完了しました</div><div className="modal-desc">現在のゲームデータをGoogleアカウントに連携しました。</div><a className="semantic-cta semantic-cta--primary" href={getOAuthReturnUrl()}>マイページへ</a></div>
        ) : replacement ? (
          <div className="modal-card" style={{ maxWidth: 420 }} role="alertdialog" aria-modal="true" aria-labelledby="replacement-title">
            <div id="replacement-title" className="modal-title">{replacement.deletionStarted ? "Google連携の完了" : "現在のデータで置き換えますか？"}</div>
            <div className="modal-desc">
              {replacement.intent.phase === "LINK" ? "旧データは削除済みです。現在のゲームデータは保持されています。先ほど確認したGoogleアカウントを選んで連携してください。" : <>既存の「{replacement.existingUsername}」のゲームデータと認証登録を削除します。削除すると復元できません。<br /><br />現在の「{replacement.currentUsername}」のゲームデータを残し、このGoogleアカウントに連携します。</>}
            </div>
            {error && <div className="modal-desc text-color-danger" role="alert">{error}</div>}
            <div ref={googleButton} />
            {googleCredentialReady && <div className="modal-desc">Googleアカウントを確認しました。置き換える場合は以下で確定してください。</div>}
            {replacement.intent.intentId && <button className="semantic-cta semantic-cta--danger width-100" disabled={replacementWorking || (!googleIdToken && replacement.intent.phase !== "LINK")} onClick={() => void confirmReplacement()}>{replacementWorking ? "処理中..." : replacement.intent.phase === "LINK" ? "同じGoogleアカウントで連携を再開" : replacement.deletionStarted ? "置き換え処理を再試行" : "既存データを削除して現在のデータを連携する"}</button>}
            {replacement.intent.phase !== "LINK" && <button className="semantic-cta semantic-cta--secondary mt-2 width-100" disabled={replacementWorking} onClick={() => void cancelReplacement()}>{replacement.deletionStarted ? "中止できるか確認する" : "中止して現在のデータに戻る"}</button>}
          </div>
        ) : accountConflictReturnUrl ? (
          <div className="modal-card" style={{ maxWidth: 420 }} role="alertdialog" aria-modal="true" aria-labelledby="google-conflict-title">
            <div id="google-conflict-title" className="modal-title">このGoogleアカウントは登録済みです</div>
            <div className="modal-desc">
              選択したGoogleアカウントは、別のゲームデータに連携されています。現在の未認証データへのGoogle連携は完了していません。
              <br /><br />
              現在のゲームデータは保持されています。次の画面で使用するデータを選んでください。
            </div>
            <a className="semantic-cta semantic-cta--primary width-100" href={accountConflictReturnUrl}>
              使用するデータを選ぶ
            </a>
          </div>
        ) : error ? (
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
