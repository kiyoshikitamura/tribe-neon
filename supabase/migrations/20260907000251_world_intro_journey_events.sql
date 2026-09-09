-- 登録前Journey観測イベントの許可集合のみを拡張する。
-- 既存イベント・metadata・idempotency・RLS・権限・Identityを維持する。

begin;
set local lock_timeout = '5s';

alter table public.kpi_acquisition_journey_facts
  add constraint kpi_acquisition_journey_facts_event_type_v251_check
  check (event_type in ('TITLE_ARRIVED','TAP_TO_START','WORLD_INTRO_STARTED','WORLD_INTRO_COMPLETED','NAME_COMPLETED','WORLD_INTRO_VIEWED','WORLD_INTRO_SKIPPED')) not valid;
alter table public.kpi_acquisition_journey_facts
  validate constraint kpi_acquisition_journey_facts_event_type_v251_check;
alter table public.kpi_acquisition_journey_facts
  drop constraint kpi_acquisition_journey_facts_event_type_check;
alter table public.kpi_acquisition_journey_facts
  rename constraint kpi_acquisition_journey_facts_event_type_v251_check
  to kpi_acquisition_journey_facts_event_type_check;

CREATE OR REPLACE FUNCTION public.record_kpi_acquisition_observation_v1(p_token text, p_event_type text, p_idempotency_key text, p_metadata jsonb DEFAULT '{}'::jsonb, p_source text DEFAULT 'web_v1'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_journey uuid; v_row public.kpi_acquisition_journey_facts%rowtype;
begin
  if p_token is null or p_token !~ '^[a-f0-9]{64}$'
     or p_event_type is null or p_event_type not in
       ('TITLE_ARRIVED','TAP_TO_START','WORLD_INTRO_STARTED','WORLD_INTRO_COMPLETED','NAME_COMPLETED','WORLD_INTRO_VIEWED','WORLD_INTRO_SKIPPED')
     or p_idempotency_key is null or p_idempotency_key !~ '^[A-Za-z0-9_.:-]{1,128}$'
     or p_source is null or p_source not in ('web_v1','server_v1','qa_v1')
     or not public.kpi_v249_metadata_valid(p_metadata)
     or (auth.jwt()->>'role' is distinct from 'service_role' and (p_source<>'web_v1' or p_metadata ? 'qa')) then
    raise exception 'Invalid acquisition observation' using errcode = '22023';
  end if;
  select journey_id into v_journey from public.kpi_acquisition_journeys
  where journey_token_hash = encode(sha256(convert_to(p_token,'UTF8')),'hex') for update;
  if v_journey is null then raise exception 'Unknown journey' using errcode = '42501'; end if;
  select * into v_row from public.kpi_acquisition_journey_facts
  where journey_id = v_journey and idempotency_key = p_idempotency_key;
  if found then
    if v_row.event_type is distinct from p_event_type or v_row.source is distinct from p_source
       or v_row.metadata is distinct from p_metadata then
      raise exception 'Conflicting observation retry' using errcode = '23505';
    end if;
    return v_row.id;
  end if;
  -- No inferred ordering and no writes to Game Start subjects. NAME_COMPLETED
  -- is an observation; the successful binding/registered_at remains authority.
  insert into public.kpi_acquisition_journey_facts(journey_id,event_type,idempotency_key,metadata,source)
  values(v_journey,p_event_type,p_idempotency_key,p_metadata,p_source) returning * into v_row;
  return v_row.id;
end;
$function$
;

commit;
