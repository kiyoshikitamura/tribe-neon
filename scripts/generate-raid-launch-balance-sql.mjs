// Generates a separately reviewed, LOCAL ONLY delta. Does not connect to a database.
import fs from 'node:fs';
import {createHash} from 'node:crypto';
const dir='docs/development/raid-launch-balance';fs.mkdirSync(dir,{recursive:true});
const settings=JSON.parse(fs.readFileSync('config/raid-room/launch-balance.json','utf8'));
const bundle=fs.readFileSync('docs/development/raid-production-preparation/bundle/02-raid-delta.sql','utf8').replace(/\r\n/g,'\n');
const extract=name=>{const re=new RegExp('create(?: or replace)? function '+name.replaceAll('.','\\.')+'\\([\\s\\S]*?\\$\\$;','g'),matches=[...bundle.matchAll(re)];if(!matches.length)throw Error(name);return matches.at(-1)[0];};
const once=(s,a,b)=>{if(s.split(a).length!==2)throw Error('Expected one anchor: '+a);return s.replace(a,b);};
const originals={create:extract('public.create_raid_room_v1'),start:extract('public.start_raid_room_battle_v1'),info:extract('private.raid_enemy_info_v1')};
let create=once(originals.create,' v_daily jsonb;',' v_daily jsonb;\n v_launch jsonb;');
create=once(create,' -- Successful same-request receipts above',` select profile into v_launch from public.raid_room_combat_profiles
 where raid_variant_id=p_raid_variant_id and difficulty_id=p_difficulty_id;
 if not found then raise exception 'raid launch profile unavailable' using errcode='55000'; end if;
 v_variant.max_hp := (v_launch->>'maxHp')::bigint;
 -- Successful same-request receipts above`);
const register=" v_room := (public._raid_room_register_v1(v_instance,v_uid,p_difficulty_id)->>'roomId')::uuid;";
create=once(create,register,register+`\n insert into public.raid_room_combat_snapshots(room_id,profile,enemy_snapshot)
 values(v_room,v_launch,public._raid_room_launch_enemy_snapshot_v1(v_launch,v_instance,v_variant.max_hp));`);
let start=originals.start;
const loopStart=' for v_member in select value from jsonb_array_elements_text(v_instance.member_character_ids) loop';
start=once(start,loopStart,` select enemy_snapshot into v_enemy from public.raid_room_combat_snapshots where room_id=p_room_id;
 if not found then
 v_enemy := '[]'::jsonb;
 -- Rooms created before this delta retain the original enemy construction.
`+loopStart);
start=once(start," end loop;\n if jsonb_array_length(v_enemy)<>"," end loop;\n end if;\n if jsonb_array_length(v_enemy)<>");
let info=once(originals.info,"v_rescue jsonb;","v_rescue jsonb; v_launch jsonb; v_unit jsonb;");
info=once(info,' select member_character_ids into v_members',` select profile into v_launch from public.raid_room_combat_profiles where raid_variant_id=p_variant_id and difficulty_id=p_difficulty_id;
 if found then
 select jsonb_agg(x->>'characterId' order by (x->>'slot')::integer) into v_members from jsonb_array_elements(v_launch->'members') x;
 else
 select member_character_ids into v_members`);
info=once(info,'where raid_variant_id=p_variant_id;','where raid_variant_id=p_variant_id;\n end if;');
info=once(info,'  select coalesce((select skill_loadout',`  if v_launch is not null then
   select x into v_unit from jsonb_array_elements(v_launch->'members') x where x->>'characterId'=v_member;
   select jsonb_agg(x->>'skillId' order by n) into v_refs from jsonb_array_elements(v_unit->'skills') with ordinality e(x,n);
  else
  select coalesce((select skill_loadout`);
