'use client';
import React, { useMemo, useState } from 'react';
import {AudioProvider} from '@/audio/AudioProvider';
import Header from '@/app/components/Header';
import BattleResultSummary from '@/app/components/battle/BattleResultSummary';
import {projectRaidResultReceipt} from '@/domain/raidResultPresentation';
import IntegratedPages, {fixtureEnemySkills} from './IntegratedPages';
import {ITEMS_MASTER_DATA} from '@/utils/items_master_data';
import { GameContext } from '@/app/context/GameContext';
import HubPage from '@/app/components/ui/HubPage';
import OutlawButton from '@/app/components/ui/OutlawButton';
import RaidEnemySelection from '@/app/components/raid/RaidEnemySelection';
import RaidRoomListCard from '@/app/components/raid/RaidRoomListCard';
import RaidEnemyRoster from '@/app/components/raid/RaidEnemyRoster';
import RaidRoomRescuePanel from '@/app/components/raid/RaidRoomRescuePanel';
import RaidRescueLink from '@/app/components/raid/RaidRescueLink';
import RaidResultDetails from '@/app/components/raid/RaidResultDetails';
import { RAID_TOP_ENEMIES } from '@/domain/raidTopAssets';
import type { RaidDifficultyId } from '@/domain/raidRoom';
import type { RaidRoomRescueClient } from '@/domain/raidRoomRescue';
import { createDetailFixture, known, success } from '../raid-detail/detailFixture';
import { createTopFixture } from '../raid-top/topFixture';
import '@/app/components/RaidTab.css';
import '@/app/components/HomeTab.css';
import '@/app/components/TribeChatModal.css';
import '../raid-detail/RaidDetailHarness.css';

