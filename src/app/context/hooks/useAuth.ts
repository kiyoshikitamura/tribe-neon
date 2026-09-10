"use client";

import { useRef, useState } from "react";
import { supabase, usingMockSupabase } from "@/utils/supabase";
import { getExternalBrowserUrl, getOAuthCallbackUrl, isXInAppBrowser } from "@/utils/browserDetection";
import { beginActionPerformance } from "@/utils/actionPerformance";
import { clearHomeResumeSnapshot } from "@/app/lib/homeResumePresentation";
import { bindCurrentAcquisitionJourney } from "@/utils/kpiInstrumentation";

export const EXISTING_GOOGLE_LOGIN_INTENT_KEY = "tribe_existing_google_login_intent";

export type OnboardingState = {
  user_id: string;
  is_anonymous: boolean;
  has_profile: boolean;
  tutorial_step: string | null;
  authentication_pending: boolean;
  auth_method: "EMAIL" | "GOOGLE" | null;
  is_legacy_authenticated: boolean;
  identity_integrity_valid: boolean;
  gameplay_authorized: boolean;
};

export function useAuth(
  playCyberSe: (type: string) => void,
  stopCyberBgm: () => void,
  syncBootstrapData: (userId: string) => Promise<void>,
  navigateTab: (tabName: string) => void,
  checkIfSetupRequired: (userId: string) => Promise<void>,
  setConfirmDialogConfig: React.Dispatch<React.SetStateAction<import("@/app/components/ui/ConfirmDialog").ConfirmDialogConfig | null>>,
  showTitleAfterLogout: () => void
) {
  const [session, setSession] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState<boolean>(true);
  const [isSetupRequired, setIsSetupRequired] = useState<boolean>(false);
  const [onboardingState, setOnboardingState] = useState<OnboardingState | null>(null);
  const [setupUsername, setSetupUsername] = useState<string>("");
  const [setupCharacterId, setSetupCharacterId] = useState<string>("char_reiji_01");
  const [setupAreaId, setSetupAreaId] = useState<string>("shinjuku");
  const [setupGiftCode, setSetupGiftCode] = useState<string>("");
  const [giftCode, setGiftCode] = useState<string | null>(null);
  const [setupLoading, setSetupLoading] = useState<boolean>(false);
  const authActionRef = useRef(false);
  const initializeRequestOwnerRef = useRef(0);
  const beginAuthAction = () => {
    if (authActionRef.current) return false;
    authActionRef.current = true;
    setSetupLoading(true);
    return true;
  };
  const endAuthAction = () => {
    authActionRef.current = false;
    setSetupLoading(false);
  };

  // アバターメイキング用セットアップステート
  const [setupGender, setSetupGender] = useState<string>("MALE");
  const [setupHairId, setSetupHairId] = useState<string>("hair_male_spiky");
  const [setupFaceId, setSetupFaceId] = useState<string>("face_male_smirk");

  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [googleExternalBrowserUrl, setGoogleExternalBrowserUrl] = useState<string | null>(null);

  const handleEmailSignup = async () => {
    if (!email.trim() || !password.trim()) {
      setErrorMessage("メールアドレスとパスワードを入力してください。");
      return;
    }
    if (password.length < 6) {
      setErrorMessage("パスワードは最小6文字以上である必要があります。");
      return;
    }
    if (!beginAuthAction()) return;
    try {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) throw error;
      setConfirmDialogConfig({ isOpen: true, title: "サインアップ完了", message: "サインアップに成功しました。確認メールをチェックしてログインしてください。", onConfirm: () => setConfirmDialogConfig(null), onCancel: () => setConfirmDialogConfig(null) });
    } catch (e: any) {
      setErrorMessage(e.message);
    } finally {
      endAuthAction();
    }
  };

  const handleEmailLogin = async () => {
    if (!email.trim() || !password.trim()) {
      setErrorMessage("メールアドレスとパスワードを入力してください。");
      return;
    }
    if (!beginAuthAction()) return;
    try {
      // Keep the explicit title-login intent across the auth-state callback so
      // a verified EMAIL player can enter only after the onboarding authority
      // confirms that this UID owns playable data.
      localStorage.setItem(EXISTING_GOOGLE_LOGIN_INTENT_KEY, JSON.stringify({
        startedAt: Date.now(),
        method: "EMAIL",
        sourceUserId: session?.user?.id || null,
      }));
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    } catch (e: any) {
      localStorage.removeItem(EXISTING_GOOGLE_LOGIN_INTENT_KEY);
      setErrorMessage(e.message);
    } finally {
      endAuthAction();
    }
  };

  const handleGoogleLogin = async () => {
    if (isXInAppBrowser()) {
      setGoogleExternalBrowserUrl(getExternalBrowserUrl());
      setErrorMessage(null);
      return;
    }
    if (!beginAuthAction()) return;
    try {
      // OAuth redirects reload the application. Keep a short-lived marker so
      // an authorized returning player can skip the title after the callback.
      localStorage.setItem(EXISTING_GOOGLE_LOGIN_INTENT_KEY, JSON.stringify({
        startedAt: Date.now(),
        sourceUserId: session?.user?.id || null,
      }));
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: getOAuthCallbackUrl(), queryParams: { prompt: "select_account" } }
      });
      if (error) throw error;
    } catch (e: any) {
      localStorage.removeItem(EXISTING_GOOGLE_LOGIN_INTENT_KEY);
      setErrorMessage(e.message);
      endAuthAction();
    }
  };

  const handleStartNewGame = async (): Promise<boolean> => {
    // Title visitors do not receive an anonymous identity. Any restored
    // session, including an unfinished anonymous one, must use Continue.
    if (session) {
      setErrorMessage("このゲームデータは「続きから」再開してください。");
      return false;
    }
    if (!beginAuthAction()) return false;
    setErrorMessage(null);
    playCyberSe("click");
    try {
      localStorage.removeItem(EXISTING_GOOGLE_LOGIN_INTENT_KEY);
      const { data, error } = await supabase.auth.signInAnonymously();
      if (error || !data.session) throw error || new Error("匿名セッションを作成できませんでした。");
      if (!data.session.user.is_anonymous) {
        await supabase.auth.signOut();
        throw new Error("匿名セッションを確認できませんでした。もう一度お試しください。");
      }
      setSession(data.session);
      await checkIfSetupRequired(data.session.user.id);
      return true;
    } catch (error: any) {
      setErrorMessage(error?.message || "ゲームの開始に失敗しました。");
      return false;
    } finally {
      endAuthAction();
    }
  };

  const handleGoogleDemoLogin = async () => {
    if (!beginAuthAction()) return;
    playCyberSe("click");
    
    try {
      // Production-like environments must use a real Supabase identity. A
      // fabricated browser ID cannot pass RLS or load owned player data.
      if (!usingMockSupabase) {
        const { data, error } = await supabase.auth.signInAnonymously();
        if (error || !data.session) throw error || new Error("Demo session could not be created");
        setSession(data.session);
        await checkIfSetupRequired(data.session.user.id);
        return;
      }

      let demoId = localStorage.getItem("tribe_demo_uuid");
      let isNew = false;
      
      if (!demoId) {
        demoId = "00000000-0000-4000-8000-" + Math.floor(100000000000 + Math.random() * 900000000000).toString();
        localStorage.setItem("tribe_demo_uuid", demoId);
        isNew = true;
      }

      const mockSession = {
        user: {
          id: demoId,
          email: `demo-${demoId.substring(0, 8)}@example.com`
        }
      };

      setSession(mockSession);

      // In the browser QA environment a new demo identity is provisioned by
      // get_user_setup_status. Do not route the reviewer through onboarding.
      if (isNew) {
        await checkIfSetupRequired(demoId);
        return;
      }

      if (isNew) {
        setIsSetupRequired(true);
        setConfirmDialogConfig({ isOpen: true, title: "デモ認証", message: "【Googleデモ認証】 新しいデモセッションを作成しました。「ユーザー登録」画面へ進みます。", onConfirm: () => setConfirmDialogConfig(null), onCancel: () => setConfirmDialogConfig(null) });
      } else {
        await checkIfSetupRequired(demoId);
        setConfirmDialogConfig({ isOpen: true, title: "デモ認証", message: "【Googleデモ認証】 既存のデモアカウントでログインしました。", onConfirm: () => setConfirmDialogConfig(null), onCancel: () => setConfirmDialogConfig(null) });
      }
    } catch (err: any) {
      console.warn("Google demo auth failed:", err.message);
      setErrorMessage("Googleデモ認証の処理中にエラーが発生しました。");
    } finally {
      endAuthAction();
    }
  };

  const handleInitializeUser = async () => {
    setErrorMessage(null);
    if (!setupUsername.trim()) {
      setErrorMessage("ユーザー名を入力してください。");
      return;
    }
    if (Array.from(setupUsername.trim()).length > 8) {
      setErrorMessage("ユーザー名は8文字以内で入力してください。");
      return;
    }
    if (!beginAuthAction()) return;
    const requestOwner = initializeRequestOwnerRef.current + 1;
    initializeRequestOwnerRef.current = requestOwner;
    const ownsRequest = () => initializeRequestOwnerRef.current === requestOwner;
    const actionPerformance = beginActionPerformance("game_initialization");
    try {
      actionPerformance.mark("request_start");
      const { data, error } = await supabase.rpc("initialize_current_player", {
        p_username: setupUsername.trim(),
        p_invite_code: setupGiftCode.trim() || null
      });

      if (!ownsRequest()) return;
      if (error) {
        setErrorMessage(error.code === "23505" || error.message?.includes("already in use")
          ? "このユーザー名は既に使用されています。"
          : error.message);
        return;
      }

      if (data?.status !== "success" && data?.status !== "already_initialized") {
        throw new Error("Unexpected initialization response");
      }
      // Game Start remains initialize_current_player + kpi_subjects.registered_at.
      // Telemetry follows the authoritative success and never rolls gameplay back.
      void bindCurrentAcquisitionJourney(true);
      setErrorMessage(null);
      actionPerformance.mark("response");
      const tutorialStep = typeof data?.tutorial_step === "string" ? data.tutorial_step : "WORLD_INTRO";
      // The successful initialization response is authoritative. Project the
      // next tutorial state atomically so the generic game shell cannot flash
      // between the name screen and the world-introduction overlay.
      setOnboardingState({
        user_id: session.user.id,
        is_anonymous: true,
        has_profile: true,
        tutorial_step: tutorialStep,
        authentication_pending: false,
        auth_method: null,
        is_legacy_authenticated: false,
        identity_integrity_valid: true,
        gameplay_authorized: false,
      });
      setSetupGiftCode("");
      setIsSetupRequired(false);
      void checkIfSetupRequired(session.user.id);
      actionPerformance.mark("state_update");
      actionPerformance.markVisualReady();
    } catch (err: any) {
      console.warn(err);
      if (ownsRequest()) setErrorMessage("初期化に失敗しました。");
    } finally {
      if (ownsRequest()) endAuthAction();
    }
  };

  const handleLogout = async () => {
    setConfirmDialogConfig({
      isOpen: true,
      title: "ログアウト確認",
      message: "本当にログアウトしますか？",
      onConfirm: async () => {
        setConfirmDialogConfig(null);
        stopCyberBgm();
        
        localStorage.removeItem("tribe_demo_uuid");
        localStorage.removeItem(EXISTING_GOOGLE_LOGIN_INTENT_KEY);
        clearHomeResumeSnapshot();
        setSession(null);
        setIsSetupRequired(false);
        setOnboardingState(null);
        showTitleAfterLogout();
        
        try {
          await supabase.auth.signOut();
        } catch (e) {
          console.warn("Signout error:", e);
        }
      },
      onCancel: () => setConfirmDialogConfig(null)
    });
  };

  return {
    session, setSession,
    authLoading, setAuthLoading,
    isSetupRequired, setIsSetupRequired,
    onboardingState, setOnboardingState,
    setupUsername, setSetupUsername,
    setupCharacterId, setSetupCharacterId,
    setupAreaId, setSetupAreaId,
    setupGiftCode, setSetupGiftCode,
    giftCode, setGiftCode,
    setupLoading, setSetupLoading,
    setupGender, setSetupGender,
    setupHairId, setSetupHairId,
    setupFaceId, setSetupFaceId,
    email, setEmail,
    password, setPassword,
    errorMessage, setErrorMessage,
    googleExternalBrowserUrl,
    dismissGoogleExternalBrowserPrompt: () => setGoogleExternalBrowserUrl(null),
    handleEmailSignup,
    handleEmailLogin,
    handleGoogleLogin,
    handleStartNewGame,
    handleGoogleDemoLogin,
    handleInitializeUser,
    handleLogout
  };
}
