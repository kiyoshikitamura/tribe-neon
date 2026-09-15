import fs from 'node:fs';
import {parseEnv} from 'node:util';
import {resolve} from 'node:path';
export const ref='sufvuqdnqohpfzkwxohq';
export const prior=resolve('../../2026-09-08/2-375a0ad-21-raid-migration-14');
const env=parseEnv(fs.readFileSync(resolve(prior,'.env.raid-preview.local'),'utf8'));
export const url=env.NEXT_PUBLIC_SUPABASE_URL;
if(new URL(url).hostname!==`${ref}.supabase.co`)throw Error('Wrong QA project');
const key=env.NEXT_PUBLIC_SUPABASE_ANON_KEY;if(!key)throw Error('Missing public client key');
const credentials=JSON.parse(fs.readFileSync(resolve(prior,'outputs/raid-device-credentials.private.json')));
export const roles=['host','normal','rescue'];
export async function login(role){const user=credentials.users.find(x=>x.role===role);if(!user)throw Error('Unknown QA role');const r=await fetch(`${url}/auth/v1/token?grant_type=password`,{method:'POST',headers:{apikey:key,'Content-Type':'application/json'},body:JSON.stringify({email:user.email,password:user.password})});const data=await r.json();if(!r.ok||data.user?.id!==user.id)throw Error(`QA login failed: ${role} status ${r.status}`);return {role,id:user.id,session:data};}
export async function request(auth,path,args){const r=await fetch(`${url}${path}`,{method:args===undefined?'GET':'POST',headers:{apikey:key,Authorization:`Bearer ${auth?.session.access_token??key}`,'Content-Type':'application/json'},...(args===undefined?{}:{body:JSON.stringify(args)})});let data;try{data=await r.json();}catch{data=null;}return {status:r.status,data};}
export const rpc=(auth,name,args={})=>request(auth,`/rest/v1/rpc/${name}`,args);
export function safeError(result){return {status:result.status,code:result.data?.code??null};}
export function save(name,data){fs.mkdirSync('outputs/raid-step6',{recursive:true});fs.writeFileSync(`outputs/raid-step6/${name}.json`,JSON.stringify(data,null,2));}
export function credentialsFor(role){const u=credentials.users.find(x=>x.role===role);return {email:u.email,password:u.password,id:u.id};}
