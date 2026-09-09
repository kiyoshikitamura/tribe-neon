'use client';
import React from 'react';
import type { BattleModeResultDetail } from '../../../hooks/useBattle';
import type { RaidObserved, RaidRoomState } from '../../../domain/raidRoom';
import './RaidResultDetails.css';

export interface RaidResultDetailsProps {
  victory: boolean;
  modeResult?: BattleModeResultDetail | null;
  roomState?: RaidObserved<RaidRoomState>;
  lateFinalization?: boolean;
}
/** 確定済み結果の表示だけを担当。個人勝敗から共有レイドの撃破を推測しない。 */
export default function RaidResultDetails({ victory, modeResult, roomState, lateFinalization }: RaidResultDetailsProps) {
  const state = roomState?.status === 'available' ? roomState.value : null;
  return <section className="raid-result-details" aria-label="レイド戦績">
    <div className="raid-result-details__states"><div><span>今回の戦闘</span><strong>{victory ? '勝利' : '敗北'}</strong></div><div><span>確定時の共有レイド</span><strong>{state === 'cleared' ? '撃破済み' : state === 'expired' ? '期限終了' : state === 'active' ? '開催中' : '戦況未取得'}</strong></div></div>
    <p className="raid-result-details__note">個人の勝敗と、共有レイドの撃破状態は別です。</p>
    {modeResult?.stats?.length ? <dl className="raid-result-details__stats">{modeResult.stats.map((stat, index) => <div key={`${stat.label}:${index}`}><dt>{stat.label}</dt><dd>{stat.value}</dd></div>)}</dl> : <p>今回の貢献情報は未取得です。</p>}
    {lateFinalization && <p className="raid-result-details__notice">開催終了後の確定です。個人の記録は残り、共有HPには反映されません。</p>}
    <p className="raid-result-details__note">討伐・救援報酬はレイドの「報酬」で確認できます。条件達成時はプレゼントBOXへ届きます。</p>
  </section>;
}
