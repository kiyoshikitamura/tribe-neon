import test,{afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {renderHook,act,cleanup} from '@testing-library/react';
import {useProfileRequestState} from '../../src/app/context/hooks/useProfileRequestState';
afterEach(cleanup);
type Profile={id:string,status:string};
const loading=(id:string):Profile=>({id,status:'loading'});
const ready=(id:string):Profile=>({id,status:'ready'});
function deferred(){let resolve!:(p:Profile)=>void;const promise=new Promise<Profile>(r=>resolve=r);return {promise,resolve};}
function start(result:any,id:string){const response=deferred();act(()=>{const request=result.current.begin(loading(id));void response.promise.then(request.publish);});return response;}
async function finish(response:ReturnType<typeof deferred>,id:string){await act(async()=>{response.resolve(ready(id));await response.promise;});}
test('close while loading ignores late success',async()=>{const {result}=renderHook(()=>useProfileRequestState<Profile>('viewer:raid'));const a=start(result,'A');act(()=>result.current.set(null));await finish(a,'A');assert.equal(result.current.value,null);});
test('A close B; late A cannot overwrite B',async()=>{const {result}=renderHook(()=>useProfileRequestState<Profile>('viewer:raid'));const a=start(result,'A');act(()=>result.current.set(null));const b=start(result,'B');await finish(b,'B');await finish(a,'A');assert.deepEqual(result.current.value,ready('B'));});
test('direct A to B switch and same-user retry discard old results',async()=>{const {result}=renderHook(()=>useProfileRequestState<Profile>('viewer:raid'));const a=start(result,'A');const b=start(result,'B');const retry=start(result,'B');await finish(b,'B');assert.deepEqual(result.current.value,loading('B'));await finish(retry,'B');await finish(a,'A');assert.deepEqual(result.current.value,ready('B'));});
for(const scope of ['viewer:home','other:raid','signed-out:raid'])test('pending profile discarded on scope '+scope,async()=>{const {result,rerender}=renderHook(({scope})=>useProfileRequestState<Profile>(scope),{initialProps:{scope:'viewer:raid'}});const a=start(result,'A');rerender({scope});await finish(a,'A');assert.equal(result.current.value,null);});
test('explicit auth reset invalidates before React rerender',async()=>{const {result}=renderHook(()=>useProfileRequestState<Profile>('viewer:raid'));const a=start(result,'A');act(()=>result.current.set(null));await finish(a,'A');assert.equal(result.current.value,null);});
test('late error cannot reopen dismissed profile',()=>{const {result}=renderHook(()=>useProfileRequestState<Profile>('viewer:raid'));let request:any;act(()=>{request=result.current.begin(loading('A'));result.current.set(null);request.publish({id:'A',status:'error'});});assert.equal(result.current.value,null);assert.equal(request.isCurrent(),false);});
test('DM close keeps closed; subsequent open works',async()=>{const {result}=renderHook(()=>useProfileRequestState<Profile>('viewer:raid'));const a=start(result,'A');await finish(a,'A');act(()=>result.current.set(null));assert.equal(result.current.value,null);const b=start(result,'B');await finish(b,'B');assert.deepEqual(result.current.value,ready('B'));});
test('unmount invalidates the pending request',()=>{const {result,unmount}=renderHook(()=>useProfileRequestState<Profile>('viewer:raid'));let request:any;act(()=>{request=result.current.begin(loading('A'));});unmount();assert.equal(request.isCurrent(),false);request.publish(ready('A'));});
