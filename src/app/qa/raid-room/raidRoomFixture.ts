import type { RaidObserved, RaidRoomDto, RaidDifficultyId, RaidParticipantDto } from "@/domain/raidRoom";
import type { RaidRoomTransport } from "@/domain/raidRoomClient";

// QA専用のサンプル。HP・期限・報酬・編成条件の実装仕様ではない。
const known = <T,>(value: T): RaidObserved<T> => ({ status: "available", value });
const unknown = { status: "unknown" } as const;
const difficulties: RaidDifficultyId[] = ["beginner", "intermediate", "advanced", "expert"];

export function createRaidRoomQaTransport(): RaidRoomTransport {
  const evaluatedAt = new Date().toISOString();
  const rooms: RaidRoomDto[] = difficulties.map((difficultyId, index) => ({
    roomId: `qa-room-${difficultyId}`, difficultyId,
    owner: known({ userId: `qa-owner-${index}`, name: `確認用主催者${index + 1}`, leaderIconUrl: unknown }),
    state: known("active" as const), createdAt: known(evaluatedAt),
    expiresAt: known(new Date(Date.now() + 3600000).toISOString()), endedAt: known(null),
    hp: known({ current: 72000, max: 100000 }), participantCount: known(2),
    serverEligibility: index === 3
      ? { status: "ineligible", evaluatedAt, reasons: ["qa_power_shortage"] }
      : { status: "eligible", evaluatedAt },
  }));
  rooms.push({ ...rooms[0], roomId: "qa-room-ended", state: known("cleared"), hp: known({ current: 0, max: 100000 }),
    endedAt: known(evaluatedAt), serverEligibility: { status: "ineligible", evaluatedAt, reasons: ["qa_ended"] } });
  const find = (roomId: string) => {
    const room = rooms.find((entry) => entry.roomId === roomId);
    if (!room) throw new Error("QA Room unavailable");
    return room;
  };
  const memberships = new Set<string>();
  const creations = new Map<string, { key: string; room: RaidRoomDto }>();
  const pause = () => new Promise<void>((resolve) => setTimeout(resolve, 200));
  return {
    async getBriefing(roomId) {
      const room = find(roomId); await pause();
      return { roomId, raidBossInstanceId: 'qa-instance-' + roomId, raidVariantId: 'qa-boss', bossName: '確認用ボス', baseId: null,
        membershipStatus: memberships.has(roomId) ? 'joined' : 'not_joined',
        joinEligibility: { status: room.serverEligibility.status === 'eligible' ? 'passed' : 'unknown', reason: 'qa_sample', actualPower: null, minimumPower: null },
        battleStartEnabled: false };
    },
    async registerParticipation(roomId) {
      const room = find(roomId); await pause();
      if (memberships.has(roomId)) return { roomId, membershipStatus: 'already_joined' };
      if (room.serverEligibility.status !== 'eligible' || room.state.status !== 'available' || room.state.value !== 'active' || room.expiresAt.status !== 'available' || Date.parse(room.expiresAt.value) <= Date.now()) throw new Error('QA ineligible');
      memberships.add(roomId);
      rooms[rooms.indexOf(room)] = { ...room, participantCount: known((room.participantCount.status === 'available' ? room.participantCount.value : 0) + 1) };
      return { roomId, membershipStatus: 'joined' };
    },
    async listBossChoices() { await pause(); return [{ raidVariantId: "qa-boss", name: "確認用ボス" }]; },
    async createRoom(request) {
      await pause();
      const key = JSON.stringify([request.difficultyId, request.raidVariantId]);
      const previous = creations.get(request.requestId);
      if (previous) { if (previous.key !== key) throw new Error("QA conflict"); return previous.room; }
      if (request.raidVariantId !== "qa-boss") throw new Error("QA unknown boss");
      const created: RaidRoomDto = { ...rooms[0], roomId: `qa-created-${request.requestId}`, difficultyId: request.difficultyId,
        owner: known({ userId: "qa-self", name: "確認用作成者", leaderIconUrl: unknown }),
        createdAt: known(new Date().toISOString()), expiresAt: known(new Date(Date.now() + 86400000).toISOString()),
        participantCount: known(1), hp: known({ current: 100000, max: 100000 }), serverEligibility: unknown };
      memberships.add(created.roomId); rooms.push(created); creations.set(request.requestId, { key, room: created }); return created;
    },
    async listRooms() { await pause(); return rooms; },
    async getRoom(roomId) { await pause(); return find(roomId); },
    async listParticipants(roomId) {
      const room = find(roomId);
      const owner = room.owner.status === "available" ? room.owner.value : null;
      if (!owner) return [];
      const participants: RaidParticipantDto[] = [
        { roomId, player: owner, currentGuild: known({ guildId: "qa-guild", name: "確認用ギルド" }), battleGuildSnapshot: unknown,
          finalizedBattles: known(1), rawDamage: known(18000), appliedDamage: known(18000) },
        { roomId, player: { userId: "qa-rescuer", name: "確認用救援者", leaderIconUrl: unknown }, currentGuild: unknown,
          battleGuildSnapshot: unknown, finalizedBattles: known(0), rawDamage: known(0), appliedDamage: known(0) },
      ];
      if (memberships.has(roomId) && owner.userId !== "qa-self") participants.push({
        roomId, player: { userId: "qa-self", name: "確認用参加者", leaderIconUrl: unknown }, currentGuild: unknown,
        battleGuildSnapshot: unknown, finalizedBattles: known(0), rawDamage: known(0), appliedDamage: known(0),
      });
      await pause(); return room.roomId.startsWith("qa-created-") ? [{ ...participants[0], finalizedBattles: known(0), rawDamage: known(0), appliedDamage: known(0) }] : participants;
    },
    async getRewards(roomId) {
      find(roomId); await pause();
      return [{ itemId: "QA_REWARD", quantity: 1, deliveryState: unknown, presentId: unknown }];
    },
    async joinRoom() { throw new Error("QA battle authority is not connected"); },
  };
}