export default function RaidPagesHarness() {
  const [page, setPage] = useState('selection');
  const [scenario, setScenario] = useState('owner');
  const [now] = useState(() => Date.now());
  const [variant, setVariant] = useState(RAID_TOP_ENEMIES[0].variantId);
  const [difficulty, setDifficulty] = useState<RaidDifficultyId>('beginner');
  const [action, setAction] = useState('');
  const [confirmed, setConfirmed] = useState(0);
  const fixture = useMemo(() => createDetailFixture(scenario === 'owner' || scenario === 'rescue' || scenario === 'cleared' || scenario === 'expired' || scenario === 'long-name' || scenario === 'no-guild' ? scenario : 'member', now), [scenario, now]);
  const entry = useMemo(() => {
    const data = createTopFixture('single', now);
    if (data.rescues.status !== 'ready') throw Error('Mock rescue fixture');
    return { ...data.rescues.data[0], room: fixture.room };
  }, [fixture, now]);
  const rescueId = entry.rescue.status === 'available' ? entry.rescue.value.rescueId : 'qa-rescue';
  const rescueClient = useMemo<RaidRoomRescueClient>(() => {
    let count = 1;
    return {
      getStatus: async () => {
        if (scenario === 'error') throw Error('Mock acquisition failure');
        return { roomId: fixture.room.roomId, isOwner: scenario === 'owner', requestEnabled: !['cleared', 'expired'].includes(scenario), activityCount: count, guildCount: scenario === 'no-guild' ? 0 : count, maxPerChannel: 3, viaRescue: scenario === 'rescue', finalizedBattles: 2, contributionDamage: 125000 };
      },
      request: async (roomId, requestId) => { count++; setAction(`rescue:${requestId}`); return { roomId, requestId, activityCount: count, guildCount: count, maxPerChannel: 3, publications: [] }; },
      getLink: async () => ({roomId:fixture.room.roomId,rescueId,channel:"ACTIVITY",guildId:null}),
      join: async () => ({ roomId: fixture.room.roomId, membershipStatus: "joined", viaRescue:true }),
    };
  }, [fixture, scenario, rescueId]);
  const context = useMemo(() => ({ playCyberSe() {}, openRaidRescue: (id: string) => setAction(`open-rescue:${id}`) }), []);
  const selectedEnemy = RAID_TOP_ENEMIES.find(enemy => enemy.variantId === variant)!;
  return <GameContext.Provider value={context}><main className="raid-detail-qa">
    <header className="raid-detail-qa-tools">
      <label>画面<select aria-label="検証画面" value={page} onChange={event => { setPage(event.target.value); setAction(''); }}>
        {['header', 'selection', 'enemy', 'list', 'rescue', 'result', 'integrated', 'full-result', 'host-activity', 'host-chat'].map(value => <option key={value}>{value}</option>)}
      </select></label>
      <label>状態<select aria-label="Mockシナリオ" value={scenario} onChange={event => { setScenario(event.target.value); setAction(''); }}>
        {['owner', 'member', 'rescue', 'cleared', 'expired', 'error', 'long-name', 'no-guild'].map(value => <option key={value}>{value}</option>)}
      </select></label><small>Mock専用・実戦闘/報酬発行なし</small>
    </header>
    <div className="raid-detail-qa-content"><HubPage title="レイド" hideVisualHeader className="raid-view">
      {page === 'integrated' && <IntegratedPages scenario={scenario} now={now} onAction={setAction}/>}
      {page === 'host-activity' && <div className="mypage-activity-log"><div className="mypage-activity-log-row"><strong>Mock活動ログ</strong><div className="mypage-activity-log-detail"><strong>レイドの救援を求めています</strong><RaidRescueLink rescueId={rescueId} entry={entry} status="success" source="activity"/><time>たった今</time></div></div></div>}
      {page === 'host-chat' && <div className="tribe-modal-messages"><div className="tribe-msg-row other"><div className="tribe-msg-header">Mock Guild投稿</div><div className="tribe-msg-bubble">救援をお願いします<RaidRescueLink rescueId={rescueId} entry={entry} status="success" source="guild_chat"/></div></div></div>}
      {page === 'selection' && <RaidEnemySelection choices={scenario === 'error' ? { status: 'error', data: null, error: 'Mock error' } : success(RAID_TOP_ENEMIES.slice(0, 2).map(enemy => ({ raidVariantId: enemy.variantId, name: enemy.bossName })))} selectedVariantId={variant} difficultyId={difficulty} onSelectVariant={setVariant} onSelectDifficulty={setDifficulty} onConfirm={() => { setConfirmed(value => value + 1); setAction('create-confirmed'); }} onCancel={() => setAction('cancel')} onRetry={() => setAction('retry')} busy={false} skillsByCharacterId={known(fixtureEnemySkills(variant))} rewardPlan={success(fixture.plan)} resolveRewardName={id=>ITEMS_MASTER_DATA.find(item=>item.id===id)?.name} />}
      {page === 'enemy' && <RaidEnemyRoster bossMasterId={variant} raidName={selectedEnemy.bossName} presentation="detail" skillsByCharacterId={known(fixtureEnemySkills(variant))} />}
      {page === 'list' && <>{Array.from({ length: 3 }, (_, index) => <RaidRoomListCard key={index} room={{ ...fixture.room, roomId: `qa-room-${index}` }} now={now} enemy={known(RAID_TOP_ENEMIES[index])} ownerGuild={fixture.display.data?.ownerGuild} membership={fixture.display.data ? known(fixture.display.data.membership) : undefined} onOpen={() => setAction(`room:qa-room-${index}`)} />)}</>}
      {page === 'rescue' && <><RaidRoomRescuePanel key={scenario} client={rescueClient} roomId={fixture.room.roomId} userId={fixture.currentUserId} disabled={scenario === 'cleared' || scenario === 'expired'} setInteractionBlocking={() => {}} /><RaidRescueLink rescueId={rescueId} entry={entry} source="activity" /></>}
      {page === 'header' && <GameContext.Provider value={{username:'表示確認',userLevel:5,userXp:0,cash:9999999,diamonds:9999999,vitality:100,raidPoints:scenario==='cleared'?0:scenario==='member'?2:5,totalPower:9999999,identityLeaderAuthorityReady:true} as any}><Header /></GameContext.Provider>}
      {page === 'full-result' && <AudioProvider><BattleResultSummary victory={scenario!=='member' && scenario!=='cleared'} presentationContext={{mode:'RAID',raidRoomId:fixture.room.roomId,opponentLabel:RAID_TOP_ENEMIES[0].bossName,backgroundPath:RAID_TOP_ENEMIES[0].backgroundUrl}} playerParticipants={[{id:'p1',characterId:RAID_TOP_ENEMIES[0].roster[0].id,name:RAID_TOP_ENEMIES[0].roster[0].name}]} enemyParticipants={[{id:'enemy',characterId:RAID_TOP_ENEMIES[1].roster[0].id,name:RAID_TOP_ENEMIES[1].roster[0].name}]} replayEvents={[{type:'DAMAGE',round:1,payload:{actorId:'p1',targetId:'enemy',hpDamage:125000}},{type:'RESULT',round:2,payload:{winner:scenario==='member'||scenario==='cleared'?'ENEMY':'PLAYER',rounds:2}}]} modeResult={{raidReceipt:projectRaidResultReceipt({roomId:fixture.room.roomId,roomOutcome:scenario==='cleared'?'DEFEAT_SUCCESS':scenario==='expired'?'TIMEOUT_FAILURE':null,lateFinalization:scenario==='expired'}),stats:[{label:'今回の個人ダメージ',value:'125,000'},{label:'共有HPへの反映',value:scenario==='expired'?'0':'125,000'}]}} onContinue={()=>setAction('result-return')} continueControl={<OutlawButton fullWidth onClick={()=>setAction('ack-return')}>レイドへ戻る</OutlawButton>}/></AudioProvider>}
      {page === 'result' && <RaidResultDetails victory={scenario !== 'member'} roomState={fixture.room.state} lateFinalization={scenario === 'expired'} modeResult={{ reward: '個人の戦闘結果', stats: [{ label: '今回の貢献ダメージ', value: '125,000' }, { label: '累計貢献ダメージ', value: '250,000' }] }} />}
    </HubPage></div><footer className="raid-detail-qa-footer"><OutlawButton onClick={() => setAction('return')}>戻る</OutlawButton></footer>
    <output hidden data-testid="qa-action">{action}</output><output hidden data-testid="qa-confirmed">{confirmed}</output>
  </main></GameContext.Provider>;
}
