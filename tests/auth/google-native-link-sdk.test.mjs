import assert from 'node:assert/strict';
import test from 'node:test';
import { createClient } from '@supabase/supabase-js';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const uid = '00000000-0000-4000-8000-000000000111';
const otherUid = '00000000-0000-4000-8000-000000000222';
const nonce = '00000000-0000-4000-8000-000000000333';
const expiresAt = Math.floor(Date.now()/1000)+3600;
const jwt = id => [Buffer.from('{}').toString('base64url'), Buffer.from(JSON.stringify({sub:id,exp:expiresAt})).toString('base64url'),'test-signature'].join('.');
const user = (id=uid, anonymous=false) => ({ id, aud:'authenticated', created_at:'2026-09-15T00:00:00Z', is_anonymous:anonymous, app_metadata:{}, user_metadata:{}, identities:anonymous ? [] : [{id:'google',provider:'google',user_id:id,identity_data:{sub:'verified-google-sub'}}] });
const session = (id=uid, anonymous=false) => ({access_token:jwt(id),refresh_token:'fixture-refresh',expires_in:3600,token_type:'bearer',user:user(id,anonymous)});
async function sdkFixture(responseKind='ok') {
  const requests=[];
  const client=createClient('https://preview-fixture.invalid','fixture-anon-key',{
    auth:{autoRefreshToken:false,persistSession:false,detectSessionInUrl:false},
    global:{fetch:async (input,init={}) => {
      const url=new URL(String(input));
      const headers=new Headers(init.headers);
      const body=init.body ? JSON.parse(init.body) : null;
      requests.push({path:url.pathname,query:url.search,method:init.method,authorization:headers.get('authorization'),body});
      if(url.pathname==='/auth/v1/user') return Response.json(user(uid,true));
      assert.equal(url.pathname,'/auth/v1/token');
      assert.equal(url.searchParams.get('grant_type'),'id_token');
      if(responseKind==='error') return Response.json({code:'bad_jwt',msg:'Invalid ID token'},{status:400});
      if(responseKind==='malformed') return Response.json({});
      return Response.json(session(responseKind==='wrong-user' ? otherUid : uid));
    }},
  });
  assert.equal((await client.auth.setSession(session(uid,true))).error,null);
  requests.length=0;
  return {client,requests};
}

test('installed Supabase SDK native link sends the exact Google credential, raw nonce and guest bearer to token endpoint', async () => {
  const {client,requests}=await sdkFixture();
  const result=await client.auth.linkIdentity({provider:'google',token:'fixture-google-id-token',nonce});
  assert.equal(result.error,null);
  assert.equal(result.data.user.id,uid);
  assert.equal(requests.length,1);
  assert.deepEqual(requests[0],{path:'/auth/v1/token',query:'?grant_type=id_token',method:'POST',authorization:`Bearer ${jwt(uid)}`,body:{provider:'google',id_token:'fixture-google-id-token',nonce,link_identity:true,gotrue_meta_security:{}}});
});
for(const kind of ['error','malformed']) test(`SDK ${kind} response does not produce a linked user`,async()=>{
  const {client}=await sdkFixture(kind);
  const result=await client.auth.linkIdentity({provider:'google',token:'fixture-google-id-token',nonce});
  assert.ok(result.error);
  assert.equal(result.data.user,null);
  assert.equal(result.data.session,null);
});

// Execute the production callback functions (not a reimplementation). The
// component dependencies are injected to isolate retries from real accounts.
const callback=await readFile(new URL('../../src/app/auth/callback/page.tsx',import.meta.url),'utf8');
const functions=callback.slice(callback.indexOf('  const finishReplacement ='),callback.indexOf('  const confirmReplacement ='));
function callbackFixture(auth,request) {
  const events=[];
  const compiled=ts.transpileModule(functions,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
  const names=['supabase','replacementRequest','saveReplacementGuestSession','setReplacement','clearGoogleReplacementIntent','window','ONBOARDING_AUTH_INTENT_KEY','setGoogleIdToken','setReplacementComplete','saveGoogleReplacementIntent','restoreGuest'];
  const values=[{auth},request,s=>events.push(['saved',s.user.id]),s=>events.push(['state',s?.intent.phase]),()=>events.push(['cleared']),{localStorage:{removeItem:()=>events.push(['removed'])}},'intent',()=>{},v=>events.push(['complete',v]),()=>{},async s=>s];
  const methods=new Function(...names,`${compiled}; return {finishReplacement,linkReplacement};`)(...values);
  return {...methods,events};
}
const state={intent:{userId:uid,intentId:nonce,phase:'LINK'},guest:session(uid,true),currentUsername:'現在',existingUsername:'既存'};
test('production callback blocks a wrong-UID native-link response before finalize',async()=>{
  const {client}=await sdkFixture('wrong-user');
  const requests=[];
  const fixture=callbackFixture(client.auth,async (...args)=>requests.push(args));
  await assert.rejects(()=>fixture.linkReplacement(state,'fixture-google-id-token'),/旧データは削除済み/);
  assert.equal(requests.length,0);
  assert.equal(fixture.events.some(e=>e[0]==='complete'),false);
});
test('linked source retries production finalize after a failure, without guest confirm or relink',async()=>{
  let attempts=0;
  const phases=[];
  const fixture=callbackFixture({
    getUser:async()=>({data:{user:user()},error:null}),
    refreshSession:async()=>({data:{session:session()},error:null}),
    linkIdentity:async()=>{throw new Error('must not relink');},
  },async(_session,body)=>{
    phases.push(body.phase);
    if(++attempts===1) throw new Error('temporary finalize failure');
    return {status:'COMPLETED'};
  });
  await assert.rejects(()=>fixture.finishReplacement(state),/temporary finalize failure/);
  assert.equal(fixture.events.some(e=>e[0]==='cleared'),false);
  assert.equal(await fixture.finishReplacement(state),true);
  assert.deepEqual(phases,['finalize','finalize']);
  assert.equal(fixture.events.filter(e=>e[0]==='saved').length,2);
  assert.equal(fixture.events.filter(e=>e[0]==='cleared').length,1);
  assert.deepEqual(fixture.events.at(-1),['complete',true]);
});
for(const wrong of [user(otherUid),{...user(),identities:[{provider:'email'}]}]) test(`production finalization stops unexpected identity ${wrong.id===uid?'provider':'UID'}`,async()=>{
  const fixture=callbackFixture({getUser:async()=>({data:{user:wrong},error:null})},async()=>assert.fail('must not finalize'));
  await assert.rejects(()=>fixture.finishReplacement(state));
  assert.equal(fixture.events.length,0);
});
