-- Preview reconciliation of the Production reward delivery dependency.
CREATE OR REPLACE FUNCTION public.grant_present_payload(p_user_id uuid, p_item_id text, p_quantity integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF p_quantity <= 0 THEN RAISE EXCEPTION 'Invalid present quantity'; END IF;
  IF p_item_id = 'CASH' THEN
    UPDATE public.users SET cash = cash + p_quantity WHERE id = p_user_id;
  ELSIF p_item_id IN ('DIA', 'DIAMOND') THEN
    UPDATE public.users SET neon_diamonds = neon_diamonds + p_quantity WHERE id = p_user_id;
  ELSIF EXISTS (SELECT 1 FROM public.equipment_battle_master WHERE equipment_id = p_item_id) THEN
    INSERT INTO public.user_equipments (user_id, equipment_id, equipment_master_id, level, plus_val)
    SELECT p_user_id, p_item_id, p_item_id, 1, 0 FROM generate_series(1, p_quantity);
  ELSE
    INSERT INTO public.user_items (user_id, item_id, quantity)
    VALUES (p_user_id, p_item_id, p_quantity)
    ON CONFLICT (user_id, item_id) DO UPDATE
    SET quantity = public.user_items.quantity + EXCLUDED.quantity;
  END IF;
END;
$function$;
