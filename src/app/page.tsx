"use client";

import React from "react";
import dynamic from "next/dynamic";
import { useAssetTierPreloader } from "./hooks/useImagePreloader";
import { BOOT_CRITICAL_ASSETS, DEFERRED_ASSETS, TUTORIAL_CRITICAL_ASSETS, TUTORIAL_STEP_ASSET_MANIFESTS } from "./lib/screenManifests";
import { GameProvider, useGame } from "./context/GameContext";
import { AudioProvider, useAudio } from "@/audio/AudioProvider";
import AuthView from "./components/AuthView";
import SetupView from "./components/SetupView";
import Header from "./components/Header";
import Footer from "./components/Footer";
import HomeTab from "./components/HomeTab";
const TabLoading = () => <div className="app-loading-screen app-loading-screen--transition"><BrandedLoading label="画面を準備中" /></div>;
const PatrolTab = dynamic(() => import("./components/PatrolTab"), { loading: TabLoading });
const PvpTab = dynamic(() => import("./components/PvpTab"), { loading: TabLoading });
const RaidTab = dynamic(() => import("./components/RaidTab"), { loading: TabLoading });
const GachaTab = dynamic(() => import("./components/GachaTab"), { loading: TabLoading });
const GuildTab = dynamic(() => import("./components/GuildTab"), { loading: TabLoading });
const CharacterTab = dynamic(() => import("./components/CharacterTab"), { loading: TabLoading });
const MenuTab = dynamic(() => import("./components/MenuTab"), { loading: TabLoading });
const RankingTab = dynamic(() => import("./components/RankingTab"), { loading: TabLoading });
const AvatarTab = dynamic(() => import("./components/AvatarTab"), { loading: TabLoading });
const BbsTab = dynamic(() => import("./components/BbsTab"), { loading: TabLoading });
const AdvView = dynamic(() => import("./components/AdvView"));
const BagTab = dynamic(() => import("./components/BagTab"), { loading: TabLoading });
const CardBattleView = dynamic(() => import("./components/CardBattleView"));
import CommonModals from "./components/CommonModals";
import TribeChatModal from "./components/TribeChatModal";
import InboxPanel from "./components/InboxPanel";
import MissionPanel from "./components/MissionPanel";
import SettingsPanel from "./components/SettingsPanel";
import LegalPanel from "./components/LegalPanel";
import ConfirmDialog from "./components/ui/ConfirmDialog";
import GlobalInteractionBlocker from "./components/ui/GlobalInteractionBlocker";
import PageShell from "./components/ui/PageShell";
import TitleView from "./components/TitleView";
import TitleLegalFooter from "./components/TitleLegalFooter";
import MoveBaseModal from "./components/MoveBaseModal";
import AccountAuthenticationModal from "./components/TutorialAuthentication";
import AuthenticationReminderModal from "./components/AuthenticationReminderModal";
import BrandedLoading from "./components/ui/BrandedLoading";
import CanonicalDialog from "./components/ui/CanonicalDialog";
import HomeResumeShell from "./components/HomeResumeShell";
import { LoginBonusModal } from "./components/LoginBonusModal";
import RankingRewardNotificationController from "./components/ranking/RankingRewardNotificationController";
import PrepMissionEventDialogController from "./components/mission/PrepMissionEventDialogController";
import { markHomeReloadStage, readHomeResumeSnapshot } from "./lib/homeResumePresentation";
import { initializeAcquisitionAttribution } from "@/utils/acquisitionAttribution";

