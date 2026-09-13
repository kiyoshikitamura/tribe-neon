import assert from 'node:assert/strict';
import { revisitableQuestEncounters } from '../src/domain/quest/raidEncounter.ts';
const now = Date.parse('2026-09-13T12:00:00Z');
const entry = { status:'CREATED',patrolId:'quest-a',roomId:'room-a',acknowledged:true,ended:false,expiresAt:'2026-09-14T12:00:00Z' };
assert.equal(revisitableQuestEncounters([entry],now)[0].roomId,'room-a');
for (const change of [{acknowledged:false},{ended:true},{roomId:null},{status:'NO_ENCOUNTER'},{expiresAt:'2026-09-13T12:00:00Z'},{expiresAt:'invalid'}]) {
 assert.deepEqual(revisitableQuestEncounters([{...entry,...change}],now),[]);
}
console.log('Encounter revisit: same room, acknowledged, lifecycle/expiry guards PASS');
