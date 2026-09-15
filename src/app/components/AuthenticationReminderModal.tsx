"use client";

import { useGame } from "../context/GameContext";
import CanonicalDialog from "./ui/CanonicalDialog";

export default function AuthenticationReminderModal() {
  const {
    session,
    onboardingState,
    showAuthenticationReminder,
    setShowAuthenticationReminder,
    setShowAccountAuthenticationModal,
    playCyberSe,
  } = useGame();

  const isPendingAnonymousSession = session?.user?.is_anonymous === true
    && onboardingState?.user_id === session.user.id
    && onboardingState?.is_anonymous
    && onboardingState?.authentication_pending
    && onboardingState?.gameplay_authorized;

  if (!showAuthenticationReminder || !isPendingAnonymousSession) return null;

  const close = () => {
    playCyberSe("click");
    setShowAuthenticationReminder(false);
  };
  const authenticateNow = () => {
    playCyberSe("click");
    setShowAuthenticationReminder(false);
    setShowAccountAuthenticationModal(true);
  };

  return <CanonicalDialog
    title="ゲームデータを保護"
    ariaLabel="アカウント認証のご案内"
    actions={[
      { label: "閉じる", semantic: "secondary", onClick: close },
      { label: "今すぐ認証", semantic: "primary", onClick: authenticateNow },
    ]}
  >
    アカウント認証をすると、ゲームデータを安全に保護し、別の端末へ引き継げます。
  </CanonicalDialog>;
}