function AppContent() {
  const { session, authLoading, authenticatedProjectionReady, authenticatedProjectionError, retryAuthenticatedProjection, isSetupRequired, onboardingState, activeTab, showTitleView, battleState,
    handleLogout,
    confirmDialogConfig,
    globalInteractionBlocking,
    maintenanceEnabled,
    loginBonusMasters,
    userLoginBonus,
    showLoginBonusModal,
    setShowLoginBonusModal,
    loginBonusClaimResult,
    setShowInboxPanel,
    setInboxPanelTab,
  } = useGame();
  const [homeResumeSnapshot, setHomeResumeSnapshot] = React.useState<ReturnType<typeof readHomeResumeSnapshot>>(null);
  React.useEffect(() => {
    void initializeAcquisitionAttribution();
  }, []);
  React.useLayoutEffect(() => {
    markHomeReloadStage("reload", 0);
    const snapshot = readHomeResumeSnapshot();
    queueMicrotask(() => setHomeResumeSnapshot(snapshot));
  }, []);
  const { playBgm } = useAudio();
  const tutorialStep = onboardingState?.tutorial_step;
  const isMandatoryTutorial = Boolean(tutorialStep && !onboardingState?.gameplay_authorized);

  React.useLayoutEffect(() => {
    const resetCanvasOrigin = () => {
      window.scrollTo({ left: 0, top: 0 });
      document.documentElement.scrollLeft = 0;
      document.body.scrollLeft = 0;
      document.querySelector<HTMLElement>(".main-content")?.scrollTo({ left: 0, top: 0 });
    };
    resetCanvasOrigin();
    const frame = window.requestAnimationFrame(resetCanvasOrigin);
    return () => window.cancelAnimationFrame(frame);
  }, [activeTab]);
  const bootAssets = useAssetTierPreloader(BOOT_CRITICAL_ASSETS, "BOOT_CRITICAL");
  const ownedHomeResumeSnapshot = homeResumeSnapshot?.userId === session?.user?.id
    ? homeResumeSnapshot
    : null;
  useAssetTierPreloader(TUTORIAL_CRITICAL_ASSETS, "TUTORIAL_CRITICAL", bootAssets.ready);
  const currentTutorialAssets = TUTORIAL_STEP_ASSET_MANIFESTS[tutorialStep || ""] || [];
  const tutorialScreenAssets = useAssetTierPreloader(
    currentTutorialAssets,
    "TUTORIAL_CRITICAL",
    bootAssets.ready && isMandatoryTutorial && currentTutorialAssets.length > 0,
  );
  useAssetTierPreloader(
    DEFERRED_ASSETS,
    "DEFERRED",
    bootAssets.ready && !showTitleView && Boolean(onboardingState?.gameplay_authorized),
  );

  React.useEffect(() => {
    if (showTitleView) playBgm("TITLE");
    else if (battleState) playBgm("BATTLE");
    else if (activeTab === "patrol" || activeTab === "quest") playBgm("QUEST");
    else if (activeTab === "raid") playBgm("RAID");
    else if (activeTab === "pvp") playBgm("PVP");
    else if (activeTab === "guild") playBgm("GUILD");
    else playBgm("HOME");
  }, [activeTab, battleState, playBgm, showTitleView]);



  if (!bootAssets.ready) {
    if (ownedHomeResumeSnapshot && !(bootAssets.settled && bootAssets.requiredFailed)) {
      return <HomeResumeShell snapshot={ownedHomeResumeSnapshot} />;
    }
    return (
      <div className="app-container">
        <div className="app-loading-screen app-loading-screen--boot" role="status" aria-live="polite">
          {bootAssets.settled && bootAssets.requiredFailed ? (
            <>
              <strong>起動に必要なデータを読み込めませんでした</strong>
              <button className="semantic-cta semantic-cta--primary" onClick={() => window.location.reload()}>再読み込み</button>
            </>
          ) : (
            <BrandedLoading label="起動中" />
          )}
        </div>
        <TitleLegalFooter boot />
      </div>
    );
  }

  if (authLoading && ownedHomeResumeSnapshot) {
    return <HomeResumeShell snapshot={ownedHomeResumeSnapshot} />;
  }

  if (isMandatoryTutorial && currentTutorialAssets.length > 0 && !tutorialScreenAssets.ready) {
    return (
      <div className="app-container">
        <div className="app-loading-screen app-loading-screen--boot" role="status" aria-live="polite">
          {tutorialScreenAssets.settled && tutorialScreenAssets.requiredFailed ? <>
            <strong>画面に必要な画像を読み込めませんでした</strong>
            <button className="semantic-cta semantic-cta--primary" onClick={() => window.location.reload()}>再読み込み</button>
          </> : <BrandedLoading label="画面を準備中" />}
        </div>
      </div>
    );
  }

  // 1. タイトル画面 (一番最初に表示)
  if (showTitleView) {
    return (
      <div className="app-container">
        <TitleView />
      </div>
    );
  }

  // 2. ログイン認証待ちローディング (アプリ枠 .app-container は変化させず、内部に完全保護スクリーンを配置)
  if (authLoading) {
    return (
      <div className="app-container">
        <div className="app-loading-screen app-loading-screen--boot"><BrandedLoading label="認証状態を確認中" /></div>
      </div>
    );
  }

  // 2. 未ログイン認証画面
  if (!session) {
    return (
      <div className="app-container">
        <AuthView />
      </div>
    );
  }

  // Never expose a profile, wallet, Guild, Gacha entitlement, or identity
  // projection until both auth.uid() and public.users.id belong to this session.
  if (!authenticatedProjectionReady && !isSetupRequired) {
    return (
      <div className="app-container">
        {authenticatedProjectionError ? (
          <CanonicalDialog
            title="エラー"
            actions={[{ label: "再試行", semantic: "primary", onClick: () => void retryAuthenticatedProjection() }]}
          >
            {authenticatedProjectionError}
          </CanonicalDialog>
        ) : (
          <div className="app-loading-screen app-loading-screen--boot"><BrandedLoading label="プレイヤーデータを確認中" /></div>
        )}
      </div>
    );
  }

  if (maintenanceEnabled) {
    return (
      <div className="app-container">
        <div className="app-loading-screen app-loading-screen--boot" role="status" aria-live="polite">
          <strong>メンテナンス中</strong>
          <span>現在メンテナンス中です。しばらくしてからもう一度お試しください。</span>
          <button className="semantic-cta semantic-cta--secondary" onClick={() => window.location.reload()}>再読み込み</button>
        </div>
      </div>
    );
  }

  // 3. 組織設立・初期セットアップ画面
  if (isSetupRequired) {
    return (
      <div className="app-container">
        <SetupView />
      </div>
    );
  }

  if (onboardingState?.tutorial_step === "AUTHENTICATION" && onboardingState.identity_integrity_valid === false) {
    return (
      <div className="app-container">
        <div className="modal-overlay background-black-95">
          <div className="modal-card border-cyan-glow" style={{ maxWidth: 460 }}>
            <div className="font-size-8 text-color-red font-weight-bold mb-2">アカウント認証エラー</div>
            <div className="modal-desc text-left mb-3">
              認証方式の整合性を確認できないため、ゲームデータへのアクセスを停止しました。メールまたはGoogleのどちらか1方式だけを使用してください。
            </div>
            <button className="claim-reward-btn font-weight-bold py-2 width-100" onClick={() => void handleLogout()}>
              ログアウトして戻る
            </button>
            <ConfirmDialog {...confirmDialogConfig} />
          </div>
        </div>
      </div>
    );
  }

  // 4. メインゲーム画面 (全13タブ共通フレーム)
  return (
    <div className="app-container">
      <PageShell
        header={isMandatoryTutorial || Boolean(battleState) ? null : <Header />}
        footer={isMandatoryTutorial || Boolean(battleState) ? null : <Footer />}
        overlays={(
          <>
            {/* Layer 3: コンパクトモーダル */}
            <CommonModals />
            <MoveBaseModal />
            {showLoginBonusModal && <LoginBonusModal
              masters={loginBonusMasters}
              currentStep={userLoginBonus?.current_step || loginBonusClaimResult?.current_step || 1}
              claimResult={loginBonusClaimResult}
              onClose={() => setShowLoginBonusModal(false)}
              onOpenPresents={() => { setShowInboxPanel(true); setInboxPanelTab("presents"); }}
            />}

            {/* Layer 4: フルスクリーンパネル */}
            <TribeChatModal />
            <InboxPanel />
            <MissionPanel />
            <SettingsPanel />
            <LegalPanel />

            {/* Layer 5: システムオーバーレイ */}
            <AdvView />
            <CardBattleView />
            <AuthenticationReminderModal />
            <AccountAuthenticationModal />

            {/* Layer 6: 最上位の共通ダイアログとブロッカー */}
            <PrepMissionEventDialogController />
            <RankingRewardNotificationController />
            <ConfirmDialog {...confirmDialogConfig} />
            <GlobalInteractionBlocker isBlocking={globalInteractionBlocking} />
          </>
        )}
      >
        {activeTab === "home" && <HomeTab />}
        {(activeTab === "patrol" || activeTab === "quest") && <PatrolTab />}
        {activeTab === "pvp" && <PvpTab />}
        {activeTab === "raid" && <RaidTab />}
        {activeTab === "gacha" && <GachaTab />}
        {activeTab === "guild" && <GuildTab />}
        {activeTab === "character" && <CharacterTab />}

        {activeTab === "menu" && <MenuTab />}
        {activeTab === "bag" && <BagTab />}
        {activeTab === "ranking" && <RankingTab />}
        {activeTab === "avatar" && <AvatarTab />}
        {activeTab === "bbs" && <BbsTab />}
      </PageShell>
    </div>
  );
}

export default function Home() {
  return (
    <AudioProvider>
      <GameProvider>
        <AppContent />
      </GameProvider>
    </AudioProvider>
  );
}
