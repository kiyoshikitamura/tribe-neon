'use client';
import React, { useMemo, useState } from 'react';
import { GameContext } from '@/app/context/GameContext';
import HubPage from '@/app/components/ui/HubPage';
import RaidTop from '@/app/components/raid/RaidTop';
import CanonicalDialog from '@/app/components/ui/CanonicalDialog';
import OutlawButton from '@/app/components/ui/OutlawButton';
import { createTopFixture, TOP_SCENARIOS, type TopScenario } from './topFixture';
import '@/app/components/RaidTab.css';
import './RaidTopHarness.css';
export default function RaidTopHarness() {
  const [scenario, setScenario] = useState<TopScenario>('multiple');
  const [offset, setOffset] = useState(0);
  const [destination, setDestination] = useState<string | null>(null);
  const [event, setEvent] = useState('');
  const [fixtureNow] = useState(() => Date.now());
  const data = useMemo(() => createTopFixture(scenario, fixtureNow, offset), [scenario, offset, fixtureNow]);
  const context = useMemo(() => ({ playCyberSe: () => undefined }), []);
  return <GameContext.Provider value={context}><main className="raid-top-qa">
    <div className="raid-top-qa-tools"><label>Mockシナリオ<select aria-label="Mockシナリオ" value={scenario} onChange={e => setScenario(e.target.value as TopScenario)}>{TOP_SCENARIOS.map(key => <option key={key}>{key}</option>)}</select></label>
    <label>素材エリア<select aria-label="素材エリア" value={offset} onChange={e => setOffset(Number(e.target.value))}>{[0,1,2,3,4,5,6].map(i => <option key={i} value={i}>{i + 1}</option>)}</select></label><small>Mock専用・実戦闘なし</small></div>
    <div className="raid-top-qa-product"><HubPage title="レイド" hideVisualHeader className="raid-view"><div data-testid="top-product"><RaidTop data={data} onOpenRoom={(roomId, rescueId) => { const target = JSON.stringify({ roomId, rescueId }); setEvent(target); setDestination(target); }} onChooseEnemy={enemy => { setEvent(`choose:${enemy.variantId}`); setDestination(`敵選択・確認への受け渡し: ${enemy.bossName}`); }} onBrowse={() => { setEvent('browse'); setDestination('開催中一覧への受け渡し'); }} onRefresh={() => { setScenario('single'); setEvent('refresh'); }} /></div></HubPage></div>
    <output data-testid="last-navigation" className="raid-top-qa-output">{event}</output>
    <footer className="raid-top-qa-footer"><OutlawButton onClick={() => { setScenario('returned'); setDestination(null); }}>戦闘帰還Mock</OutlawButton></footer>
    {destination && <CanonicalDialog title="導線確認（Mock）" onClose={() => setDestination(null)} actions={[{ label: '戻る', onClick: () => setDestination(null) }]}><p>{destination}</p></CanonicalDialog>}
  </main></GameContext.Provider>;
}
