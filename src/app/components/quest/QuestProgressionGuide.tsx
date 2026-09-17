'use client';
import { useEffect, useRef, useState } from 'react';
import { useGame } from '@/app/context/GameContext';
import type { QuestGuideAction, QuestProgressionGuide as GuideState } from '@/domain/quest/progressionGuide';
import GuideDialog from '../ui/GuideDialog';

export default function QuestProgressionGuide() {
  const game = useGame() as any;
  const guide = game.questGuide as GuideState | null;
  const [pending, setPending] = useState(false);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const navigatedGacha = useRef<string | null>(null);
  const owner = game.session?.user?.id;
  const category = game.dailyFreeGachaFlags?.SKILL ? 'SKILL'
    : game.dailyFreeGachaFlags?.EQUIPMENT ? 'EQUIPMENT' : null;
  const canGuide = Boolean(game.onboardingState?.gameplay_authorized && !game.battleState && !game.scoutAnimationState);
  const blocked = !canGuide || Boolean(game.showPatrolRewardModal || game.confirmDialogConfig
    || game.showMissionPanel || (game.activeTab === 'home' && game.showLoginBonusModal) || game.showAccountAuthenticationModal
    || (!pending && game.globalInteractionBlocking));
  useEffect(() => {
    if (!canGuide || guide?.step !== 'GACHA') return;
    const visit = `${owner}:GACHA`;
    if (navigatedGacha.current !== visit) {
      navigatedGacha.current = visit;
      game.navigateTab('gacha');
    }
    if (game.dailyFreeGachaReady && game.guideGachaCategory !== category) game.setGuideGachaCategory(category);
  }, [owner, guide?.step, canGuide, game.dailyFreeGachaReady, category, game.guideGachaCategory]);
  useEffect(() => {
    // Returning to the guided page is an explicit chance to reopen a dismissed
    // prompt; closing it while staying on that page never opens it again.
    if ((guide?.step === 'GACHA' && game.activeTab === 'gacha')
      || (guide?.step === 'LOADOUT' && game.activeTab === 'character')) setDismissed(null);
  }, [game.activeTab, guide?.step]);
  if (!guide || !game.onboardingState?.gameplay_authorized) return null;
  const act = async (action: QuestGuideAction, tab: string) => {
    if (pending) return;
    setPending(true);
    game.setGlobalInteractionBlocking(true);
    try {
      if (!await game.advanceQuestGuide(action)) return;
      if (action === 'APPLY_LOADOUT') await game.syncBootstrapData(game.session.user.id);
      if (action === 'OPEN_LOADOUT') game.setGuideGachaCategory(null);
      game.navigateTab(tab);
    } catch { game.setErrorMessage('案内を更新できませんでした。もう一度お試しください。'); }
    finally { setPending(false); game.setGlobalInteractionBlocking(false); }
  };
  const key = `${owner}:${guide.step}:${guide.step === 'GACHA' ? category : ''}`;
  const close = () => setDismissed(key);
  if (guide.step === 'PLAY' || guide.step === 'DONE' || dismissed === key) return null;
  if (guide.step === 'QUEST_ENTRY') return <GuideDialog key={key} blocked={blocked} title="まずはクエストを進めよう" message="街を探索して、ボスに挑戦しましょう。" actions={[{label:'クエストへ',semantic:'primary',disabled:pending,onClick:()=>act('ENTER_QUEST','patrol')}]} />;
  if (guide.step === 'GACHA') {
    if (!game.dailyFreeGachaReady || game.activeTab !== 'gacha') return null;
    const label = category === 'SKILL' ? 'スキル' : '装備';
    return <GuideDialog key={key} blocked={blocked} title="初心者ガイド" onClose={close}
      message={category ? `${label}の無料10連を引こう。獲得した装備とスキルで戦力を整えましょう。` : '出撃する5人の装備とスキルを整えましょう。'}
      actions={category ? [
        {label:`${label}ガチャへ`,semantic:'primary',onClick:()=>{game.setGuideGachaCategory(category);game.navigateTab('gacha');close();}},
      ] : [{label:'キャラへ',semantic:'primary',disabled:pending,onClick:()=>act('OPEN_LOADOUT','character')}]}
    />;
  }
  if (guide.step === 'LOADOUT' && game.activeTab !== 'character') return null;
  if (guide.step === 'LOADOUT') return <GuideDialog key={key} blocked={blocked} title="初心者ガイド" onClose={close}
    message="出撃する5人に、今持っている装備とスキルをまとめておまかせ装着しましょう。"
    actions={[{label:'5人におまかせ装備・スキル',semantic:'primary',disabled:pending,onClick:()=>act('APPLY_LOADOUT','character')}]} />;
  return <GuideDialog key={key} blocked={blocked} title="初心者ガイド" onClose={close} message="再度クエストに挑戦しよう。追加AP・待ち時間なしで再挑戦できます。"
    actions={[{label:'クエストに戻る',semantic:'primary',disabled:pending,onClick:()=>act('RETURN_QUEST','patrol')}]} />;
}
