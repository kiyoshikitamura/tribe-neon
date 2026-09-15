'use client';
import { useEffect, useMemo, useState } from 'react';
import type { RaidRoomDisplay } from '@/domain/raidRoomDisplay';
import type { RaidRoomDto } from '@/domain/raidRoom';
import type { RaidRoomResource } from '@/domain/raidRoomClient';

export function useRaidRoomDisplay(roomId: string | null, room: RaidRoomDto | null, userId: string | undefined, loader?: (id: string) => Promise<RaidRoomDisplay>): RaidRoomResource<RaidRoomDisplay> {
  const request = useMemo(() => ({ roomId, room, userId, loader }), [roomId, room, userId, loader]);
  const [state, setState] = useState<{ request: typeof request; resource: RaidRoomResource<RaidRoomDisplay> } | null>(null);
  useEffect(() => {
    if (!request.roomId || !request.room || !request.loader) return;
    let current = true;
    void Promise.resolve().then(() => request.loader!(request.roomId!)).then(data => {
      if (data.roomId !== request.roomId) throw new Error('Raid display identity mismatch');
      if (current) setState({ request, resource: { status: 'success', data, error: null } });
    }).catch(() => { if (current) setState({ request, resource: { status: 'error', data: null, error: '表示情報を取得できませんでした' } }); });
    return () => { current = false; };
  }, [request]);
  if (!roomId || !room || !loader) return { status: 'idle', data: null, error: null };
  return state?.request === request ? state.resource : { status: 'loading', data: null, error: null };
}
