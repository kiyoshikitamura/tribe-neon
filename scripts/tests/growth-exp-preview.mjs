// Run with Node.js type stripping: node --experimental-strip-types scripts/tests/growth-exp-preview.mjs
import assert from "node:assert/strict";
import { calculateGrowthExp, parseGrowthExpMaster } from "../../src/domain/gameplay/canonical/growthExp.ts";
const rows = (bands, cash) => Array.from({length:99}, (_, i) => ({level:i+2,required_exp:bands[Math.floor((i+1)/10)],cost_cash:cash}));
const character = rows([100,200,350,500,700,1000,1400,1900,2500,3200],100);
const equipment = rows([50,100,200,300,450,650,900,1250,1700,2250],50);
const cases = [
  [1,0,50,2600,character,{level:18,xp:100,cashSpent:1700,canApply:true}],
  [1,0,50,3100,equipment,{level:28,xp:50,cashSpent:1350}],
  [50,0,50,2000,character,{level:50,xp:2000,cashSpent:0,canApply:true}],
  [50,2000,60,0,character,{level:52,xp:0,cashSpent:200,canApply:true}],
  [50,2500,60,0,equipment,{level:53,xp:550,cashSpent:150}],
  [99,2249,100,2500,equipment,{level:100,xp:2499,cashSpent:50,canApply:true}],
  [100,2499,100,0,equipment,{level:100,xp:2499,cashSpent:0,canApply:false}],
  [10,0,50,100,character,{level:10,xp:100,cashSpent:0,canApply:true}],
  [1,0,50,0,character,{level:1,xp:0,canApply:false}],
  [99,3199,100,2000,character,{level:100,xp:1999,cashSpent:100,canApply:true}],
];
for (const [level,xp,cap,gained,master,expected] of cases) {
  const actual = calculateGrowthExp(level,xp,cap,gained,master);
  for (const [key,value] of Object.entries(expected)) assert.equal(actual[key],value,key);
}
assert.equal(character.reduce((sum,row)=>sum+row.required_exp,0),118400);
assert.equal(equipment.reduce((sum,row)=>sum+row.required_exp,0),78450);
assert.equal(parseGrowthExpMaster({character,equipment}).character.length,99);
assert.throws(()=>parseGrowthExpMaster({character:character.slice(1),equipment}));
assert.throws(()=>calculateGrowthExp(1,-1,50,100,character));
assert.throws(()=>calculateGrowthExp(1,Number.MAX_SAFE_INTEGER,50,100,character));
console.log("PASS: growth preview, overflow, stored EXP, master validation");
