import type { RaidParticipantDto, RaidRewardDto, RaidRoomDto } from './raidRoom';

/** サーバーが開始済みの戦闘を返す参照。クライアントでReplayを生成しない。 */
export interface RaidBattleReference {
  readonly roomId: string;
  readonly replayId: string;
}

/** 実API接続時の境界。未実装のRPC名や報酬付与処理はここに置かない。 */
export interface RaidRoomTransport {
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
  readonly joining: boolean;
  readonly joinError: string | null;
}

export interface RaidRoomController {
  getSnapshot(): RaidRoomClientState;
  subscribe(listener: () => void): () => void;
  loadRooms(): Promise<void>;
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
    joining: false, joinError: null,
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
      if (disposed || joinPending || state.selectedRoomId === null) return null;
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
