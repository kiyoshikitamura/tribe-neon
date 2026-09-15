-- Read-only Preview function definitions captured 2026-09-13. No user data.
CREATE OR REPLACE FUNCTION public.execute_asset_gacha(p_user_id uuid, p_gacha_id text, p_pull_count integer, p_currency_type text, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_history record;
BEGIN
 IF auth.uid() IS NULL OR auth.uid()<>p_user_id THEN RAISE EXCEPTION 'not authorized'; END IF;
 IF p_currency_type='free' THEN
   SELECT * INTO v_history FROM public.gacha_execution_history
   WHERE user_id=p_user_id AND request_id=p_request_id;
   IF FOUND THEN
     IF v_history.gacha_id IS DISTINCT FROM p_gacha_id
        OR v_history.payment_source IS DISTINCT FROM p_currency_type
        OR v_history.pull_count IS DISTINCT FROM p_pull_count THEN
       RAISE EXCEPTION 'request_id was already used for a different gacha request';
     END IF;
     IF v_history.status='COMPLETED' AND v_history.result_payload IS NOT NULL THEN
       RETURN v_history.result_payload;
     END IF;
   END IF;
   RAISE EXCEPTION 'DAILY_FREE_RATE_VERSION_MISMATCH: reload required' USING ERRCODE='22023';
 END IF;
 RETURN public.execute_asset_gacha(p_user_id,p_gacha_id,p_pull_count,p_currency_type,p_request_id,NULL);
END;
$function$

;
CREATE OR REPLACE FUNCTION public.execute_asset_gacha(p_user_id uuid, p_gacha_id text, p_pull_count integer, p_currency_type text, p_request_id uuid, p_rate_version text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_gacha record;
  v_user record;
  v_existing record;
  v_history record;
  v_result jsonb := '[]'::jsonb;
  v_response jsonb;
  v_item_id text;
  v_rarity text;
  v_ticket_item_id text;
  v_cost integer := 0;
  v_pity_before integer := 0;
  v_pity_after integer := 0;
  v_today date := (now() at time zone 'Asia/Tokyo')::date;
  v_index integer;
  v_inserted integer;
  v_is_skill boolean;
  v_is_special boolean;
begin
  if auth.uid() is null or auth.uid() <> p_user_id then raise exception 'not authorized'; end if;
  -- 確率改定前の完了要求は、版が古くても保存結果を返す。再抽選しない。
  if p_currency_type='free' then
    select * into v_history from public.gacha_execution_history
    where user_id=p_user_id and request_id=p_request_id;
    if found then
      if v_history.gacha_id is distinct from p_gacha_id
         or v_history.payment_source is distinct from p_currency_type
         or v_history.pull_count is distinct from p_pull_count then
        raise exception 'request_id was already used for a different gacha request';
      end if;
      if v_history.status='COMPLETED' and v_history.result_payload is not null then
        return v_history.result_payload;
      end if;
    end if;
  end if;
  if p_currency_type = 'free' and p_rate_version is distinct from 'daily-free-2026-09-12-v1' then
    raise exception 'DAILY_FREE_RATE_VERSION_MISMATCH: reload required' using errcode='22023';
  end if;
  if p_request_id is null then raise exception 'request_id is required'; end if;
  if p_pull_count is null or p_pull_count < 1 or p_pull_count > 10 then raise exception 'invalid pull count'; end if;

  select id, gacha_type, cost_cash, cost_diamond into v_gacha
  from public.gacha_masters
  where id = p_gacha_id and gacha_type in ('SKILL', 'EQUIPMENT');
  if not found then raise exception 'asset gacha not found'; end if;
  if p_gacha_id not in ('SKILL_NORMAL', 'SKILL_SPECIAL', 'EQUIP_NORMAL', 'EQUIP_SPECIAL') then
    raise exception 'unsupported asset gacha';
  end if;
  v_is_skill := v_gacha.gacha_type = 'SKILL';
  v_is_special := p_gacha_id in ('SKILL_SPECIAL', 'EQUIP_SPECIAL');
  if v_is_special and not exists (
    select 1 from public.feature_operating_states
    where feature_key = 'SPECIAL_GACHA' and state = 'OPEN'
  ) then raise exception 'special gacha is closed'; end if;
  if p_currency_type = 'free' and (v_is_special or p_pull_count <> 10) then
    raise exception 'daily free is only available as a normal ten-pull';
  end if;
  if p_currency_type not in ('free', 'cash', 'diamonds', 'ticket') then raise exception 'invalid currency type'; end if;

  v_ticket_item_id := case
    when v_is_skill and v_is_special then 'SPECIAL_TICKET_SKILL'
    when v_is_skill then 'NORMAL_GACHA_TICKET_SKILL'
    when v_is_special then 'SPECIAL_TICKET_EQUIPMENT'
    else 'NORMAL_GACHA_TICKET_EQUIPMENT'
  end;
  v_cost := case p_currency_type
    when 'cash' then v_gacha.cost_cash * p_pull_count
    when 'diamonds' then v_gacha.cost_diamond * p_pull_count
    when 'ticket' then p_pull_count
    else 0 end;
  select coalesce(current_points, 0) into v_pity_before
  from public.user_gacha_pity_points
  where user_id = p_user_id and pity_master_id = 'pity_special_common';
  v_pity_before := coalesce(v_pity_before, 0);

  insert into public.gacha_execution_history (
    user_id, request_id, gacha_id, payment_source, pull_count,
    ticket_item_id, cost_amount, pity_before, pity_after
  ) values (
    p_user_id, p_request_id, p_gacha_id, p_currency_type, p_pull_count,
    case when p_currency_type = 'ticket' then v_ticket_item_id end,
    v_cost, v_pity_before, v_pity_before
  ) on conflict (user_id, request_id) do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then
    select * into v_history from public.gacha_execution_history
    where user_id = p_user_id and request_id = p_request_id for update;
    if v_history.gacha_id <> p_gacha_id
       or v_history.payment_source <> p_currency_type
       or v_history.pull_count <> p_pull_count then
      raise exception 'request_id was already used for a different gacha request';
    end if;
    if v_history.status = 'COMPLETED' and v_history.result_payload is not null then return v_history.result_payload; end if;
    raise exception 'gacha request is already in progress';
  end if;

  if p_currency_type = 'free' then
    insert into public.user_daily_gacha_claims (user_id, gacha_type, last_claimed_date)
    values (p_user_id, v_gacha.gacha_type, v_today)
    on conflict (user_id, gacha_type) do update
      set last_claimed_date = excluded.last_claimed_date, updated_at = now()
      where public.user_daily_gacha_claims.last_claimed_date < v_today;
    if not found then raise exception 'daily free gacha already claimed'; end if;
  elsif p_currency_type = 'cash' then
    update public.users set cash = cash - v_cost where id = p_user_id and cash >= v_cost;
    if not found then raise exception 'insufficient gacha currency'; end if;
  elsif p_currency_type = 'diamonds' then
    update public.users set neon_diamonds = neon_diamonds - v_cost
    where id = p_user_id and neon_diamonds >= v_cost;
    if not found then raise exception 'insufficient gacha currency'; end if;
  else
    update public.user_items set quantity = quantity - v_cost, updated_at = now()
    where user_id = p_user_id and item_id = v_ticket_item_id and quantity >= v_cost;
    if not found then raise exception 'insufficient gacha tickets'; end if;
  end if;

  for v_index in 1..p_pull_count loop
    v_rarity := case when p_currency_type='free'
      then public.draw_daily_free_gacha_rarity(p_gacha_id)
      else public.draw_gacha_rarity(p_gacha_id) end;
    v_item_id := public.draw_gacha_item(p_gacha_id, v_rarity);
    if v_rarity is null or v_item_id is null then raise exception 'gacha bucket is empty'; end if;

    if v_is_skill then
      select id, plus_val into v_existing from public.user_skills
      where user_id = p_user_id and skill_card_id = v_item_id for update;
      if found and coalesce(v_existing.plus_val, 0) < 10 then
        update public.user_skills set plus_val = coalesce(plus_val, 0) + 1 where id = v_existing.id;
        v_result := v_result || jsonb_build_array(jsonb_build_object(
          'type', 'SKILL', 'item_id', v_item_id, 'rarity', v_rarity, 'outcome', 'limit_break', 'plus_val', coalesce(v_existing.plus_val, 0) + 1));
      elsif found then
        insert into public.user_items (user_id, item_id, quantity)
        values (p_user_id, 'SKILL_MANUAL', 2)
        on conflict (user_id, item_id) do update
          set quantity = public.user_items.quantity + 2, updated_at = now();
        v_result := v_result || jsonb_build_array(jsonb_build_object(
          'type', 'SKILL', 'item_id', v_item_id, 'rarity', v_rarity, 'outcome', 'converted', 'conversion_item_id', 'SKILL_MANUAL', 'conversion_quantity', 2));
      else
        insert into public.user_skills (user_id, skill_card_id, plus_val)
        values (p_user_id, v_item_id, 0);
        v_result := v_result || jsonb_build_array(jsonb_build_object(
          'type', 'SKILL', 'item_id', v_item_id, 'rarity', v_rarity, 'outcome', 'new'));
      end if;
    else
      insert into public.user_equipments (user_id, equipment_id, level, plus_val, random_options)
      values (p_user_id, v_item_id, 1, 0, '[]'::jsonb);
      v_result := v_result || jsonb_build_array(jsonb_build_object(
        'type', 'EQUIPMENT', 'item_id', v_item_id, 'rarity', v_rarity, 'outcome', 'new'));
    end if;
  end loop;

  if p_currency_type <> 'free' and v_is_special then
    insert into public.user_gacha_pity_points (user_id, pity_master_id, current_points)
    values (p_user_id, 'pity_special_common', p_pull_count)
    on conflict (user_id, pity_master_id) do update
      set current_points = public.user_gacha_pity_points.current_points + p_pull_count,
          updated_at = now();
    v_pity_after := v_pity_before + p_pull_count;
  else
    v_pity_after := v_pity_before;
  end if;

  perform public.record_funnel_milestone(p_user_id, 'first_gacha',
    jsonb_build_object('gachaId', p_gacha_id, 'pullCount', p_pull_count));
  select cash, neon_diamonds into v_user from public.users where id = p_user_id;
  v_response := jsonb_build_object(
    'status', 'success', 'request_id', p_request_id, 'results', v_result,
    'cash', v_user.cash, 'diamonds', v_user.neon_diamonds,
    'pity_before', v_pity_before, 'pity_after', v_pity_after);
  if p_currency_type='free' then
    v_response := v_response || jsonb_build_object('rate_version',p_rate_version);
  end if;
  update public.gacha_execution_history
  set pity_after = v_pity_after, result_payload = v_response,
      status = 'COMPLETED', completed_at = now()
  where user_id = p_user_id and request_id = p_request_id;
  return v_response;
end;
$function$

;
CREATE OR REPLACE FUNCTION public.execute_character_gacha(p_user_id uuid, p_gacha_id text, p_pull_count integer, p_currency_type text, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_history record;
BEGIN
 IF auth.uid() IS NULL OR auth.uid()<>p_user_id THEN RAISE EXCEPTION 'not authorized'; END IF;
 IF p_currency_type='free' THEN
   SELECT * INTO v_history FROM public.gacha_execution_history
   WHERE user_id=p_user_id AND request_id=p_request_id;
   IF FOUND THEN
     IF v_history.gacha_id IS DISTINCT FROM p_gacha_id
        OR v_history.payment_source IS DISTINCT FROM p_currency_type
        OR v_history.pull_count IS DISTINCT FROM p_pull_count THEN
       RAISE EXCEPTION 'request_id was already used for a different gacha request';
     END IF;
     IF v_history.status='COMPLETED' AND v_history.result_payload IS NOT NULL THEN
       RETURN v_history.result_payload;
     END IF;
   END IF;
   RAISE EXCEPTION 'DAILY_FREE_RATE_VERSION_MISMATCH: reload required' USING ERRCODE='22023';
 END IF;
 RETURN public.execute_character_gacha(p_user_id,p_gacha_id,p_pull_count,p_currency_type,p_request_id,NULL);
END;
$function$

;
CREATE OR REPLACE FUNCTION public.execute_character_gacha(p_user_id uuid, p_gacha_id text, p_pull_count integer, p_currency_type text, p_request_id uuid, p_rate_version text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_gacha record;
  v_user record;
  v_existing record;
  v_history record;
  v_result jsonb := '[]'::jsonb;
  v_response jsonb;
  v_item_id text;
  v_rarity text;
  v_ticket_item_id text;
  v_cost integer := 0;
  v_pity_before integer := 0;
  v_pity_after integer := 0;
  v_today date := (now() at time zone 'Asia/Tokyo')::date;
  v_index integer;
  v_inserted integer;
  v_is_special boolean;
  v_progress jsonb;
begin
  if auth.uid() is null or auth.uid() <> p_user_id then
    raise exception 'not authorized';
  end if;
  -- 確率改定前の完了要求は、版が古くても保存結果を返す。再抽選しない。
  if p_currency_type='free' then
    select * into v_history from public.gacha_execution_history
    where user_id=p_user_id and request_id=p_request_id;
    if found then
      if v_history.gacha_id is distinct from p_gacha_id
         or v_history.payment_source is distinct from p_currency_type
         or v_history.pull_count is distinct from p_pull_count then
        raise exception 'request_id was already used for a different gacha request';
      end if;
      if v_history.status='COMPLETED' and v_history.result_payload is not null then
        return v_history.result_payload;
      end if;
    end if;
  end if;
  if p_currency_type = 'free' and p_rate_version is distinct from 'daily-free-2026-09-12-v1' then
    raise exception 'DAILY_FREE_RATE_VERSION_MISMATCH: reload required' using errcode='22023';
  end if;
  if p_request_id is null then raise exception 'request_id is required'; end if;
  if p_pull_count is null or p_pull_count < 1 or p_pull_count > 10 then
    raise exception 'invalid pull count';
  end if;

  select id, gacha_type, cost_cash, cost_diamond into v_gacha
  from public.gacha_masters
  where id = p_gacha_id and gacha_type = 'CHARACTER';
  if not found then raise exception 'character gacha not found'; end if;

  v_is_special := p_gacha_id = 'CHAR_SPECIAL';
  if p_gacha_id not in ('CHAR_NORMAL', 'CHAR_SPECIAL') then
    raise exception 'unsupported character gacha';
  end if;
  if v_is_special and not exists (
    select 1 from public.feature_operating_states
    where feature_key = 'SPECIAL_GACHA' and state = 'OPEN'
  ) then
    raise exception 'special gacha is closed';
  end if;
  if p_currency_type = 'free' and (p_gacha_id <> 'CHAR_NORMAL' or p_pull_count <> 10) then
    raise exception 'daily free is only available as a normal ten-pull';
  end if;
  if p_currency_type not in ('free', 'cash', 'diamonds', 'ticket') then
    raise exception 'invalid currency type';
  end if;

  v_ticket_item_id := case when v_is_special then 'SPECIAL_TICKET_CHARACTER' else 'NORMAL_GACHA_TICKET_CHARACTER' end;
  v_cost := case p_currency_type
    when 'cash' then v_gacha.cost_cash * p_pull_count
    when 'diamonds' then v_gacha.cost_diamond * p_pull_count
    when 'ticket' then p_pull_count
    else 0 end;
  select coalesce(current_points, 0) into v_pity_before
  from public.user_gacha_pity_points
  where user_id = p_user_id and pity_master_id = 'pity_special_common';
  v_pity_before := coalesce(v_pity_before, 0);

  insert into public.gacha_execution_history (
    user_id, request_id, gacha_id, payment_source, pull_count,
    ticket_item_id, cost_amount, pity_before, pity_after
  ) values (
    p_user_id, p_request_id, p_gacha_id, p_currency_type, p_pull_count,
    case when p_currency_type = 'ticket' then v_ticket_item_id end,
    v_cost, v_pity_before, v_pity_before
  ) on conflict (user_id, request_id) do nothing;
  get diagnostics v_inserted = row_count;

  if v_inserted = 0 then
    select * into v_history from public.gacha_execution_history
    where user_id = p_user_id and request_id = p_request_id for update;
    if v_history.gacha_id <> p_gacha_id
       or v_history.payment_source <> p_currency_type
       or v_history.pull_count <> p_pull_count then
      raise exception 'request_id was already used for a different gacha request';
    end if;
    if v_history.status = 'COMPLETED' and v_history.result_payload is not null then
      return v_history.result_payload;
    end if;
    raise exception 'gacha request is already in progress';
  end if;

  if p_currency_type = 'free' then
    insert into public.user_daily_gacha_claims (user_id, gacha_type, last_claimed_date)
    values (p_user_id, 'CHARACTER', v_today)
    on conflict (user_id, gacha_type) do update
      set last_claimed_date = excluded.last_claimed_date, updated_at = now()
      where public.user_daily_gacha_claims.last_claimed_date < v_today;
    if not found then raise exception 'daily free gacha already claimed'; end if;
  elsif p_currency_type = 'cash' then
    update public.users set cash = cash - v_cost where id = p_user_id and cash >= v_cost;
    if not found then raise exception 'insufficient gacha currency'; end if;
  elsif p_currency_type = 'diamonds' then
    update public.users set neon_diamonds = neon_diamonds - v_cost
    where id = p_user_id and neon_diamonds >= v_cost;
    if not found then raise exception 'insufficient gacha currency'; end if;
  else
    update public.user_items set quantity = quantity - v_cost, updated_at = now()
    where user_id = p_user_id and item_id = v_ticket_item_id and quantity >= v_cost;
    if not found then raise exception 'insufficient gacha tickets'; end if;
  end if;

  for v_index in 1..p_pull_count loop
    v_rarity := case when p_currency_type='free'
      then public.draw_daily_free_gacha_rarity(p_gacha_id)
      else public.draw_gacha_rarity(p_gacha_id) end;
    v_item_id := public.draw_gacha_item(p_gacha_id, v_rarity);
    if v_rarity is null or v_item_id is null then raise exception 'gacha bucket is empty'; end if;

    select id, awakening_level into v_existing
    from public.user_characters
    where user_id = p_user_id and character_id = v_item_id
    for update;

    if found and coalesce(v_existing.awakening_level, 0) < 5 then
      v_progress := public.apply_character_awakening_equivalent(p_user_id, v_existing.id, 1);
      v_result := v_result || jsonb_build_array(jsonb_build_object(
        'type', 'CHARACTER', 'character_id', v_item_id, 'rarity', v_rarity,
        'outcome', v_progress->>'outcome',
        'awakening_progress_added', 1,
        'awakening_level', (v_progress->>'awakening_level')::integer,
        'awakening_progress', (v_progress->>'awakening_progress')::integer,
        'awakening_required', (v_progress->>'awakening_required')::integer));
    elsif found then
      insert into public.user_items (user_id, item_id, quantity)
      values (p_user_id, 'AWAKENING_BOOK', 1)
      on conflict (user_id, item_id) do update
        set quantity = public.user_items.quantity + 1, updated_at = now();
      v_result := v_result || jsonb_build_array(jsonb_build_object(
        'type', 'CHARACTER', 'character_id', v_item_id, 'rarity', v_rarity, 'outcome', 'converted', 'converted_item_id', 'AWAKENING_BOOK', 'converted_quantity', 1));
    else
      insert into public.user_characters (user_id, character_id, level, awakening_level)
      values (p_user_id, v_item_id, 1, 0);
      v_result := v_result || jsonb_build_array(jsonb_build_object(
        'type', 'CHARACTER', 'character_id', v_item_id, 'rarity', v_rarity, 'outcome', 'new'));
    end if;
  end loop;

  if p_currency_type <> 'free' and v_is_special then
    insert into public.user_gacha_pity_points (user_id, pity_master_id, current_points)
    values (p_user_id, 'pity_special_common', p_pull_count)
    on conflict (user_id, pity_master_id) do update
      set current_points = public.user_gacha_pity_points.current_points + p_pull_count,
          updated_at = now();
    v_pity_after := v_pity_before + p_pull_count;
  else
    v_pity_after := v_pity_before;
  end if;

  perform public.record_funnel_milestone(p_user_id, 'first_gacha',
    jsonb_build_object('gachaId', p_gacha_id, 'pullCount', p_pull_count));
  select cash, neon_diamonds into v_user from public.users where id = p_user_id;
  v_response := jsonb_build_object(
    'status', 'success', 'request_id', p_request_id, 'results', v_result,
    'cash', v_user.cash, 'diamonds', v_user.neon_diamonds,
    'pity_before', v_pity_before, 'pity_after', v_pity_after);
  if p_currency_type='free' then
    v_response := v_response || jsonb_build_object('rate_version',p_rate_version);
  end if;
  update public.gacha_execution_history
  set pity_after = v_pity_after, result_payload = v_response,
      status = 'COMPLETED', completed_at = now()
  where user_id = p_user_id and request_id = p_request_id;
  return v_response;
end;
$function$
;
