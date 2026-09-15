import fs from 'node:fs';
import crypto from 'node:crypto';
const dir='docs/development/raid-room-persistent';
fs.mkdirSync(dir,{recursive:true});
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const read=n=>fs.readFileSync('docs/development/raid-room-step2/'+n,'utf8').replace(/\r\n/g,'\n');
const payload=read('01-snapshot-dependency.sql')+read('02-raid-delta.sql');
const baseline=read('00-baseline-guard.sql'),postflight=read('04-postflight.sql');
export function build({payload,baseline,postflight}) {
 const digest=hash(payload);
 if(payload.includes('$raid_payload$'))throw Error('delimiter conflict');
 return `-- UTF-8, LF. Default ROLLBACK. Set raid.operator / raid.approval / raid.execution_id in this session first.
begin;
set local statement_timeout='60s';
set local lock_timeout='2s';
set local search_path=pg_catalog,public;
do $guard$
declare old_hash text;
begin
 if session_user <> 'postgres' then raise exception 'ADMIN_CONNECTION_REQUIRED'; end if;
 if nullif(current_setting('raid.operator',true),'') is null or nullif(current_setting('raid.approval',true),'') is null
 or nullif(current_setting('raid.execution_id',true),'') is null then raise exception 'EXECUTION_METADATA_REQUIRED'; end if;
 perform current_setting('raid.execution_id')::uuid;
 if not pg_try_advisory_xact_lock(20260908,250263) then raise exception 'RAID_APPLY_BUSY'; end if;
 if to_regnamespace('deployment_audit_raid_v1') is not null then
   if to_regclass('deployment_audit_raid_v1.applied_changes') is not null then
     select payload_sha256 into old_hash from deployment_audit_raid_v1.applied_changes
       where project_ref='sufvuqdnqohpfzkwxohq' and change_id='raid-room-preview-375a0ad-delta-v1';
     if found then
       if old_hash='${digest}' then raise exception 'ALREADY_APPLIED';
       else raise exception 'CHECKSUM_CONFLICT'; end if;
     end if;
   end if;
   raise exception 'AUDIT_SCHEMA_EXISTS_WITHOUT_EXPECTED_RECORD';
 end if;
end $guard$;
${baseline}
create schema deployment_audit_raid_v1 authorization postgres;
revoke all on schema deployment_audit_raid_v1 from public,anon,authenticated,service_role;
create table deployment_audit_raid_v1.applied_changes (
 project_ref text not null, change_id text not null,
 payload_sha256 text not null check(payload_sha256 ~ '^[0-9a-f]{64}$'),
 source_commit text not null, validation_commit text not null,
 execution_id uuid not null unique, operator_identity text not null, approval_reference text not null,
 baseline_sha256 text not null, postflight jsonb not null,
 database_role name not null default session_user,
 transaction_id xid8 not null default pg_current_xact_id(),
 recorded_at timestamptz not null default clock_timestamp(),
 primary key(project_ref,change_id)
);
alter table deployment_audit_raid_v1.applied_changes enable row level security;
revoke all on deployment_audit_raid_v1.applied_changes from public,anon,authenticated,service_role;
do $execute$
declare payload text := $raid_payload$${payload}$raid_payload$;
begin
 if encode(sha256(convert_to(payload,'UTF8')),'hex') <> '${digest}' then raise exception 'PAYLOAD_HASH_MISMATCH'; end if;
 execute payload;
end $execute$;
${postflight}
insert into deployment_audit_raid_v1.applied_changes
(project_ref,change_id,payload_sha256,source_commit,validation_commit,execution_id,operator_identity,approval_reference,baseline_sha256,postflight)
values ('sufvuqdnqohpfzkwxohq','raid-room-preview-375a0ad-delta-v1','${digest}',
'375a0ad642a81e9db10a9379f03e5e5f77fb4562','391e39766e13e4e9b4c23398e345ae5240c9aeb2',
current_setting('raid.execution_id')::uuid,current_setting('raid.operator'),current_setting('raid.approval'),
'${hash(baseline)}','{"status":"PASS","checks":"04-postflight.sql","postflight_sha256":"${hash(postflight)}"}');
select * from deployment_audit_raid_v1.applied_changes;
notify pgrst,'reload schema';
rollback;
`;
}
const sql=build({payload,baseline,postflight});
fs.writeFileSync(dir+'/persistent-apply.sql',sql);
fs.writeFileSync(dir+'/manifest.json',JSON.stringify({encoding:'UTF-8 without BOM',line_endings:'LF',change_id:'raid-room-preview-375a0ad-delta-v1',payload_sha256:hash(payload),baseline_sha256:hash(baseline),postflight_sha256:hash(postflight),driver_sha256:hash(sql),terminal:'ROLLBACK'},null,2)+'\n');
