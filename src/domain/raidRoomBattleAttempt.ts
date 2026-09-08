/** 一度送信した出撃のpayloadを固定する。応答不明でも別の開始を作らない。 */
export function createRaidRoomBattleAttempt(roomId: string, requestId = crypto.randomUUID()) {
  let payload: { p_room_id: string; p_character_ids: string[]; p_tactic: string; p_request_id: string } | null = null;
  let uncertain = false;
  let receipt: any = null;
  let inFlight: Promise<any> | null = null;
  return {
    savedReceipt: () => receipt,
    characters: () => payload ? [...payload.p_character_ids] : null,
    hasSubmitted: () => uncertain || receipt !== null,
    async start(client: { rpc: (name: string, params: any) => any }, characters: string[], tactic: string): Promise<any> {
      if (receipt) return { data: receipt, error: null };
      if (inFlight) return inFlight;
      payload ??= { p_room_id: roomId, p_character_ids: [...characters], p_tactic: tactic, p_request_id: requestId };
      uncertain = true;
      inFlight = (async () => {
        const response = await client.rpc('start_raid_room_battle_v1', payload);
        if (response.error && /^[0-9A-Z]{5}$/.test(response.error.code || "")) uncertain = false;
        if (!response.error) {
          const value = response.data;
          if (value?.room_id !== roomId || typeof value.replay_session_id !== 'string' || !value.replay_session_id
            || !Array.isArray(value.player_snapshot) || !value.player_snapshot.length
            || !Array.isArray(value.enemy_snapshot) || value.enemy_snapshot.length !== 5) {
            return { data: null, error: { message: 'レイド開始応答を確認できませんでした。同じ出撃を再確認してください。' } };
          }
          receipt = value;
        }
        return response;
      })();
      try { return await inFlight; } finally { inFlight = null; }
    },
  };
}
