import type { RaidObserved, RaidPlayerSummary } from '@/domain/raidRoom';
import type { RaidTopData, RaidTopEntry } from '@/domain/raidTop';
import { RAID_TOP_ENEMIES } from '@/domain/raidTopAssets';

export const TOP_SCENARIOS = ['empty', 'single', 'multiple', 'loading', 'error', 'unavailable', 'ended', 'long-name', 'no-guild', 'broken-image', 'unknown', 'returned'] as const;
export type TopScenario = typeof TOP_SCENARIOS[number];
const known = <T,>(value: T): RaidObserved<T> => ({ status: 'available', value });
const unknown = { status: 'unknown' } as const;

/** 明示Mock専用。人物/戦況はQAデータ、敵の名前・5体編成・画像は現行マスター。 */
export function createTopFixture(scenario: TopScenario, now = Date.now(), areaOffset = 0): RaidTopData {
  const enemyAt = (index: number) => RAID_TOP_ENEMIES[(index + areaOffset) % RAID_TOP_ENEMIES.length];
  const player = (index: number): RaidPlayerSummary => ({ userId: `qa-person-${index}`, name: scenario === 'long-name' ? '確認用の非常に長い名前ABCDEFGHIJKLMN主催者' : `確認用主催者${index + 1}`, leaderIconUrl: known(scenario === 'broken-image' ? '/qa-missing-image.png' : enemyAt(index).leaderImageUrl) });
  const entry = (index: number, rescue: boolean): RaidTopEntry => {
    const enemy = enemyAt(index);
    const state = scenario === 'ended' ? (index % 2 ? 'expired' : 'cleared') : 'active';
    return {
      room: { roomId: `qa-top-${rescue ? 'rescue' : 'joined'}-${index}`, difficultyId: ['beginner', 'intermediate', 'advanced', 'expert'][index % 4] as 'beginner', owner: known(player(index)),
        state: known(state), createdAt: known(new Date(now - 3600000).toISOString()), expiresAt: known(new Date(now + (state === 'expired' ? -1000 : (index + 1) * 3600000)).toISOString()), endedAt: known(state === 'active' ? null : new Date(now).toISOString()),
        hp: scenario === 'unknown' ? unknown : known({ current: state === 'cleared' ? 0 : scenario === 'returned' ? 2200000 : 7200000 - index * 1300000, max: 10000000 }), participantCount: scenario === 'unknown' ? unknown : known(3 + index), serverEligibility: unknown },
      enemy: known(scenario === 'broken-image' ? { ...enemy, leaderImageUrl: '/qa-missing-image.png', backgroundUrl: '/qa-missing-background.png', roster: enemy.roster.map(member => ({ ...member, imageUrl: '/qa-missing-image.png' })) } : enemy),
      ownerGuild: scenario === 'unknown' ? unknown : known(scenario === 'no-guild' ? null : { guildId: 'qa-guild', name: scenario === 'long-name' ? '確認用のとても長いギルド名ABCDEFGHIJKLMN' : '確認用Guild' }),
      participants: scenario === 'unknown' ? unknown : known([player(0), player(1), player(2)]), membership: known(rescue ? 'not_joined' : (['owner', 'member', 'rescue'] as const)[index % 3]),
      rescue: rescue ? known({ rescueId: `qa-rescue-reference-${index}`, source: index % 2 ? 'guild_chat' : 'activity' }) : unknown,
    };
  };
  if (scenario === 'loading' || scenario === 'error' || scenario === 'unavailable') return { participating: { status: scenario }, rescues: { status: scenario }, dailyTargets: { status: scenario }, canCreate: false };
  const count = scenario === 'empty' ? 0 : scenario === 'single' ? 1 : 3;
  return { participating: { status: 'ready', data: Array.from({ length: count }, (_, i) => entry(i, false)) }, rescues: { status: 'ready', data: Array.from({ length: count }, (_, i) => entry(i, true)) }, dailyTargets: { status: 'ready', data: { dateJst: '2026-09-09', targets: [enemyAt(0), enemyAt(1)] } }, canCreate: true };
}
