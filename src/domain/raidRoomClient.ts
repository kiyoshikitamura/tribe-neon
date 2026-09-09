import { RaidRoomRequirementError } from './raidRoomJoinPresentation.ts';
import type { RaidDifficultyId, RaidParticipantDto, RaidRewardDto, RaidRoomDto } from './raidRoom';
import { RaidRoomStoppedError } from './raidRoomErrors.ts';

/** サーバーが開始済みの戦闘を返す参照。クライアントでReplayを生成しない。 */
export interface RaidBattleReference {
  readonly roomId: string;
  readonly replayId: string;
}

export interface RaidRoomMembershipReceipt { readonly roomId: string; readonly membershipStatus: 'joined' | 'already_joined' }
export interface RaidRoomBriefing {
  readonly roomId: string;
  readonly raidBossInstanceId: string;
  readonly raidVariantId: string | null;
  readonly bossName: string | null;
  readonly baseId: string | null;
  readonly membershipStatus: 'joined' | 'not_joined';
  readonly joinEligibility: { readonly status: 'passed' | 'failed' | 'unknown'; readonly reason: string; readonly actualPower: number | null; readonly minimumPower: number | null };
  /** 運用フラグのみ。実出撃編成の資格を示さない。 */
  readonly battleStartEnabled: boolean;
}

export interface RaidBossChoice { readonly raidVariantId: string; readonly name: string }
export interface RaidRoomCreateRequest { readonly difficultyId: RaidDifficultyId; readonly raidVariantId: string; readonly requestId: string }

/** 実API接続時の境界。未実装のRPC名や報酬付与処理はここに置かない。 */
export interface RaidRoomTransport {
  registerRescueParticipation?(roomId: string, rescueId: string): Promise<RaidRoomMembershipReceipt>;
  registerParticipation?(roomId: string): Promise<RaidRoomMembershipReceipt>;
  getBriefing?(roomId: string): Promise<RaidRoomBriefing>;
  listBossChoices?(): Promise<readonly RaidBossChoice[]>;
  createRoom?(request: RaidRoomCreateRequest): Promise<RaidRoomDto>;
  listRooms(): Promise<readonly RaidRoomDto[]>;
  getRoom(roomId: string): Promise<RaidRoomDto>;
  listParticipants(roomId: string): Promise<readonly RaidParticipantDto[]>;
  getRewards(roomId: string): Promise<readonly RaidRewardDto[]>;
  joinRoom(request: { readonly roomId: string; readonly rescueId?: string }): Promise<RaidBattleReference>;
}

export interface RaidRoomResource<T> {
  readonly status: 'idle' | 'loading' | 'success' | 'error';
  readonly data: T | null;
  readonly error: string | null;
}

export interface RaidRoomClientState {
  readonly rooms: RaidRoomResource<readonly RaidRoomDto[]>;
  readonly selectedRoomId: string | null;
  readonly room: RaidRoomResource<RaidRoomDto>;
  readonly participants: RaidRoomResource<readonly RaidParticipantDto[]>;
  readonly rewards: RaidRoomResource<readonly RaidRewardDto[]>;
  readonly canRegister: boolean;
  readonly briefing: RaidRoomResource<RaidRoomBriefing>;
  readonly registering: boolean;
  readonly registrationError: string | null;
  readonly canCreate: boolean;
  readonly bossChoices: RaidRoomResource<readonly RaidBossChoice[]>;
  readonly creating: boolean;
  readonly createError: string | null;
  readonly joining: boolean;
  readonly joinError: string | null;
}

export interface RaidRoomController {
  getSnapshot(): RaidRoomClientState;
  subscribe(listener: () => void): () => void;
  loadRooms(): Promise<void>;
  loadBossChoices(): Promise<void>;
  resetCreateRequest(): void;
  createRoom(difficultyId: RaidDifficultyId, raidVariantId: string): Promise<RaidRoomDto | null>;
  selectRoom(roomId: string | null, rescueId?: string): Promise<void>;
  refreshRoom(): Promise<void>;
  registerParticipation(): Promise<RaidRoomMembershipReceipt | null>;
  join(): Promise<RaidBattleReference | null>;
  dispose(): void;
}

const idle = <T>(): RaidRoomResource<T> => ({ status: 'idle', data: null, error: null });
const loading = <T>(): RaidRoomResource<T> => ({ status: 'loading', data: null, error: null });
const success = <T>(data: T): RaidRoomResource<T> => ({ status: 'success', data, error: null });
const failure = <T>(): RaidRoomResource<T> => ({ status: 'error', data: null, error: '取得できませんでした。もう一度お試しください。' });

