import type { RaidRoomBattlePayload } from './raidRoomBattlePending';
interface AttemptOptions {
  initialPayload?: RaidRoomBattlePayload;
  beforeSend?: (payload: RaidRoomBattlePayload) => void;
  assertCurrent?: () => void;
  clear?: (requestId: string) => void;
}
/** 一度送信した出撃のpayloadを固定する。応答不明でも別の開始を作らない。 */
export function createRaidRoomBattleAttempt(roomId: string, requestId = crypto.randomUUID(), options: AttemptOptions = {}) {
  let payload: RaidRoomBattlePayload | null = options.initialPayload ? { ...options.initialPayload, p_character_ids: [...options.initialPayload.p_character_ids] } : null;
  let uncertain = Boolean(payload);
  let receipt: any = null;
  let recovered = false;
  let inFlight: Promise<any> | null = null;
  const accept = (value: any) => {
    if (value?.room_id !== roomId || typeof value.replay_session_id !== 'string' || !value.replay_session_id
      || !Array.isArray(value.player_snapshot) || !value.player_snapshot.length
      || !Array.isArray(value.enemy_snapshot) || value.enemy_snapshot.length !== 5) {
      return { data: null, error: { message: 'レイド開始応答を確認できませんでした。同じ出撃を再確認してください。' } };
    }
    receipt = value;
    return { data: value, error: null };
  };
  const attempt = {
    savedReceipt: () => receipt,
    isRecovered: () => recovered,
    characters: () => payload ? [...payload.p_character_ids] : null,
    hasSubmitted: () => uncertain || receipt !== null,
    clear: () => { if (payload) options.clear?.(payload.p_request_id); },
    async recover(client: { rpc: (name: string, params: any) => any }): Promise<any> {
      options.assertCurrent?.();
      recovered = true;
      const response = await client.rpc('get_raid_room_battle_start_receipt_v1', { p_request_id: requestId });
      options.assertCurrent?.();
      if (response.error) return response;
      if (response.data !== null) return accept(response.data);
      if (!payload) throw new Error('出撃の再送情報がありません。');
      return attempt.start(client, payload.p_character_ids, payload.p_tactic);
    },
    async start(client: { rpc: (name: string, params: any) => any }, characters: string[], tactic: string): Promise<any> {
      options.assertCurrent?.();
      if (receipt) return { data: receipt, error: null };
      if (inFlight) return inFlight;
      payload ??= { p_room_id: roomId, p_character_ids: [...characters], p_tactic: tactic, p_request_id: requestId };
      options.beforeSend?.(payload);
      uncertain = true;
      inFlight = (async () => {
        const response = await client.rpc('start_raid_room_battle_v1', payload);
        options.assertCurrent?.();
        if (response.error && /^[0-9A-Z]{5}$/.test(response.error.code || '')) uncertain = false;
        if (!response.error) return accept(response.data);
        return response;
      })();
      try { return await inFlight; } finally { inFlight = null; }
    },
  };
  return attempt;
}
