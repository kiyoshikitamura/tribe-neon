-- GAME03 / TRIBE NEON
-- Quest: free instant completion until first clear.
-- Scope is limited to complete_patrol_instantly. Existing tutorial/free/dia paths are preserved.

create or replace function public.complete_patrol_instantly(
  p_user_id uuid,
  p_patrol_id uuid,
  p_use_currency text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_currency text := upper(coalesce(p_use_currency, ''));
  v_status text;
  v_quest_id text;
  v_free integer;
  v_paid integer;
  v_reset date;
  v_today date := (now() at time zone 'Asia/Tokyo')::date;
  v_step text;
  v_first_cleared boolean;
begin
  if v_uid is null or v_uid <> p_user_id then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select status, coalesce(course_id, quest_id)
    into v_status, v_quest_id
  from public.user_patrols
  where id = p_patrol_id and user_id = v_uid
  for update;

  if v_status is null then
    raise exception 'patrol not found' using errcode = 'P0002';
  end if;

  if v_status <> 'ONGOING' then
    raise exception 'patrol is not eligible for instant completion' using errcode = '23514';
  end if;

  if v_currency = 'FREE_TUTORIAL' then
    select step_id into v_step
    from public.tutorial_progress
    where user_id = v_uid
    for update;

    if v_step <> 'FREE_INSTANT' then
      raise exception 'tutorial free instant completion is unavailable' using errcode = '55000';
    end if;

    update public.tutorial_progress
      set step_id = 'TUTORIAL_BATTLE', updated_at = now()
    where user_id = v_uid and step_id = 'FREE_INSTANT';

  elsif v_currency = 'FREE_FIRST_CLEAR' then
    if v_quest_id is null then
      raise exception 'quest authority unavailable' using errcode = '55000';
    end if;

    select exists(
      select 1
      from public.user_quest_first_clears c
      where c.user_id = v_uid and c.quest_id = v_quest_id
    ) into v_first_cleared;

    if v_first_cleared then
      raise exception 'first clear free instant completion unavailable' using errcode = '23514';
    end if;

  elsif v_currency in ('FREE_PREOPEN', 'FREE') then
    select quest_free_skips_count, quest_paid_skips_count, quest_skips_reset_date
      into v_free, v_paid, v_reset
    from public.users
    where id = v_uid
    for update;

    if v_reset is distinct from v_today then
      v_free := 0;
      v_paid := 0;
    end if;

    if v_free >= 5 then
      raise exception 'daily free instant completion limit reached' using errcode = '23514';
    end if;

    update public.users
      set quest_free_skips_count = v_free + 1,
          quest_paid_skips_count = v_paid,
          quest_skips_reset_date = v_today
    where id = v_uid;

  elsif v_currency = 'DIAMOND' then
    select quest_free_skips_count, quest_paid_skips_count, quest_skips_reset_date
      into v_free, v_paid, v_reset
    from public.users
    where id = v_uid
    for update;

    if v_reset is distinct from v_today then
      v_free := 0;
      v_paid := 0;
    end if;

    if v_paid >= 10 then
      raise exception 'daily paid instant completion limit reached' using errcode = '23514';
    end if;

    if (select neon_diamonds from public.users where id = v_uid) < 30 then
      raise exception 'diamond insufficient' using errcode = '23514';
    end if;

    update public.users
      set neon_diamonds = neon_diamonds - 30,
          quest_free_skips_count = v_free,
          quest_paid_skips_count = v_paid + 1,
          quest_skips_reset_date = v_today
    where id = v_uid;

  else
    raise exception 'invalid patrol instant completion currency' using errcode = '22023';
  end if;

  update public.user_patrols
    set status = 'CLAIMABLE', expires_at = now()
  where id = p_patrol_id and user_id = v_uid;

  return jsonb_build_object(
    'status', 'success',
    'patrol_id', p_patrol_id,
    'currency', v_currency,
    'diamond_cost', case when v_currency = 'DIAMOND' then 30 else 0 end,
    'free_skips_remaining', case when v_currency in ('FREE_PREOPEN', 'FREE') then 4 - v_free else null end,
    'paid_skips_remaining', case when v_currency = 'DIAMOND' then 9 - v_paid else null end,
    'tutorial_step', case when v_currency = 'FREE_TUTORIAL' then 'TUTORIAL_BATTLE' else null end,
    'first_clear_free', v_currency = 'FREE_FIRST_CLEAR'
  );
end
$function$;
