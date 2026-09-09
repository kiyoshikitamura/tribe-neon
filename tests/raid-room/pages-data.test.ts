import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {loadRaidEnemyInfo,loadRaidListPage,loadRaidRescueCards} from '../../src/domain/raidPages';
import {projectRaidResultReceipt} from '../../src/domain/raidResultPresentation';
import {fixtureEnemySkills} from '../../src/app/qa/raid-pages/IntegratedPages';
const read=(name:string)=>JSON.parse(readFileSync(`outputs/raid-step4/actual-${name}.json`,'utf8'));
test('今回の実PostgreSQL一覧JSONを実adapterへ通し素材とdifficultyを解決',async()=>{
 const raw=read('list');const difficulty=raw.entries[0].room.difficultyId;const calls:string[]=[];
 const result=await loadRaidListPage({rpc:async(name)=>{calls.push(name);return {data:raw,error:null};}},difficulty,0);
 assert.deepEqual(calls,['list_raid_room_cards_v1']);assert.equal(result.entries.length,raw.entries.length);assert.equal(result.entries[0].enemy.status,'available');
 await assert.rejects(()=>loadRaidListPage({rpc:async()=>({data:{...raw,nextOffset:1},error:null})},difficulty,0));
});
test('実enemyJSON技能をadapterとQA正本選択へ縦結合しpresent混入拒否',async()=>{
 const raw=read('enemy');const result=await loadRaidEnemyInfo({rpc:async()=>({data:raw,error:null})},raw.variantId,'beginner');assert.deepEqual(result.skillsByCharacterId,fixtureEnemySkills(raw.variantId));
 await assert.rejects(()=>loadRaidEnemyInfo({rpc:async()=>({data:{...raw,clearPlan:{status:'configured',items:[{itemId:'X',quantity:1,presentId:'forbidden'}]}},error:null})},raw.variantId,'beginner'));
});
test('実救援JSONをまとめて解決し未要求参照の混入を拒否',async()=>{
 const raw=read('rescue');const ids=raw.entries.map((entry:{rescue:{value:{rescueId:string}}})=>entry.rescue.value.rescueId);const result=await loadRaidRescueCards({rpc:async()=>({data:raw,error:null})},ids);assert.equal(result.length,raw.entries.length);
 await assert.rejects(()=>loadRaidRescueCards({rpc:async()=>({data:raw,error:null})},['wrong-reference']));
});
test('Result receiptは明示terminal/非lateだけ採用し欠損や個人勝敗から推定しない',()=>{
 assert.equal(projectRaidResultReceipt({victory:true}),undefined);
 assert.deepEqual(projectRaidResultReceipt({roomId:'r',roomOutcome:'DEFEAT_SUCCESS',lateFinalization:true})?.roomState,{status:'available',value:'cleared'});
 assert.deepEqual(projectRaidResultReceipt({roomId:'r',roomOutcome:'TIMEOUT_FAILURE'})?.roomState,{status:'available',value:'expired'});
 assert.deepEqual(projectRaidResultReceipt({roomId:'r',roomOutcome:null,lateFinalization:false})?.roomState,{status:'available',value:'active'});
 assert.deepEqual(projectRaidResultReceipt({roomId:'r',roomOutcome:null,lateFinalization:true})?.roomState,{status:'unknown'});
 assert.deepEqual(projectRaidResultReceipt({roomId:'r',victory:true})?.roomState,{status:'unknown'});
 assert.equal(projectRaidResultReceipt({roomId:'r',lateFinalization:'true'})?.lateFinalization,undefined);
});
