"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { authenticateExistingEmailAccount, discardAnonymousAccountForSwitch, supabase, usingMockSupabase } from "@/utils/supabase";
import { EMAIL_ONBOARDING_INTENT_KEY, readEmailOnboardingIntent, type EmailOnboardingIntent } from "@/utils/authIntents";
import { getExternalBrowserUrl, getOAuthCallbackUrl, isXInAppBrowser } from "@/utils/browserDetection";
import { useGame } from "../context/GameContext";
import { EXISTING_GOOGLE_LOGIN_INTENT_KEY } from "../context/hooks/useAuth";
import ExternalBrowserGooglePrompt from "./ExternalBrowserGooglePrompt";
import { commitAccountSwitchIdentityTransition, prepareAccountSwitchIdentityTransition, recordSameSubjectIdentityTransition } from "@/utils/kpiInstrumentation";

const AUTH_INTENT_KEY = "tribe_onboarding_auth_intent";
const AUTH_INTENT_MAX_AGE_MS = 30 * 60 * 1000;

type AuthenticationIntent = {
  method: "GOOGLE";
  userId: string;
  startedAt: number;
};

type AccountConflict = {
  method: "GOOGLE" | "EMAIL";
  email?: string;
  password?: string;
};

function clearAccountSwitchQuery() {
  const url = new URL(window.location.href);
  url.searchParams.delete("account_switch");
  window.history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}`);
}

function readGoogleIntent(): AuthenticationIntent | null {
  if (typeof window === "undefined") return null;
  try {
    const value = JSON.parse(window.localStorage.getItem(AUTH_INTENT_KEY) || "null") as AuthenticationIntent | null;
    const age = Date.now() - (value?.startedAt || 0);
    return value?.method === "GOOGLE"
      && typeof value.userId === "string"
      && age >= 0
      && age <= AUTH_INTENT_MAX_AGE_MS
      ? value
      : null;
  } catch {
    return null;
  }
}

function getOAuthReturnError(): string | null {
  if (typeof window === "undefined") return null;
  const query = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const accountSwitchError = query.get("account_switch_error");
  if (accountSwitchError === "NO_EXISTING_GAME_DATA") return "このGoogleアカウントにはゲームデータがありません。現在のチュートリアルデータは保持されています。別のGoogleアカウントを選んでください。";
  if (accountSwitchError === "ANONYMOUS_DISCARD_FAILED") return "現在のチュートリアルデータを安全に切り替えられませんでした。データは保持されています。もう一度お試しください。";
  const code = query.get("error_code") || query.get("error") || hash.get("error_code") || hash.get("error");
  if (!code) return null;
  if (code === "access_denied") return "Google連携はキャンセルされました。もう一度お試しください。";
  if (code === "identity_already_exists") return "このGoogleアカウントは既存アカウントで使用されています。既存アカウントへログインするか、別のGoogleアカウントを使用してください。";
  const description = query.get("error_description") || hash.get("error_description");
  return description || "Google連携を完了できませんでした。もう一度お試しください。";
}

function hasExistingAccountOAuthCollision(): boolean {
  if (typeof window === "undefined") return false;
  const query = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const code = query.get("error_code") || query.get("error") || hash.get("error_code") || hash.get("error");
  return code === "identity_already_exists" || code === "user_already_exists";
}

function getGoogleLinkError(code?: string, fallback?: string) {
  if (code === "identity_already_exists" || code === "user_already_exists") {
    return "このGoogleアカウントは既存アカウントで使用されています。既存アカウントへログインするか、別のGoogleアカウントを使用してください。";
  }
  if (code === "manual_linking_disabled") {
    return "Google連携を現在利用できません。認証設定を確認してください。";
  }
  return fallback || "Google連携を完了できませんでした。もう一度お試しください。";
}

export default function AccountAuthenticationModal() {
  const {
    session,
    onboardingState,
    setOnboardingState,
    playCyberSe,
    navigateTab,
    showTitleView,
    setShowTitleView,
    showAccountAuthenticationModal,
    setShowAccountAuthenticationModal,
    setShowAuthenticationReminder,
  } = useGame();
  const step = onboardingState?.tutorial_step ?? null;
  const isTutorialCompletion = step === "COMPLETE" && !onboardingState?.authentication_pending;
  const [email, setEmail] = useState(() => readEmailOnboardingIntent()?.email || "");
  const [googleExternalBrowserUrl, setGoogleExternalBrowserUrl] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(() => hasExistingAccountOAuthCollision() ? null : getOAuthReturnError());
  const [notice, setNotice] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [accountConflict, setAccountConflict] = useState<AccountConflict | null>(() => hasExistingAccountOAuthCollision() ? { method: "GOOGLE" } : null);
  const [hiddenForTitle, setHiddenForTitle] = useState(false);
  const workingRef = useRef(false);

  const beginWorking = () => {
    if (workingRef.current) return false;
    workingRef.current = true;
    setWorking(true);
    return true;
  };

  const endWorking = () => {
    workingRef.current = false;
    setWorking(false);
  };

  const finalize = useCallback(async (method: "EMAIL" | "GOOGLE") => {
    if (method === "GOOGLE") {
      const intent = readGoogleIntent();
      if (intent && intent.userId !== session?.user?.id) {
        window.localStorage.removeItem(AUTH_INTENT_KEY);
        setError("Google連携の開始時と異なるユーザーが検出されました。データ保護のため連携を中止しました。");
        return false;
      }
    }
    const { error: progressError } = await supabase.rpc("complete_tutorial_authentication", {
      p_auth_method: method
    });
    if (progressError) {
      setError(progressError.message);
      return false;
    }
    const { data: currentSession } = await supabase.auth.getSession();
    if (currentSession.session?.access_token) void recordSameSubjectIdentityTransition(currentSession.session.access_token);
    if (method === "GOOGLE") window.localStorage.removeItem(AUTH_INTENT_KEY);
    if (method === "EMAIL") window.localStorage.removeItem(EMAIL_ONBOARDING_INTENT_KEY);
    setNotice(null);
    setOnboardingState((current: any) => current ? {
      ...current,
      tutorial_step: "AUTHENTICATION",
      authentication_pending: false,
      auth_method: method,
      is_anonymous: false,
      supported_identity_count: 1,
      identity_integrity_valid: true,
      gameplay_authorized: true,
    } : current);
    setShowAccountAuthenticationModal(false);
    setShowAuthenticationReminder(false);
    navigateTab("home");
    return true;
  }, [navigateTab, session?.user?.id, setOnboardingState, setShowAccountAuthenticationModal, setShowAuthenticationReminder]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.localStorage.getItem(AUTH_INTENT_KEY) && !readGoogleIntent()) {
      window.localStorage.removeItem(AUTH_INTENT_KEY);
    }
    if (window.localStorage.getItem(EMAIL_ONBOARDING_INTENT_KEY) && !readEmailOnboardingIntent()) {
      window.localStorage.removeItem(EMAIL_ONBOARDING_INTENT_KEY);
    }
    const query = new URLSearchParams(window.location.search);
    if (query.get("account_switch") === "google") {
      setAccountConflict({ method: "GOOGLE" });
      setError(null);
    }
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    if (!query.has("error") && !query.has("error_code") && !query.has("account_switch_error") && !hash.has("error") && !hash.has("error_code")) return;
    window.localStorage.removeItem(AUTH_INTENT_KEY);
    window.history.replaceState({}, document.title, `${window.location.pathname}${window.location.hash.startsWith("#/") ? window.location.hash : ""}`);
  }, []);

  const cancelAccountSwitch = () => {
    window.localStorage.removeItem(EXISTING_GOOGLE_LOGIN_INTENT_KEY);
    window.localStorage.removeItem(AUTH_INTENT_KEY);
    clearAccountSwitchQuery();
    setAccountConflict(null);
    setError(null);
  };

  const returnToTitle = () => {
    window.localStorage.removeItem(EXISTING_GOOGLE_LOGIN_INTENT_KEY);
    clearAccountSwitchQuery();
    setAccountConflict(null);
    setError(null);
    setNotice(null);
    setHiddenForTitle(true);
    setShowTitleView(true);
  };

  useEffect(() => {
    if (!showTitleView && hiddenForTitle) setHiddenForTitle(false);
  }, [hiddenForTitle, showTitleView]);

  const continueAccountSwitch = async () => {
    if (!accountConflict || !session?.user?.id || !session.user.is_anonymous || !beginWorking()) return;
    setError(null);
    let existingEmailSession: any = null;
    if (accountConflict.method === "EMAIL") {
      const verified = await authenticateExistingEmailAccount(accountConflict.email || "", accountConflict.password || "");
      if (verified.error || !verified.session) {
        setError(verified.error?.message || "既存アカウントを確認できませんでした。");
        endWorking();
        return;
      }
      existingEmailSession = verified.session;
    }

    const anonymousSession = session;
    const anonymousUserId = anonymousSession.user.id;
    if (accountConflict.method === "GOOGLE") {
      // Keep the tutorial player until Google proves that the destination
      // identity owns a gameplay profile. The callback performs the verified
      // discard through an isolated anonymous session.
      window.localStorage.removeItem(AUTH_INTENT_KEY);
      window.localStorage.removeItem(EMAIL_ONBOARDING_INTENT_KEY);
      window.localStorage.setItem(EXISTING_GOOGLE_LOGIN_INTENT_KEY, JSON.stringify({
        startedAt: Date.now(),
        method: "GOOGLE_SWITCH",
        sourceUserId: anonymousUserId,
      }));
      const { error: loginError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: getOAuthCallbackUrl(), queryParams: { prompt: "select_account" } },
      });
      if (loginError) {
        window.localStorage.removeItem(EXISTING_GOOGLE_LOGIN_INTENT_KEY);
        setError(loginError.message);
        endWorking();
      } else if (usingMockSupabase) {
        window.location.assign(`${getOAuthCallbackUrl()}?code=mock-google-switch`);
      }
      return;
    }

    const destinationUserId = existingEmailSession.user?.id;
    const { data: destinationSessionResult, error: sessionError } = await supabase.auth.setSession({
      access_token: existingEmailSession.access_token,
      refresh_token: existingEmailSession.refresh_token,
    });
    const destinationSession = destinationSessionResult.session;
    if (sessionError || !destinationUserId || !destinationSession || destinationSession.user?.id !== destinationUserId) {
      await supabase.auth.setSession({
        access_token: anonymousSession.access_token,
        refresh_token: anonymousSession.refresh_token,
      });
      setError(sessionError?.message || "既存アカウントのセッションを安全に確認できませんでした。");
      endWorking();
      return;
    }

    const transitionEvidence = await prepareAccountSwitchIdentityTransition(
      anonymousSession.access_token,
      destinationSession.access_token,
    );

    const { data: discardResult, error: discardError } = await discardAnonymousAccountForSwitch(anonymousSession);
    if (discardError || discardResult?.discardedUserId !== anonymousUserId || discardResult?.gameplayMerged !== false) {
      const { error: restoreError } = await supabase.auth.setSession({
        access_token: anonymousSession.access_token,
        refresh_token: anonymousSession.refresh_token,
      });
      setError(restoreError
        ? "未登録データは保持されていますが、元のセッションを復元できませんでした。ページを閉じずサポートへお問い合わせください。"
        : (discardError?.message || "未登録データを安全に破棄できませんでした。"));
      endWorking();
      return;
    }
    if (transitionEvidence) void commitAccountSwitchIdentityTransition(transitionEvidence, destinationSession.access_token);
    window.localStorage.removeItem(AUTH_INTENT_KEY);
    window.localStorage.removeItem(EMAIL_ONBOARDING_INTENT_KEY);
    clearAccountSwitchQuery();
    window.localStorage.setItem(EXISTING_GOOGLE_LOGIN_INTENT_KEY, JSON.stringify({ startedAt: Date.now(), method: "EMAIL" }));
    window.location.reload();
  };

  useEffect(() => {
    const identities = session?.user?.identities || [];
    const providers = new Set(identities.map((identity: { provider?: string }) => identity.provider));
    if (step !== "COMPLETE") return;
    if (session?.user?.is_anonymous && session?.user?.new_email) return;
    const hasOnlyGoogle = providers.has("google") && !providers.has("email");
    if (!session?.user?.is_anonymous && hasOnlyGoogle) {
      const completionTimer = window.setTimeout(() => void finalize("GOOGLE"), 0);
      return () => window.clearTimeout(completionTimer);
    }
  }, [finalize, session?.user?.identities, session?.user?.is_anonymous, session?.user?.new_email, step]);

  const googleIntent = readGoogleIntent();
  const emailIntent = readEmailOnboardingIntent();
  const googleIdentityMismatch = Boolean(googleIntent && session?.user?.id && googleIntent.userId !== session.user.id);
  const providers = new Set((session?.user?.identities || []).map((identity: { provider?: string }) => identity.provider));
  const hasOnlyEmailIdentity = !session?.user?.is_anonymous && providers.has("email") && !providers.has("google");
  // Email confirmation can return in a new tab/browser context where the
  // local intent is unavailable. The same-UID authenticated identity and the
  // server onboarding projection are the durable authority for resuming the
  // password/finalization step. A present mismatched intent still fails closed.
  const emailCompletionAuthorityReady = Boolean(hasOnlyEmailIdentity
    && session?.user?.id
    && onboardingState?.user_id === session.user.id
    && onboardingState?.has_profile
    && onboardingState?.tutorial_step === "COMPLETE"
    && onboardingState?.auth_method === "EMAIL"
    && onboardingState?.identity_integrity_valid
    && !onboardingState?.gameplay_authorized);
  const emailIdentityMismatch = Boolean(emailIntent && session?.user?.id && emailIntent.userId !== session.user.id);
  const displayedEmail = email || (emailCompletionAuthorityReady ? session?.user?.email || "" : "");

  const ownsAnonymousOnboardingState = session?.user?.is_anonymous === true
    && onboardingState?.user_id === session.user.id
    && onboardingState?.is_anonymous;

  if ((!ownsAnonymousOnboardingState && !accountConflict && !googleIdentityMismatch && !emailCompletionAuthorityReady && !emailIdentityMismatch)
    || (!isTutorialCompletion && !showAccountAuthenticationModal && !googleIdentityMismatch && !emailCompletionAuthorityReady && !emailIdentityMismatch)
    || (showTitleView && hiddenForTitle)) return null;

  const continueWithoutAuthentication = async () => {
    if (!session?.user?.id || !session.user.is_anonymous || !isTutorialCompletion || !beginWorking()) return;
    setError(null);
    setNotice(null);
    playCyberSe("click");
    try {
      const { data, error: deferError } = await supabase.rpc("defer_tutorial_authentication");
      if (deferError || data !== "COMPLETE") throw deferError || new Error("認証保留状態を保存できませんでした。");
      setOnboardingState((current: any) => current ? {
        ...current,
        tutorial_step: "COMPLETE",
        authentication_pending: true,
        is_anonymous: true,
        auth_method: null,
        identity_integrity_valid: true,
        gameplay_authorized: true,
      } : current);
      setShowAccountAuthenticationModal(false);
      setShowAuthenticationReminder(false);
      navigateTab("home");
    } catch (deferFailure: any) {
      setError(deferFailure?.message || "認証保留状態を保存できませんでした。");
    } finally {
      endWorking();
    }
  };

  const closeFromMyPage = () => {
    setError(null);
    setNotice(null);
    setShowAccountAuthenticationModal(false);
  };

  const connectEmail = async () => {
    if ((!hasOnlyEmailIdentity && !email.trim()) || password.length < 6) {
      setError("メールアドレスと6文字以上のパスワードを入力してください。");
      return;
    }
    if (!beginWorking()) return;
    setError(null);
    setNotice(null);
    window.localStorage.removeItem(AUTH_INTENT_KEY);
    playCyberSe("click");
    if (hasOnlyEmailIdentity) {
      const emailIntent = readEmailOnboardingIntent();
      if (emailIntent && emailIntent.userId !== session?.user?.id) {
        window.localStorage.removeItem(EMAIL_ONBOARDING_INTENT_KEY);
        setError("メール連携の開始時と異なるユーザーが検出されました。データ保護のため連携を中止しました。");
        endWorking();
        return;
      }
      if (!emailCompletionAuthorityReady) {
        setError("メール認証済みのゲームデータを安全に確認できませんでした。タイトルからもう一度お試しください。");
        endWorking();
        return;
      }
      const { error: passwordError } = await supabase.auth.updateUser({ password });
      if (passwordError) setError(passwordError.message);
      else await finalize("EMAIL");
      endWorking();
      return;
    }

    const normalizedEmail = email.trim();
    const anonymousSession = session;
    const emailIntent: EmailOnboardingIntent = { method: "EMAIL", userId: session!.user.id, email: normalizedEmail, startedAt: Date.now() };
    window.localStorage.setItem(EMAIL_ONBOARDING_INTENT_KEY, JSON.stringify(emailIntent));
    const { data: updateData, error: updateError } = await supabase.auth.updateUser(
      { email: normalizedEmail },
      { emailRedirectTo: window.location.origin }
    );
    if (updateError) {
      window.localStorage.removeItem(EMAIL_ONBOARDING_INTENT_KEY);
      const collisionCodes = ["email_exists", "user_already_exists", "identity_already_exists"];
      if (collisionCodes.includes(updateError.code || "")) {
        setAccountConflict({ method: "EMAIL", email: normalizedEmail, password });
        setError(null);
      } else setError(updateError.message);
    } else {
      const { data: refreshData } = await supabase.auth.refreshSession();
      const linkedUser = refreshData.session?.user || updateData.user;
      const hasEmailIdentity = linkedUser?.identities?.some((identity: { provider?: string }) => identity.provider === "email");
      if (linkedUser?.id !== emailIntent.userId) {
        window.localStorage.removeItem(EMAIL_ONBOARDING_INTENT_KEY);
        const { error: restoreError } = await supabase.auth.setSession({
          access_token: anonymousSession.access_token,
          refresh_token: anonymousSession.refresh_token,
        });
        setError(restoreError
          ? "メール連携の開始時と異なるユーザーが検出され、元のゲームデータのセッションを復元できませんでした。この画面を閉じずサポートへお問い合わせください。"
          : "メール連携の開始時と異なるユーザーが検出されました。元のゲームデータは保持されています。データ保護のため連携を中止しました。");
      } else if (hasEmailIdentity && !linkedUser?.is_anonymous) {
        const { error: passwordError } = await supabase.auth.updateUser({ password });
        if (passwordError) setError(passwordError.message);
        else await finalize("EMAIL");
      } else {
        setNotice(`確認メールを ${normalizedEmail} に送信しました。メール内のリンクを開いた後、パスワードを再入力して連携を完了してください。`);
      }
    }
    endWorking();
  };

  const connectGoogle = async () => {
    if (isXInAppBrowser()) {
      setGoogleExternalBrowserUrl(getExternalBrowserUrl());
      setError(null);
      return;
    }
    if (!session?.user?.id || !session.user.is_anonymous) {
      setError("匿名ユーザーのセッションを確認できません。ページを再読み込みしてからお試しください。");
      return;
    }
    if (!beginWorking()) return;
    setError(null);
    setNotice(null);
    playCyberSe("click");
    const intent: AuthenticationIntent = { method: "GOOGLE", userId: session.user.id, startedAt: Date.now() };
    window.localStorage.setItem(AUTH_INTENT_KEY, JSON.stringify(intent));
    const { data: linkData, error: linkError } = await supabase.auth.linkIdentity({
      provider: "google",
      options: { redirectTo: getOAuthCallbackUrl(), queryParams: { prompt: "select_account" } }
    });
    if (linkError) {
      window.localStorage.removeItem(AUTH_INTENT_KEY);
      if (linkError.code === "identity_already_exists" || linkError.code === "user_already_exists") {
        setAccountConflict({ method: "GOOGLE" });
        setError(null);
      } else setError(getGoogleLinkError(linkError.code, linkError.message));
      endWorking();
      return;
    }
    if (!linkData?.url) {
      const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
      const linkedUser = refreshData.session?.user;
      const hasGoogleIdentity = linkedUser?.identities?.some((identity: { provider?: string }) => identity.provider === "google");
      if (refreshError || !linkedUser || linkedUser.id !== intent.userId || linkedUser.is_anonymous || !hasGoogleIdentity) {
        window.localStorage.removeItem(AUTH_INTENT_KEY);
        setError("Google連携後のユーザー情報を確認できませんでした。ページを再読み込みしてからお試しください。");
      } else {
        await finalize("GOOGLE");
      }
      endWorking();
    }
  };

  const pendingEmailNotice = session?.user?.is_anonymous && session?.user?.new_email
    ? `確認メールを ${session.user.new_email} に送信しました。メール内のリンクを開いてください。`
    : null;
  const verifiedEmailNotice = emailCompletionAuthorityReady
    ? "メール確認が完了しました。パスワードを入力してアカウント連携を完了してください。"
    : null;
  const displayedNotice = notice || pendingEmailNotice || verifiedEmailNotice;
  const identityConflict = providers.has("email") && providers.has("google")
    ? "メールとGoogleの両方が検出されました。データ保護のため認証完了を中止しました。"
    : null;

  return (
    googleExternalBrowserUrl ? (
      <ExternalBrowserGooglePrompt
        url={googleExternalBrowserUrl}
        onClose={() => setGoogleExternalBrowserUrl(null)}
      />
    ) : accountConflict ? (
    <div className="modal-overlay background-black-95" style={{ zIndex: 20001 }}>
      <div className="modal-card" style={{ maxWidth: 420 }} role="dialog" aria-modal="true" aria-labelledby="account-switch-title">
        <div id="account-switch-title" className="modal-title text-left">
          {accountConflict.method === "GOOGLE" ? "登録済みのGoogleアカウントが見つかりました" : "既存のゲームデータが見つかりました"}
        </div>
        <div className="modal-desc text-left mb-3">
          <strong>
            {accountConflict.method === "GOOGLE"
              ? "注意：Google認証後に、TRIBE NEONのゲームデータがあるか確認します。"
              : "注意：このメールアドレスには、すでにTRIBE NEONのゲームデータがあります。"}
          </strong>
          <br /><br />
          {accountConflict.method === "GOOGLE"
            ? "ゲームデータを確認できた場合のみ、現在の未登録データを削除して既存データへ切り替えます。データを確認できない場合、現在のチュートリアルデータは保持されます。"
            : "現在のチュートリアルデータと既存データは統合できません。既存データへ切り替えると、現在の未登録データは削除され、元に戻せません。"}
        </div>
        {error && <div className="text-color-red font-size-7 mb-2" role="alert">{error}</div>}
        <button className="semantic-cta semantic-cta--danger width-100" onClick={() => void continueAccountSwitch()} disabled={working} aria-busy={working}>
          {working ? "切り替え中..." : "既存データへ切り替える"}
        </button>
        <button className="semantic-cta semantic-cta--secondary mt-2 width-100" onClick={cancelAccountSwitch} disabled={working}>
          {accountConflict.method === "GOOGLE" ? "別のGoogleアカウントを選ぶ" : "別のメールアドレスを選ぶ"}
        </button>
        {showAccountAuthenticationModal ? <button className="semantic-cta semantic-cta--secondary mt-2 width-100" onClick={closeFromMyPage} disabled={working}>
          閉じる
        </button> : <button className="semantic-cta semantic-cta--secondary mt-2 width-100" onClick={returnToTitle} disabled={working}>
          タイトルに戻る
        </button>}
      </div>
    </div>
    ) : (
    <div className="modal-overlay background-black-95" style={{ zIndex: 20000 }}>
      <div className="modal-card" style={{ maxWidth: 420 }} role="dialog" aria-modal="true" aria-labelledby="account-authentication-title">
        <div id="account-authentication-title" className="modal-title text-left">ゲームデータを保存</div>
        <div className="modal-desc text-left mb-3">
          データを保護・引き継げるよう、Googleまたはメールのどちらか1つを連携してください。同じアカウントで両方を使用することはできません。
        </div>
        <button className="semantic-cta semantic-cta--primary width-100" onClick={() => void connectGoogle()} disabled={working || googleIdentityMismatch || hasOnlyEmailIdentity} aria-busy={working}>
          {working ? "連携中..." : "Googleアカウントを連携"}
        </button>
        <div className="auth-method-divider mt-3 mb-3"><span>またはメールで連携</span></div>
        <input className="auth-input mb-2" type="email" placeholder="メールアドレス" value={displayedEmail} onChange={(event) => setEmail(event.target.value)} disabled={hasOnlyEmailIdentity} />
        <input className="auth-input" type="password" placeholder="パスワード（6文字以上）" value={password} onChange={(event) => setPassword(event.target.value)} />
        <button className="semantic-cta semantic-cta--secondary mt-3 width-100" onClick={() => void connectEmail()} disabled={working || googleIdentityMismatch || emailIdentityMismatch} aria-busy={working}>
          {working ? "連携中..." : hasOnlyEmailIdentity ? "パスワードを設定して完了" : "メールアカウントを連携"}
        </button>
        {isTutorialCompletion && session?.user?.is_anonymous && <button className="semantic-cta semantic-cta--secondary mt-2 width-100" onClick={() => void continueWithoutAuthentication()} disabled={working}>
          そのまま続ける
        </button>}
        {showAccountAuthenticationModal ? <button className="semantic-cta semantic-cta--secondary mt-2 width-100" onClick={closeFromMyPage} disabled={working}>
          閉じる
        </button> : <button className="semantic-cta semantic-cta--secondary mt-2 width-100" onClick={returnToTitle} disabled={working}>
          タイトルに戻る
        </button>}
        {displayedNotice && <div className="text-color-cyan font-size-7 mt-2" role="status">{displayedNotice}</div>}
        {(error || identityConflict || googleIdentityMismatch || emailIdentityMismatch) && <div className="text-color-red font-size-7 mt-2">
          {error || identityConflict || (emailIdentityMismatch
            ? "メール連携の開始時と異なるユーザーが検出されました。データ保護のため連携を中止しました。"
            : "Google連携の開始時と異なるユーザーが検出されました。データ保護のため連携を中止しました。")}
        </div>}
      </div>
    </div>
    )
  );
}
