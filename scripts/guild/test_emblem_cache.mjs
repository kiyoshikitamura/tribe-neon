import assert from 'node:assert/strict';
import { createGuildEmblemCache } from '../../src/domain/presentation/guildEmblemCache.ts';

const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const settle = () => new Promise(resolve => setTimeout(resolve, 20));
const calls = [];
let clock = 100;
let path = '/old.svg';
const cache = createGuildEmblemCache(async ids => {
  calls.push(ids);
  return ids.map(guild_id => ({ guild_id, emblem_id: 'test', asset_path: path }));
}, () => clock);
for (let n = 1; n <= 120; n++) { cache.request(id(n)); cache.request(id(n)); }
cache.request('qa-fixture');
await settle();
assert.equal(calls.length, 2);
assert.equal(calls.flat().length, 120);
assert(calls.every(batch => batch.length <= 100));
cache.request(id(1)); await settle(); assert.equal(calls.length, 2);
clock += 60_001; cache.request(id(1)); await settle(); assert.equal(calls.length, 3);
path = '/new.svg';
let updates = 0;
const unsubscribe = cache.subscribe(id(1), () => updates++);
await cache.invalidate(id(1));
assert.equal(cache.get(id(1)), '/new.svg'); assert.equal(updates, 1); unsubscribe();

// A response started before a save must never overwrite the new selection.
let release;
let requests = 0;
const race = createGuildEmblemCache(async ids => {
  if (++requests === 1) return new Promise(resolve => { release = () => resolve([{guild_id:ids[0],asset_path:'/stale.svg'}]); });
  return [{guild_id:ids[0],asset_path:'/saved.svg'}];
});
race.request(id(1)); await settle();
await race.invalidate(id(1)); release(); await settle();
assert.equal(race.get(id(1)), '/saved.svg');

// A failed refresh keeps the last known display and exposes failure to the dialog.
let fail = false;
const resilient = createGuildEmblemCache(async ids => {
  if (fail) throw new Error('offline');
  return [{guild_id:ids[0],asset_path:'/known.svg'}];
});
resilient.request(id(1)); await settle(); fail = true;
await assert.rejects(() => resilient.invalidate(id(1)));
assert.equal(resilient.get(id(1)), '/known.svg');
console.log('Guild emblem cache: batch, dedup, expiry, refresh race, failure PASS');
