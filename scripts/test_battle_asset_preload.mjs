import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const images=[];const timers=new Map();let next=0;
class FakeImage { constructor(){images.push(this)} decode(){return Promise.resolve()} }
const module={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/app/components/battle/battleAssetPreload.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{module,exports:module.exports,Image:FakeImage,setTimeout:f=>{timers.set(++next,f);return next},clearTimeout:id=>timers.delete(id)});
const load=module.exports.preloadBattleImage;
const first=load('/a');assert.equal(load('/a'),first);assert.equal(images.length,1);
images[0].onload();await first;assert.equal(timers.size,0);assert.equal(load('/a'),first);
const stalled=load('/b');const rejected=assert.rejects(stalled,/timed out/);[...timers.values()][0]();await rejected;
const retry=load('/b');assert.notEqual(stalled,retry);assert.equal(images.length,3);images[2].onload();await retry;
const broken=load('/c');const failed=assert.rejects(broken,/unavailable/);images[3].onerror();await failed;
const retryError=load('/c');images[4].onload();await retryError;
console.log('PASS: decoded image reuse, concurrent request dedupe, timeout retry and image-error retry. Network timing and Safari decode require Preview.');
