-- Guild Identity Phase 1. Reuses Guild cosmetic ownership; no economy changes.
INSERT INTO public.cosmetic_master(id,owner_scope,slot,display_name,asset_key,source_type,metadata)
SELECT 'guild_standard_'||lpad(n::text,2,'0'),'GUILD','GUILD_EMBLEM',
 (ARRAY['王冠','翼','稲妻','薔薇','双剣','炎','月','蛇'])[n],'/guild-emblems/guild_standard_'||lpad(n::text,2,'0')||'.svg',
 'SYSTEM',jsonb_build_object('standard',true,'default',n=1,'sort_order',n)
FROM generate_series(1,8) n
ON CONFLICT(id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.list_guild_emblems(p_guild_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.guilds g JOIN public.guild_members gm ON gm.guild_id=g.id
 WHERE g.id=p_guild_id AND NOT g.is_disbanded AND gm.user_id=auth.uid()) THEN
 RAISE EXCEPTION 'guild membership required' USING ERRCODE='42501'; END IF;
 RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object('id',cm.id,'display_name',cm.display_name,'asset_path',cm.asset_key)
 ORDER BY coalesce((cm.metadata->>'sort_order')::integer,999),cm.id),'[]'::jsonb)
 FROM public.cosmetic_master cm WHERE cm.owner_scope='GUILD' AND cm.slot='GUILD_EMBLEM' AND cm.active
 AND (cm.metadata @> '{"standard":true}'::jsonb OR EXISTS(SELECT 1 FROM public.guild_cosmetics gc
 WHERE gc.guild_id=p_guild_id AND gc.cosmetic_id=cm.id AND (gc.expires_at IS NULL OR gc.expires_at>now()))));
END $$;

CREATE OR REPLACE FUNCTION public.get_guild_emblems(p_guild_ids uuid[])
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE='42501'; END IF;
 IF cardinality(p_guild_ids)>500 THEN RAISE EXCEPTION 'too many guild ids' USING ERRCODE='22023'; END IF;
 RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object('guild_id',g.id,
 'emblem_id',coalesce(chosen.id,'guild_standard_01'),
 'asset_path',coalesce(chosen.asset_key,CASE WHEN NOT EXISTS(SELECT 1 FROM public.guild_equipped_cosmetics old WHERE old.guild_id=g.id AND old.slot='GUILD_EMBLEM') THEN nullif(g.logo_icon,'') END,'/guild-emblems/guild_standard_01.svg')) ORDER BY g.id),'[]'::jsonb)
 FROM public.guilds g LEFT JOIN LATERAL (
 SELECT cm.id,cm.asset_key FROM public.guild_equipped_cosmetics ec
 JOIN public.cosmetic_master cm ON cm.id=ec.cosmetic_id
 WHERE ec.guild_id=g.id AND ec.slot='GUILD_EMBLEM' AND cm.slot='GUILD_EMBLEM' AND cm.owner_scope='GUILD' AND cm.active
 AND (cm.metadata @> '{"standard":true}'::jsonb OR EXISTS(SELECT 1 FROM public.guild_cosmetics gc
 WHERE gc.guild_id=g.id AND gc.cosmetic_id=cm.id AND (gc.expires_at IS NULL OR gc.expires_at>now())))
 ) chosen ON true WHERE g.id=ANY(p_guild_ids) AND NOT g.is_disbanded);
END $$;

