'use client';
import { useState } from 'react';
import { GameContext } from '@/app/context/GameContext';
import QuestProgressionGuide from '@/app/components/quest/QuestProgressionGuide';
import GachaTab from '@/app/components/GachaTab';
import PageShell from '@/app/components/ui/PageShell';
import type { QuestGuideStep } from '@/domain/quest/progressionGuide';

// Presentation-only state. No game account or gameplay mutations.
export default function QuestGuideHarness() {
  const [step, setStep] = useState<QuestGuideStep>('GACHA');
  const [tab, setTab] = useState('gacha');
  const [category, setCategory] = useState<'SKILL' | 'EQUIPMENT' | null>(null);
  const [flags, setFlags] = useState({ CHARACTER: false, SKILL: true, EQUIPMENT: true });
  const [applied, setApplied] = useState(false);
  const game = {
    session: { user: { id: 'presentation-only' } }, activeTab: tab, navigateTab: setTab,
    questGuide: { step, seen_story_towns: [] }, onboardingState: { gameplay_authorized: true, tutorial_step: 'COMPLETE' },
    playSe: () => {}, playCyberSe: () => {}, setGlobalInteractionBlocking: () => {}, setErrorMessage: () => {},
    guideGachaCategory: category, setGuideGachaCategory: setCategory,
    dailyFreeGachaReady: true, dailyFreeGachaFlags: flags, refreshDailyFreeGachaAuthority: async () => true,
    gachaRarityRates: [], userItems: [], cash: 0, diamonds: 0, upgradeLoading: false,
    gachaMasters: ['CHAR','SKILL','EQUIP'].map(prefix => ({ id: `${prefix}_NORMAL`, cost_cash: 1000 })),
    handleScout: async (id: string) => {
      const next = id.startsWith('SKILL') ? 'SKILL' : 'EQUIPMENT';
      setFlags(current => ({ ...current, [next]: false }));
      setCategory(next === 'SKILL' ? 'EQUIPMENT' : null);
    },
    syncBootstrapData: async () => {},
    advanceQuestGuide: async (action: string) => {
      if (action === 'OPEN_LOADOUT') setStep('LOADOUT');
      if (action === 'APPLY_LOADOUT') { setApplied(true); setStep('RETRY'); }
      if (action === 'RETURN_QUEST') setStep('DONE');
      return true;
    },
  };
  return <GameContext.Provider value={game as any}>
    <div style={{ width: 390, maxWidth: '100%', height: 650, margin: 'auto' }}>
      <PageShell header={<div style={{height: 72}}>クエストガイド表示検証</div>} footer={<div style={{height: 60}}>フッター</div>} overlays={<QuestProgressionGuide />}>
        {tab === 'gacha' ? <GachaTab /> : <p>{tab === 'character' ? 'キャラ画面' : '街一覧'}{applied ? '／装備・スキル装着済み' : ''}</p>}
      </PageShell>
    </div>
  </GameContext.Provider>;
}
