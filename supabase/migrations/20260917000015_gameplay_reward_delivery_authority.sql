-- Preview reconciliation of the Production exactly-once reward authority.
CREATE OR REPLACE FUNCTION public._grant_gameplay_reward_v1(
  p_user uuid, p_source text, p_key text, p_item text, p_quantity integer
)
RETURNS uuid
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
DECLARE
  v_id uuid;
  v_saved public.gameplay_reward_delivery_ledger%rowtype;
  v_item text;
BEGIN
  IF p_user IS NULL OR p_key IS NULL OR p_key = '' OR p_item IS NULL OR p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'Invalid gameplay reward';
  END IF;
  v_item := public.resolve_canonical_reward_item(p_item);
  INSERT INTO public.gameplay_reward_delivery_ledger(user_id,source_kind,source_key,item_id,quantity)
  VALUES(p_user,p_source,p_key,v_item,p_quantity)
  ON CONFLICT DO NOTHING RETURNING id INTO v_id;
  IF v_id IS NULL THEN
    SELECT * INTO STRICT v_saved FROM public.gameplay_reward_delivery_ledger
    WHERE user_id=p_user AND source_kind=p_source AND source_key=p_key AND item_id=v_item;
    IF v_saved.quantity <> p_quantity THEN RAISE EXCEPTION 'Gameplay reward replay mismatch'; END IF;
    RETURN v_saved.id;
  END IF;
  PERFORM public.grant_present_payload(p_user,v_item,p_quantity);
  RETURN v_id;
END;
$function$;
