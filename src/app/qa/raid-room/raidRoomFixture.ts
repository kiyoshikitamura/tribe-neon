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
  const pause = () => new Promise<void>((resolve) => setTimeout(resolve, 200));
  return {
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
      await pause(); return participants;
    },
    async getRewards(roomId) {
      find(roomId); await pause();
      return [{ itemId: "QA_REWARD", quantity: 1, deliveryState: unknown, presentId: unknown }];
    },
    async joinRoom({ roomId }) {
      const room = find(roomId); await pause();
      if (room.serverEligibility.status !== "eligible") throw new Error("QA ineligible");
      return { roomId, replayId: `qa-only-${roomId}` };
    },
  };
}
