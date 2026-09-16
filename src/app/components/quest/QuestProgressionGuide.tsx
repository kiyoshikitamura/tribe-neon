'use client';
import { useEffect, useState } from 'react';
import { useGame } from '@/app/context/GameContext';
import type { QuestGuideAction, QuestProgressionGuide as GuideState } from '@/domain/quest/progressionGuide';
import CanonicalDialog from '../ui/CanonicalDialog';
import TutorialNavigator from '../TutorialNavigator';
import OutlawButton from '../ui/OutlawButton';
import './QuestProgressionGuide.css';

export default function QuestProgressionGuide() {
  const game = useGame() as any;
  const guide = game.questGuide as GuideState | null;
  const [pending, setPending] = useState(false);
  const canGuide = Boolean(game.onboardingState?.gameplay_authorized && !game.battleState && !game.scoutAnimationState);
  useEffect(() => {
    if (canGuide && guide?.step === 'GACHA') game.navigateTab('gacha');
  }, [guide?.step, canGuide]);
  if (!guide || game.battleState || game.scoutAnimationState || !game.onboardingState?.gameplay_authorized) return null;
  const act = async (action: QuestGuideAction, tab: string) => {
    if (pending) return;
    setPending(true);
    game.setGlobalInteractionBlocking(true);
    try {
      if (!await game.advanceQuestGuide(action)) return;
      if (action === 'APPLY_LOADOUT') await game.syncBootstrapData(game.session.user.id);
      game.navigateTab(tab);
    } catch { game.setErrorMessage('案内を更新できませんでした。もう一度お試しください。'); }
    finally { setPending(false); game.setGlobalInteractionBlocking(false); }
  };
  if (guide.step === 'QUEST_ENTRY') return <CanonicalDialog title="まずはクエストを進めよう" actions={[{label:'クエストへ',semantic:'primary',disabled:pending,onClick:()=>act('ENTER_QUEST','patrol')}]}><TutorialNavigator message="街を探索して、ボスに挑戦しましょう。" /></CanonicalDialog>;
  if (guide.step === 'PLAY' || guide.step === 'DONE') return null;
  if (guide.step === 'GACHA') return <aside className="quest-progression-guide" aria-label="初敗北ガイド"><TutorialNavigator message="装備とスキルを強化しよう" />{game.activeTab !== 'gacha' ? <OutlawButton variant="primary" onClick={()=>game.navigateTab('gacha')}>ガチャへ</OutlawButton> : <><p>無料ガチャも確認できます。購入せずに、持っている装備とスキルで進められます。</p><OutlawButton variant="primary" disabled={pending} onClick={()=>void act('OPEN_LOADOUT','character')}>キャラへ・装備を整える</OutlawButton></>}</aside>;
  if (guide.step === 'LOADOUT') return <aside className="quest-progression-guide" aria-label="おまかせ装備ガイド"><TutorialNavigator message="出撃する5人に、今持っている装備とスキルをおまかせ装着しましょう。" /><OutlawButton variant="primary" disabled={pending} onClick={()=> game.activeTab !== 'character' ? game.navigateTab('character') : void act('APPLY_LOADOUT','character')}>{game.activeTab !== 'character' ? 'キャラへ' : '5人におまかせ装備'}</OutlawButton></aside>;
  return <aside className="quest-progression-guide" aria-label="再挑戦ガイド"><TutorialNavigator message="再度クエストに挑戦しよう" /><OutlawButton variant="primary" disabled={pending} onClick={()=>void act('RETURN_QUEST','patrol')}>クエストに戻る</OutlawButton></aside>;
}
