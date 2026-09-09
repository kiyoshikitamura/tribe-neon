import fs from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import ts from 'typescript';
const source=fs.readFileSync('src/app/context/GameContext.tsx','utf8');
const start=source.indexOf('  const handleSaveParty ='),end=source.indexOf('  const handleAutoFormation',start);
const factory=new Function('selectedMembers','persistPartyFormation','setSelectedMembers','setErrorMessage','console',ts.transpile(source.slice(start,end)+'\nreturn handleSaveParty;', {target:ts.ScriptTarget.ES2022}));
test('failed draft save keeps committed Context untouched',async()=>{
 const before=['leader','member'],draft=['member','leader'];let committed=before,error='';const calls=[];
 const save=factory(before,async ids=>{calls.push(ids);return {code:'42501'};},ids=>committed=ids,message=>error=message,{warn(){}});
 assert.equal(await save(draft),false);assert.equal(committed,before);assert.deepEqual(calls,[draft]);assert.ok(error);
});
test('draft publishes only after persistence resolves; legacy no-argument call stays supported',async()=>{
 const before=['leader','member'],draft=['member','leader'];let committed=before,release;const pending=new Promise(resolve=>release=resolve);
 const save=factory(before,async ids=>{assert.deepEqual(ids,draft);await pending;return null;},ids=>committed=ids,()=>{},console);
 const result=save(draft);assert.equal(committed,before);release();assert.equal(await result,true);assert.deepEqual(committed,draft);
 const legacy=factory(before,async ids=>{assert.deepEqual(ids,before);return null;},()=>assert.fail('legacy save should not replace state'),()=>{},console);assert.equal(await legacy(),true);
});