/** 表示用状態の管理のみ。参加資格・消費・報酬の最終判断はtransport先のサーバー。 */
export function createRaidRoomController(transport: RaidRoomTransport): RaidRoomController {
  let state: RaidRoomClientState = {
    rooms: idle(), selectedRoomId: null, room: idle(), participants: idle(), rewards: idle(),
    canRegister: !!transport.registerParticipation && !!transport.getBriefing, briefing: idle(), registering: false, registrationError: null,
    joining: false, joinError: null, canCreate: !!transport.createRoom && !!transport.listBossChoices, bossChoices: idle(), creating: false, createError: null,
  };
  const listeners = new Set<() => void>();
  let disposed = false;
  let listRevision = 0;
  let selectionRevision = 0;
  let detailRevision = 0;
  let rescueId: string | undefined;
  // 選択を変えても通信中の参加要求は取り消せないため、settleまで連打防止を維持する。
  // 通信失敗時のサーバー確定有無は判断できない。再送の二重消費防止はサーバー側の冪等性が必要。
  let registerPending = false;
  let joinPending = false;
  let createPending = false;
  let createAttempt: { key: string; requestId: string } | null = null;
  let choicesRevision = 0;

  const update = (patch: Partial<RaidRoomClientState>) => {
    if (disposed) return;
    state = { ...state, ...patch };
    listeners.forEach((listener) => listener());
  };

  async function refreshRoom(): Promise<void> {
    if (disposed || state.selectedRoomId === null) return;
    const roomId = state.selectedRoomId;
    const revision = ++detailRevision;
    const current = () => !disposed && revision === detailRevision && state.selectedRoomId === roomId;
    update({ room: loading(), participants: loading(), rewards: loading(), briefing: transport.getBriefing ? loading() : idle() });
    const briefingRequest = (async (): Promise<RaidRoomBriefing | null> => {
      if (!transport.getBriefing) return null;
      try {
        const briefing = await transport.getBriefing(roomId);
        if (briefing.roomId !== roomId) throw new Error('Room mismatch');
        if (current()) update({ briefing: success(briefing) });
        return briefing;
      } catch { if (current()) update({ briefing: failure() }); return null; }
    })();
    await Promise.all([
      briefingRequest,
      (async () => {
        try {
          const room = await transport.getRoom(roomId);
          if (room.roomId !== roomId) throw new Error('Room mismatch');
          if (current()) update({ room: success(room) });
        } catch {
          if (current()) update({ room: failure() });
        }
      })(),
      (async () => {
        try {
          if (transport.getBriefing) {
            const briefing = await briefingRequest;
            if (!current()) return;
            if (briefing?.membershipStatus !== 'joined') { update({ participants: idle() }); return; }
          }
          const participants = await transport.listParticipants(roomId);
          if (participants.some((entry) => entry.roomId !== roomId)) throw new Error('Room mismatch');
          if (current()) update({ participants: success(participants) });
        } catch {
          if (current()) update({ participants: failure() });
        }
      })(),
      (async () => {
        try {
          const rewards = await transport.getRewards(roomId);
          if (current()) update({ rewards: success(rewards) });
        } catch {
          if (current()) update({ rewards: failure() });
        }
      })(),
    ]);
  }

  return {
    getSnapshot: () => state,
    subscribe(listener) {
      if (disposed) return () => undefined;
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    resetCreateRequest() { if (!createPending) { createAttempt = null; update({ createError: null }); } },
    async loadBossChoices() {
      if (disposed || !transport.listBossChoices) return;
      const revision = ++choicesRevision;
      update({ bossChoices: loading() });
      try {
        const choices = await transport.listBossChoices();
        if (!disposed && revision === choicesRevision) update({ bossChoices: success(choices) });
      } catch {
        if (!disposed && revision === choicesRevision) update({ bossChoices: failure() });
      }
    },
    async createRoom(difficultyId, raidVariantId) {
      if (disposed || createPending || joinPending || registerPending || !transport.createRoom || !state.canCreate) return null;
      createPending = true;
      const revision = selectionRevision;
      update({ creating: true, createError: null });
      try {
        const key = JSON.stringify([difficultyId, raidVariantId]);
        if (!createAttempt || createAttempt.key !== key) createAttempt = { key, requestId: globalThis.crypto.randomUUID() };
        const room = await transport.createRoom({ difficultyId, raidVariantId, requestId: createAttempt.requestId });
        if (!room.roomId || room.difficultyId !== difficultyId) throw new Error('Invalid created room');
        createAttempt = null;
        if (disposed || revision !== selectionRevision) return null;
        selectionRevision++; detailRevision++; listRevision++;
        rescueId = undefined;
        update({ selectedRoomId: room.roomId, room: success(room), participants: idle(), rewards: idle(),
          rooms: idle(), joinError: null, briefing: idle(), registrationError: null });
        if (transport.getBriefing) await refreshRoom();
        return room;
      } catch (error) {
        update({ createError: error instanceof RaidRoomStoppedError
          ? 'レイドの新規作成は現在停止中です。再開後にお試しください。'
          : error instanceof RaidRoomRequirementError ? error.displayMessage
          : '挑戦を受け付けられませんでした。時間をおいて同じ内容で再度お試しください。' });
        return null;
      } finally { createPending = false; update({ creating: false }); }
    },
    async loadRooms() {
      if (disposed) return;
      const revision = ++listRevision;
      update({ rooms: loading() });
      try {
        const rooms = await transport.listRooms();
        if (!disposed && revision === listRevision) update({ rooms: success(rooms) });
      } catch {
        if (!disposed && revision === listRevision) update({ rooms: failure() });
      }
    },
    async selectRoom(roomId, sourceRescueId) {
      if (disposed) return;
      selectionRevision++;
      detailRevision++;
      rescueId = sourceRescueId;
      update({ selectedRoomId: roomId, room: idle(), participants: idle(), rewards: idle(), joinError: null, briefing: idle(), registrationError: null });
      await refreshRoom();
    },
    refreshRoom,
    async registerParticipation() {
      if (disposed || registerPending || joinPending || createPending || !state.canRegister || !transport.registerParticipation || !state.selectedRoomId) return null;
      if (rescueId !== undefined && !transport.registerRescueParticipation) {
        update({ registrationError: '救援からの参加は現在利用できません。' });
        return null;
      }
      const briefing = state.briefing.data;
      if (state.briefing.status !== 'success' || !briefing || briefing.joinEligibility.status !== 'passed' || briefing.membershipStatus !== 'not_joined') return null;
      const roomId = state.selectedRoomId, revision = selectionRevision;
      registerPending = true;
      update({ registering: true, registrationError: null });
      try {
        const receipt = rescueId !== undefined && transport.registerRescueParticipation
          ? await transport.registerRescueParticipation(roomId, rescueId)
          : await transport.registerParticipation(roomId);
        if (receipt.roomId !== roomId || !['joined', 'already_joined'].includes(receipt.membershipStatus)) throw new Error('Invalid membership receipt');
        if (disposed || revision !== selectionRevision) return null;
        await refreshRoom();
        return receipt;
      } catch {
        if (!disposed && revision === selectionRevision) {
          detailRevision++;
          update({ briefing: idle(), registrationError: '参加を確認できませんでした。Roomを更新して再度お試しください。' });
        }
        return null;
      } finally { registerPending = false; update({ registering: false }); }
    },
    async join() {
      if (disposed || joinPending || createPending || registerPending || state.canRegister || state.selectedRoomId === null) return null;
      const room = state.room.data;
      if (state.room.status !== 'success' || !room || room.serverEligibility.status !== 'eligible') {
        update({ joinError: '参加条件を確認してからお試しください。' });
        return null;
      }
      const roomId = state.selectedRoomId;
      const revision = selectionRevision;
      joinPending = true;
      update({ joining: true, joinError: null });
      try {
        const battle = await transport.joinRoom({ roomId, ...(rescueId === undefined ? {} : { rescueId }) });
        if (battle.roomId !== roomId || !battle.replayId) throw new Error('Invalid battle reference');
        if (disposed || revision !== selectionRevision) return null;
        // 開始前の参加資格を再利用しない。復帰時に改めてRoomを更新する。
        detailRevision++;
        update({ room: idle() });
        return battle;
      } catch {
        if (!disposed && revision === selectionRevision) {
          detailRevision++;
          update({ room: idle(), joinError: '参加できませんでした。Roomを更新してもう一度お試しください。' });
        }
        return null;
      } finally {
        joinPending = false;
        update({ joining: false });
      }
    },
    dispose() {
      disposed = true;
      listeners.clear();
    },
  };
}
