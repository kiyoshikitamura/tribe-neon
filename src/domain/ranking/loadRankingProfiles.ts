/** The public profile RPC accepts at most 100 IDs, including nearby/self rows. */
export async function loadRankingProfiles<T extends { user_id: string }>(
  ids: readonly string[], read: (ids: string[]) => Promise<T[]>,
): Promise<Record<string, T>> {
  const unique = [...new Set(ids.filter(Boolean))];
  const batches = [];
  for (let offset = 0; offset < unique.length; offset += 100) batches.push(unique.slice(offset, offset + 100));
  const profiles = (await Promise.all(batches.map(read))).flat();
  return Object.fromEntries(profiles.map(profile => [profile.user_id, profile]));
}
