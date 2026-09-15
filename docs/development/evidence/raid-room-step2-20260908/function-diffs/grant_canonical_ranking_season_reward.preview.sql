CREATE OR REPLACE FUNCTION public.grant_canonical_ranking_season_reward(p_season_id uuid, p_category text, p_recipient_user_id uuid, p_ranked_entity_id uuid, p_rank_position integer)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_entry record;
  v_reward_id text;
  v_item_id text;
  v_quantity integer;
  v_reward_key text;
  v_granted integer := 0;
  v_message text;
  v_present_id uuid;
begin
  if p_category not in ('PVP','RAID_PERSONAL','RAID_GUILD') then
    raise exception 'unsupported ranking reward category' using errcode='22023';
  end if;
  v_message := case p_category
    when 'PVP' then 'PvPシーズンランキング報酬'
    when 'RAID_PERSONAL' then 'レイド個人ランキング報酬'
    else 'レイドギルドランキング報酬'
  end;

  for v_entry in
    select entry.value,entry.ordinality
    from jsonb_array_elements(public.canonical_ranking_reward_payload()#>array['progression',p_category])
      with ordinality entry(value,ordinality)
    where p_rank_position between (entry.value->>0)::integer and (entry.value->>1)::integer
  loop
    v_reward_id := v_entry.value->>2;
    v_quantity := (v_entry.value->>3)::integer;
    v_reward_key := concat_ws(':',v_entry.value->>0,v_entry.value->>1,v_reward_id,v_entry.ordinality);
    v_item_id := public.resolve_canonical_reward_item(v_reward_id);

    insert into public.ranking_season_reward_grants(
      season_id,ranking_category,recipient_user_id,ranked_entity_id,rank_position,
      reward_key,master_reward_id,resolved_item_id,quantity
    ) values (
      p_season_id,p_category,p_recipient_user_id,p_ranked_entity_id,p_rank_position,
      v_reward_key,v_reward_id,v_item_id,v_quantity
    ) on conflict do nothing;

    if found then
      insert into public.presents(user_id,item_id,quantity,message,status,expire_at)
      values(p_recipient_user_id,v_item_id,v_quantity,v_message,'UNCLAIMED',clock_timestamp()+interval '30 days')
      returning id into v_present_id;
      update public.ranking_season_reward_grants set present_id=v_present_id
      where season_id=p_season_id and ranking_category=p_category
        and recipient_user_id=p_recipient_user_id and reward_key=v_reward_key;
      v_granted := v_granted + 1;
    end if;
  end loop;
  return v_granted;
end;
$function$
;