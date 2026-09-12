"use client";
import "./BeginnerMissionRewardCta.css";
import { beginnerRewardIds } from '@/domain/mission/beginnerJourney';
import { useGame } from '../../context/GameContext';

/** 演出・結果を閉じた元ページに受取入口を置く。自動遷移は行わない。 */
export default function BeginnerMissionRewardCta() {
  const { beginnerJourney, activeTab, openBeginnerMissionReward, battleState,
    scoutAnimationState, showMissionPanel, confirmDialogConfig, globalInteractionBlocking,
    showPatrolRewardModal, onboardingState } = useGame();
  if (!onboardingState?.gameplay_authorized || activeTab === 'home' || battleState || scoutAnimationState
    || showMissionPanel || confirmDialogConfig || globalInteractionBlocking || showPatrolRewardModal) return null;
  const ids = beginnerRewardIds(beginnerJourney, activeTab);
  if (!ids.length) return null;
  return <button className="beginner-mission-reward-cta semantic-cta semantic-cta--primary"
    onClick={() => openBeginnerMissionReward(ids)}>ミッション報酬を受け取る</button>;
}
