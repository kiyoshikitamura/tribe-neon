export type GuildEmblemRow = { guild_id: string; emblem_id: string | null; asset_path: string | null };
type Entry = { path: string | null; at: number };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Shared, bounded batches across mounted identities; never one request per row. */
export function createGuildEmblemCache(fetchRows: (ids: string[]) => Promise<GuildEmblemRow[]>, now = Date.now) {
  const entries = new Map<string, Entry>();
  const listeners = new Map<string, Set<() => void>>();
  const pending = new Set<string>();
  const inFlight = new Set<string>();
  const revisions = new Map<string, number>();
  let scheduled = false;
  function emit(id: string) { listeners.get(id)?.forEach(fn => fn()); }
  function enqueue(id: string) {
    if (!UUID.test(id) || inFlight.has(id)) return;
    const entry = entries.get(id);
    if (entry && now() - entry.at < 60_000) return;
    pending.add(id);
    if (!scheduled) { scheduled = true; setTimeout(() => { void flush(); }, 0); }
  }
  async function flush() {
    scheduled = false;
    const ids = [...pending].slice(0, 100);
    if (!ids.length) return;
    const versions = new Map(ids.map(id => [id, revisions.get(id) || 0]));
    ids.forEach(id => { pending.delete(id); inFlight.add(id); });
    try {
      const rows = await fetchRows(ids);
      const byId = new Map(rows.map(row => [row.guild_id, row.asset_path]));
      ids.forEach(id => {
        if (versions.get(id) !== (revisions.get(id) || 0)) return;
        entries.set(id, { path: byId.get(id) || null, at: now() });
        emit(id);
      });
    } catch {
      // Preserve the last good image. Retry on next mount/focus, without a polling loop.
    } finally {
      ids.forEach(id => {
        inFlight.delete(id);
        if (versions.get(id) !== (revisions.get(id) || 0)) enqueue(id);
      });
      if (pending.size && !scheduled) { scheduled = true; setTimeout(() => { void flush(); }, 0); }
    }
  }
  return {
    get: (id: string) => entries.get(id)?.path,
    subscribe(id: string, listener: () => void) {
      const group = listeners.get(id) || new Set<() => void>();
      listeners.set(id, group); group.add(listener);
      return () => { group.delete(listener); if (!group.size) listeners.delete(id); };
    },
    request: enqueue,
    async invalidate(id: string) {
      if (!UUID.test(id)) return;
      const version = (revisions.get(id) || 0) + 1;
      revisions.set(id, version);
      const rows = await fetchRows([id]);
      if (revisions.get(id) !== version) return;
      entries.set(id, { path: rows.find(row => row.guild_id === id)?.asset_path || null, at: now() });
      emit(id);
    },
  };
}
