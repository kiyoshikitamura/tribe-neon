-- LOCAL PROPOSAL ONLY. Not a migration and not approved for deployment.
-- Enroll only inside initialize_current_player's NEW-user transaction.
create schema if not exists private;
create table private.initial_equipment_receipts (
 user_id uuid primary key references public.users(id) on delete cascade,
 state text not null default 'PENDING' check(state in ('PENDING','GRANTED','SKIPPED')),
 equipment_ids uuid[] not null default '{}',
 created_at timestamptz not null default now(), completed_at timestamptz
);
alter table private.initial_equipment_receipts enable row level security;
revoke all on private.initial_equipment_receipts from public,anon,authenticated;

create function private.ensure_initial_equipment_v1() returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 actor uuid := auth.uid(); receipt private.initial_equipment_receipts;
 owned_character uuid; issued uuid[];
begin
 if actor is null then raise exception 'authentication required' using errcode='42501'; end if;
 -- Match actor-row serialization used by reset/economic mutations.
 perform 1 from public.users where id=actor for update;
 if not found then raise exception 'player profile required' using errcode='P0002'; end if;
 select * into receipt from private.initial_equipment_receipts where user_id=actor for update;
 if not found then return jsonb_build_object('status','not_eligible'); end if;
 if receipt.state<>'PENDING' then return jsonb_build_object('status',lower(receipt.state),'equipmentIds',receipt.equipment_ids); end if;
 -- A nonempty inventory cannot establish first-grant eligibility.
 if exists(select from public.user_equipments where user_id=actor) then
   update private.initial_equipment_receipts set state='SKIPPED',completed_at=now() where user_id=actor;
   return jsonb_build_object('status','skipped');
 end if;
 if not exists(select from public.gacha_execution_history where user_id=actor and status='COMPLETED'
    and result_payload->'tutorial'='true'::jsonb) then
   return jsonb_build_object('status','pending');
 end if;
 select id into owned_character from public.user_characters where user_id=actor order by created_at,id limit 1 for update;
 if owned_character is null then return jsonb_build_object('status','pending'); end if;
 if (select count(*) from public.canonical_equipment_master where version='2026-08-21'
     and equipment_id=any(array['WEAPON_001','HEAD_001','BODY_001','LEGS_001','ACCESSORY_001']))<>5 then
   raise exception 'initial equipment master unavailable' using errcode='55000';
 end if;
 with inserted as (
   insert into public.user_equipments(user_id,equipment_id,level,plus_val,equipped_character_id,slot_index,random_options)
   select actor,equipment_id,1,0,owned_character::text,slot_index,
     '[{"name":"クリティカル率","val":"+5%","unlocked":true},{"name":"命中率","val":"+8%","unlocked":false},{"name":"回避率","val":"+6%","unlocked":false},{"name":"防御貫通力","val":"+12%","unlocked":false}]'::jsonb
   from (values('WEAPON_001',0),('HEAD_001',2),('BODY_001',3),('LEGS_001',4),('ACCESSORY_001',5)) as fixed(equipment_id,slot_index)
   returning id
 ) select array_agg(id order by id) into issued from inserted;
 update private.initial_equipment_receipts set state='GRANTED',equipment_ids=issued,completed_at=now() where user_id=actor;
 return jsonb_build_object('status','granted','equipmentIds',issued);
end;
$$;
revoke all on function private.ensure_initial_equipment_v1() from public,anon;
grant usage on schema private to authenticated;
grant execute on function private.ensure_initial_equipment_v1() to authenticated;
create function public.ensure_initial_equipment_v1() returns jsonb
language sql security invoker set search_path='' as $$select private.ensure_initial_equipment_v1()$$;
revoke all on function public.ensure_initial_equipment_v1() from public,anon;
grant execute on function public.ensure_initial_equipment_v1() to authenticated;