CREATE OR REPLACE FUNCTION public.set_guild_emblem(p_guild_id uuid,p_emblem_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_role text; v_asset text;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE='42501'; END IF;
 -- Same guild -> membership lock order as leave/transfer authority.
 PERFORM 1 FROM public.guilds WHERE id=p_guild_id AND NOT is_disbanded FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'active guild required' USING ERRCODE='22023'; END IF;
 SELECT role INTO v_role FROM public.guild_members WHERE guild_id=p_guild_id AND user_id=auth.uid() FOR UPDATE;
 IF v_role IS NULL OR v_role NOT IN ('MASTER','SUB_MASTER') THEN
 RAISE EXCEPTION 'guild master or sub master permission required' USING ERRCODE='42501'; END IF;
 SELECT cm.asset_key INTO v_asset FROM public.cosmetic_master cm
 WHERE cm.id=p_emblem_id AND cm.owner_scope='GUILD' AND cm.slot='GUILD_EMBLEM' AND cm.active
 AND (cm.metadata @> '{"standard":true}'::jsonb OR EXISTS(SELECT 1 FROM public.guild_cosmetics gc
 WHERE gc.guild_id=p_guild_id AND gc.cosmetic_id=cm.id AND (gc.expires_at IS NULL OR gc.expires_at>now()))) FOR SHARE;
 IF NOT FOUND OR v_asset IS NULL THEN RAISE EXCEPTION 'guild emblem is unavailable' USING ERRCODE='22023'; END IF;
 INSERT INTO public.guild_equipped_cosmetics(guild_id,slot,cosmetic_id) VALUES(p_guild_id,'GUILD_EMBLEM',p_emblem_id)
 ON CONFLICT(guild_id,slot) DO UPDATE SET cosmetic_id=EXCLUDED.cosmetic_id,equipped_at=now();
 UPDATE public.guilds SET logo_icon=v_asset WHERE id=p_guild_id;
 RETURN jsonb_build_object('status','success','guild_id',p_guild_id,'emblem_id',p_emblem_id,'asset_path',v_asset);
END $$;

CREATE OR REPLACE FUNCTION public.equip_guild_cosmetic(p_guild_id uuid,p_slot text,p_cosmetic_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_role text;
BEGIN
 IF p_slot='GUILD_EMBLEM' THEN RETURN public.set_guild_emblem(p_guild_id,p_cosmetic_id); END IF;
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.guilds WHERE id=p_guild_id AND NOT is_disbanded FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'active guild required'; END IF;
 SELECT role INTO v_role FROM public.guild_members WHERE guild_id=p_guild_id AND user_id=auth.uid() FOR UPDATE;
 IF v_role IS DISTINCT FROM 'MASTER' THEN RAISE EXCEPTION 'guild master permission required' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.guild_cosmetics gc JOIN public.cosmetic_master cm ON cm.id=gc.cosmetic_id
 WHERE gc.guild_id=p_guild_id AND gc.cosmetic_id=p_cosmetic_id AND cm.owner_scope='GUILD' AND cm.slot=p_slot AND cm.active
 AND (gc.expires_at IS NULL OR gc.expires_at>now())) THEN RAISE EXCEPTION 'guild cosmetic is not owned or is unavailable'; END IF;
 INSERT INTO public.guild_equipped_cosmetics(guild_id,slot,cosmetic_id) VALUES(p_guild_id,p_slot,p_cosmetic_id)
 ON CONFLICT(guild_id,slot) DO UPDATE SET cosmetic_id=EXCLUDED.cosmetic_id,equipped_at=now();
 IF p_slot='GUILD_BASE_BACKGROUND' THEN UPDATE public.guilds SET equipped_decoration=p_cosmetic_id WHERE id=p_guild_id; END IF;
 IF p_slot='GUILD_BANNER' THEN UPDATE public.guilds SET equipped_banner=p_cosmetic_id WHERE id=p_guild_id; END IF;
 RETURN jsonb_build_object('status','success');
END $$;

-- INSERT trigger preserves create_guild_v2 price, level, mission and locking authority.
CREATE OR REPLACE FUNCTION public.initialize_guild_emblem()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 INSERT INTO public.guild_equipped_cosmetics(guild_id,slot,cosmetic_id)
 VALUES(NEW.id,'GUILD_EMBLEM','guild_standard_01') ON CONFLICT(guild_id,slot) DO NOTHING;
 IF nullif(NEW.logo_icon,'') IS NULL THEN UPDATE public.guilds
 SET logo_icon='/guild-emblems/guild_standard_01.svg' WHERE id=NEW.id; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guild_emblem_after_insert AFTER INSERT ON public.guilds
FOR EACH ROW EXECUTE FUNCTION public.initialize_guild_emblem();

REVOKE ALL ON FUNCTION public.initialize_guild_emblem() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.list_guild_emblems(uuid),public.get_guild_emblems(uuid[]),public.set_guild_emblem(uuid,text),public.equip_guild_cosmetic(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.list_guild_emblems(uuid),public.get_guild_emblems(uuid[]),public.set_guild_emblem(uuid,text),public.equip_guild_cosmetic(uuid,text,text) TO authenticated;
