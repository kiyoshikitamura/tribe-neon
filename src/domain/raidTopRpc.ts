import type { RaidRoomRpcClient } from './raidRoomRpcTransport';
import { parseRaidTopSnapshot, type RaidTopLoader } from './raidTopData';

/** 1更新につき1つの認証済み一括RPC。クライアントID/日付/ページを送らない。 */
export function createRaidTopRpcLoader(client: RaidRoomRpcClient): RaidTopLoader {
  return async () => {
    const response = await client.rpc('get_raid_top_v1');
    if (response.error) throw new Error('Raid top request failed');
    return parseRaidTopSnapshot(response.data);
  };
}

/** 端末時刻は再取得のトリガーのみ。日次対象は常にサーバー正本が返す。 */
export function millisecondsUntilNextRaidJstDay(now: number): number {
  const day = 86_400_000;
  const shifted = now + 9 * 60 * 60 * 1000;
  return day - ((shifted % day + day) % day) + 100;
}
