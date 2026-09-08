import type { RaidRoomDto, RaidParticipantDto, RaidRewardDto } from '../../src/domain/raidRoom';
export function roomFixture(roomId = 'room-a', overrides: Partial<RaidRoomDto> = {}): RaidRoomDto {
  return {
    roomId, difficultyId: 'intermediate',
    owner: { status: 'available', value: { userId: 'owner', name: '主催者', leaderIconUrl: { status: 'available', value: null } } },
    state: { status: 'available', value: 'active' },
    createdAt: { status: 'available', value: '2026-09-08T00:00:00Z' },
    expiresAt: { status: 'available', value: '2026-09-09T00:00:00Z' },
    endedAt: { status: 'available', value: null },
    hp: { status: 'available', value: { current: 500, max: 1000 } },
    participantCount: { status: 'available', value: 1 },
    serverEligibility: { status: 'eligible', evaluatedAt: '2026-09-08T00:00:00Z' },
    ...overrides,
  };
}
export const participantFixture: RaidParticipantDto = {
  roomId: 'room-a', player: { userId: 'member', name: '救援メンバー', leaderIconUrl: { status: 'available', value: null } },
  currentGuild: { status: 'available', value: { guildId: 'guild-now', name: '現在のギルド' } },
  battleGuildSnapshot: { status: 'available', value: { guildId: 'guild-then', name: '戦闘時のギルド' } },
  finalizedBattles: { status: 'available', value: 2 }, rawDamage: { status: 'available', value: 16000 },
  appliedDamage: { status: 'available', value: 15000 },
};
export const rewardFixture: RaidRewardDto = {
  itemId: 'TEST_ITEM', quantity: 2, deliveryState: { status: 'available', value: 'pending' },
  presentId: { status: 'available', value: null },
};
export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
