"use client";
import { useEffect, useRef } from 'react';
import { canPromptBeginnerReward } from '@/domain/mission/beginnerRewardPrompt';
import { beginnerRewardIds } from '@/domain/mission/beginnerJourney';
import { useGame } from '../../context/GameContext';
import { hasPresentedDialog, usePresentedDialog } from '../ui/dialogPresence';

/** 体験の終了後に報酬を案内。演出途中・他ダイアログ表示中は待つ。 */
export default function BeginnerMissionRewardCta() {
  const { beginnerJourney, activeTab, openBeginnerMissionReward, battleState,
    scoutAnimationState, showMissionPanel, confirmDialogConfig, globalInteractionBlocking,
    showPatrolRewardModal, onboardingState, setConfirmDialogConfig, session,
    showLoginBonusModal, showAccountAuthenticationModal } = useGame();
  const presentedDialog = usePresentedDialog();
  const announced = useRef(new Set<string>());
  const owner = session?.user?.id;
  const ids = beginnerRewardIds(beginnerJourney, activeTab);
  const key = `${owner}:${activeTab}:${ids.join(',')}`;
  const experienceComplete = canPromptBeginnerReward(beginnerJourney, activeTab);
  useEffect(() => {
    if (!owner || !onboardingState?.gameplay_authorized || (activeTab === 'home' || activeTab === 'character' || activeTab === 'ranking') || battleState || scoutAnimationState
      || showMissionPanel || confirmDialogConfig || globalInteractionBlocking || showPatrolRewardModal
      || showLoginBonusModal || showAccountAuthenticationModal || presentedDialog || hasPresentedDialog()
      || !experienceComplete || !ids.length || announced.current.has(key)) return;
    announced.current.add(key);
    setConfirmDialogConfig({
      isOpen: true,
      title: 'ミッション達成',
      message: 'ミッション報酬を受け取れます。',
      confirmText: '報酬を受け取る',
      confirmPendingText: 'ミッションを開いています…',
      cancelText: 'あとで',
      presentation: 'canonical',
      onCancel: () => setConfirmDialogConfig(null),
      onConfirm: async () => {
        // open keeps this modal until the target Mission has committed.
        // Failure leaves this same dialog available for retry.
        if (!await openBeginnerMissionReward(ids)) throw new Error("ミッションを開けませんでした。もう一度お試しください。");
      },
    });
  }, [owner, onboardingState?.gameplay_authorized, activeTab, battleState, scoutAnimationState,
    showMissionPanel, confirmDialogConfig, globalInteractionBlocking, showPatrolRewardModal,
    showLoginBonusModal, showAccountAuthenticationModal, presentedDialog, experienceComplete, ids, key,
    openBeginnerMissionReward, setConfirmDialogConfig]);
  return null;
}
