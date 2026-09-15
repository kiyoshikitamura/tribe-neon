import assert from 'node:assert/strict';
import { parseDailyFreeRates } from '../src/domain/gameplay/dailyFreeRates.ts';

const rarities = ['N','R','SR','SSR'];
const rows = [['CHAR_NORMAL',[6070,3000,900,30]],['SKILL_NORMAL',[5200,3000,1700,100]],['EQUIP_NORMAL',[4900,3000,2000,100]]]
  .flatMap(([gacha_id,weights]) => rarities.map((rarity,i) => ({gacha_id,rarity,weight:weights[i],version:'daily-free-2026-09-12-v1'})));
assert.equal(parseDailyFreeRates(rows)?.length,12);
for (const invalid of [null, [], rows.slice(1), [...rows.slice(1),rows[1]], rows.map((r,i)=>i===0?{...r,version:'old'}:r), rows.map(r=>({...r,weight:0})), rows.map((r,i)=>i===0?{...r,weight:NaN}:r)]) {
  assert.equal(parseDailyFreeRates(invalid),null);
}
for (const [id,expected] of [['CHAR_NORMAL',.3],['SKILL_NORMAL',1],['EQUIP_NORMAL',1]]) {
  const rates = parseDailyFreeRates(rows).filter(r=>r.gacha_id===id);
  assert.equal(rates.find(r=>r.rarity==='SSR').weight/rates.reduce((sum,r)=>sum+r.weight,0)*100,expected);
}
console.log('PASS: daily free display rates, incomplete/mixed/stale contracts rejected');
