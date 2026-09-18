"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/utils/supabase";
import { useGame } from "../../context/GameContext";

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function millisecondsUntilNextJstDay() {
  const now = Date.now();
  const jstNow = now + JST_OFFSET_MS;
  const nextJstMidnightUtc = (Math.floor(jstNow / DAY_MS) + 1) * DAY_MS - JST_OFFSET_MS;
  return Math.max(1000, nextJstMidnightUtc - now + 1000);
}

export default function AccountAuthenticationStatus() {
  const {
    session,
    onboardingState,
    setShowAuthenticationReminder,
    playCyberSe,
  } = useGame();
  const [badgeVisible, setBadgeVisible] = useState(false);

  const isPendingAnonymousSession = session?.user?.is_anonymous === true
    && onboardingState?.user_id === session.user.id
    && onboardingState?.is_anonymous
    && onboardingState?.authentication_pending
    && onboardingState?.gameplay_authorized;

  const refreshBadge = useCallback(async () => {
    if (!isPendingAnonymousSession) {
      setBadgeVisible(false);
      return;
    }
    const { data, error } = await supabase.rpc("get_account_authentication_badge_state");
    if (!error) setBadgeVisible(data?.visible === true);
  }, [isPendingAnonymousSession]);

  useEffect(() => {
    void refreshBadge();
    if (!isPendingAnonymousSession) return;

    let timer = window.setTimeout(() => void refreshBadge(), millisecondsUntilNextJstDay());
    const onVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;
      window.clearTimeout(timer);
      void refreshBadge();
      timer = window.setTimeout(() => void refreshBadge(), millisecondsUntilNextJstDay());
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [isPendingAnonymousSession, refreshBadge]);

  if (!isPendingAnonymousSession) return null;

  const openAuthenticationPromotion = async () => {
    playCyberSe("click");
    const { error } = await supabase.rpc("mark_account_authentication_badge_viewed");
    if (!error) setBadgeVisible(false);
    setShowAuthenticationReminder(true);
  };

  return (
    <button
      type="button"
      className="mypage-authentication-status active-scale-effect"
      onClick={() => void openAuthenticationPromotion()}
      aria-label="未認証：アカウント認証を開く"
    >
      <span className="mypage-authentication-lock" aria-hidden="true"><i /><b /></span>
      <small>未認証</small>
      {badgeVisible && <span className="small-badge-alert" aria-label="本日の未確認特典">1</span>}
    </button>
  );
}
