import type { RaidDifficultyId, RaidParticipantDto, RaidRewardDto, RaidRoomDto } from './raidRoom';

/** サーバーが開始済みの戦闘を返す参照。クライアントでReplayを生成しない。 */
export interface RaidBattleReference {
  readonly roomId: string;
  readonly replayId: string;
}

export interface RaidBossChoice { readonly raidVariantId: string; readonly name: string }
export interface RaidRoomCreateRequest { readonly difficultyId: RaidDifficultyId; readonly raidVariantId: string; readonly requestId: string }

/** 実API接続時の境界。未実装のRPC名や報酬付与処理はここに置かない。 */
export interface RaidRoomTransport {
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
    update({ room: loading(), participants: loading(), rewards: loading() });
    await Promise.all([
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
      if (disposed || createPending || joinPending || !transport.createRoom || !state.canCreate) return null;
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
          rooms: idle(), joinError: null });
        return room;
      } catch {
        update({ createError: '作成できませんでした。時間をおいて同じ内容で再度お試しください。' });
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
      update({ selectedRoomId: roomId, room: idle(), participants: idle(), rewards: idle(), joinError: null });
      await refreshRoom();
    },
    refreshRoom,
    async join() {
      if (disposed || joinPending || createPending || state.selectedRoomId === null) return null;
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