info=once(info,"'[]'::jsonb) into v_refs;","'[]'::jsonb) into v_refs;\n  end if;");
for(const key of Object.keys(originals)){fs.writeFileSync(`${dir}/${key}-before.sql`,originals[key]+'\n');}
const changed={create,start,info};for(const key of Object.keys(changed)){changed[key]=changed[key].replace(/^create function/,'create or replace function');fs.writeFileSync(`${dir}/${key}-after.sql`,changed[key]+'\n');}
const guard=Object.entries(originals).map(([key,ddl])=>{const body=ddl.split('$$')[1],sig=key==='create'?'public.create_raid_room_v1(text,text,uuid)':key==='start'?'public.start_raid_room_battle_v1(uuid,text[],text,uuid)':'private.raid_enemy_info_v1(text,text)';return ` if (select md5(prosrc) from pg_proc where oid=to_regprocedure('${sig}')) is distinct from '${createHash('md5').update(body).digest('hex')}' then raise exception 'baseline function changed: ${sig}'; end if;`;}).join('\n');
const sql=`-- Raid launch balance, generated from config/raid-room/launch-balance.json.
-- LOCAL REVIEW CANDIDATE. No enable flags, rewards, common masters or existing Rooms updated.
-- Apply only after the fixed preparation bundle; this file does not replace that bundle.
begin;
do $guard$ begin
${guard}
end $guard$;
create table public.raid_room_combat_profiles (
 raid_variant_id text not null references public.canonical_raid_variants(raid_variant_id),
 difficulty_id text not null check(difficulty_id in('beginner','intermediate','advanced','expert')),
 max_hp bigint not null check(max_hp>0), profile jsonb not null,
 primary key(raid_variant_id,difficulty_id),
 check(profile->>'raidVariantId'=raid_variant_id and profile->>'difficultyId'=difficulty_id),
 check((profile->>'maxHp')::bigint=max_hp),
 check(jsonb_typeof(profile->'members')='array' and jsonb_array_length(profile->'members')=5)
);
create table public.raid_room_combat_snapshots (
 room_id uuid primary key references public.raid_rooms(id),profile jsonb not null,enemy_snapshot jsonb not null,
 check(jsonb_array_length(enemy_snapshot)=5)
);
alter table public.raid_room_combat_profiles enable row level security;
alter table public.raid_room_combat_snapshots enable row level security;
revoke all on public.raid_room_combat_profiles,public.raid_room_combat_snapshots from public,anon,authenticated,service_role;
insert into public.raid_room_combat_profiles(raid_variant_id,difficulty_id,max_hp,profile)
select p->>'raidVariantId',p->>'difficultyId',(p->>'maxHp')::bigint,p
from jsonb_array_elements($profiles$${JSON.stringify(settings.profiles)}$profiles$::jsonb) p;

create function public._raid_room_launch_enemy_snapshot_v1(p_profile jsonb,p_instance uuid,p_max_hp bigint)
returns jsonb language plpgsql stable security invoker set search_path=pg_catalog as $$
declare m jsonb; e jsonb; s jsonb; c record; eq record; sk record; k text;
 stats jsonb; equipment jsonb; skills jsonb; refs jsonb; result jsonb:='[]'; categories text[];
begin
 if jsonb_array_length(p_profile->'members')<>5 or p_max_hp<=0 then raise exception 'invalid combat profile'; end if;
 if (select count(distinct x->>'characterId') from jsonb_array_elements(p_profile->'members') x)<>5 then raise exception 'duplicate raid character';end if;
 for m in select x from jsonb_array_elements(p_profile->'members') x order by (x->>'slot')::integer loop
  select * into c from public.canonical_character_master where version='2026-08-21' and character_id=m->>'characterId';
  if not found then raise exception 'raid character unavailable';end if;
  stats:=jsonb_set(m->'baseStats','{hp}',to_jsonb(ceil(p_max_hp::numeric/5)::bigint));
  equipment:='[]';skills:='[]';refs:='[]';categories:='{}';
  for e in select x from jsonb_array_elements(m->'equipment') x loop
   select * into eq from public.canonical_equipment_master where version='2026-08-21' and equipment_id=e->>'equipmentId';
   if not found then raise exception 'raid equipment unavailable';end if;
   if eq.exclusive_character_id is not null and eq.exclusive_character_id<>c.character_id then raise exception 'invalid raid equipment owner';end if;
   if eq.category=any(categories) then raise exception 'duplicate raid equipment slot';end if;
   if (e->>'level')::integer not between 1 and 100 or (e->>'plus')::integer not between 0 and 2 then raise exception 'invalid raid equipment progression';end if;
   categories:=array_append(categories,eq.category);
   foreach k in array array['hp','atk','def','spd','luk'] loop
    stats:=jsonb_set(stats,array[k],to_jsonb((stats->>k)::bigint+public.canonical_equipment_flat_stat(coalesce((eq.base_stats->>k)::integer,0),(e->>'level')::integer,(e->>'plus')::integer)));
   end loop;
   equipment:=equipment||jsonb_build_array(jsonb_build_object('equipmentId',eq.equipment_id,'name',eq.display_name,'category',eq.category,'level',(e->>'level')::integer,'plusValue',(e->>'plus')::integer));
  end loop;
  for s in select x from jsonb_array_elements(m->'skills') x loop
   select * into sk from public.canonical_skill_master where version='2026-08-21' and skill_id=s->>'skillId';
   if not found then raise exception 'raid skill unavailable';end if;
   if (s->>'plus')::integer not between 0 and 10 then raise exception 'invalid raid skill progression';end if;
   skills:=skills||jsonb_build_array(jsonb_build_object('id',sk.skill_id,'name',sk.display_name,'activationType',sk.activation_type,'cooldown',sk.cooldown,'availableFromRound',sk.available_from_round,'target',sk.target,'effects',sk.effects,'exclusiveCharacterId',sk.exclusive_character_id,'plusValue',(s->>'plus')::integer));
   refs:=refs||jsonb_build_array(sk.skill_id);
  end loop;
  if jsonb_array_length(skills) not between 1 and 5 then raise exception 'invalid raid skill count';end if;
  foreach k in array array['hp','atk','def','spd','luk'] loop
   if (stats->>k)::bigint<0 or (stats->>k)::bigint>2147483647 then raise exception 'invalid raid stat';end if;
  end loop;
  result:=result||jsonb_build_array(jsonb_build_object('id','raid_'||p_instance||'_'||(m->>'slot'),'characterId',c.character_id,'name',c.display_name,'team','ENEMY','alignment',c.attribute,'level',(m->>'level')::integer,'awakeningLevel',(m->>'awakeningLevel')::integer,'stats',stats,'equippedSkillRefs',refs,'skills',skills,'equipment',equipment));
 end loop;
 return result;
end $$;
revoke all on function public._raid_room_launch_enemy_snapshot_v1(jsonb,uuid,bigint) from public,anon,authenticated,service_role;

${changed.create}

${changed.start}

${changed.info}

-- CREATE OR REPLACE preserves existing RPC ownership and grants; no flags are enabled.
commit;
`;
fs.writeFileSync('config/raid-room/launch-balance.sql',sql);
fs.writeFileSync(`${dir}/sql-manifest.json`,JSON.stringify({baseline:'f8b104a',profileCount:settings.profiles.length,sha256:createHash('sha256').update(sql).digest('hex'),changedFunctions:Object.keys(changed),scope:'local candidate only; original bundle and common masters unchanged'},null,2));
console.log('Generated local-only launch-balance.sql, profiles='+settings.profiles.length);
