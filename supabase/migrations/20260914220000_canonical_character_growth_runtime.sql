-- 2026-09-14 canonical60割当を維持し承認済み指数補間を接続。
-- 旧release/battle/fixture UUIDのgrowth割当を継承しない。
-- ownership/Lv/awakening/xp/資産/確定snapshotを変更しない。current projectionのみ再計算。
BEGIN;
DO $guard$
BEGIN
 IF md5(pg_get_functiondef('public.canonical_character_stats(text,integer,integer)'::regprocedure))
 <> '2c196719fe8fcd72b10ffc2c5e578d7e' THEN RAISE EXCEPTION 'CANONICAL_GROWTH_RUNTIME_SOURCE_DRIFT'; END IF;
END $guard$;
CREATE TABLE public.canonical_character_growth_exponents (
 growth_pattern_id text PRIMARY KEY,
 hp numeric NOT NULL CHECK(hp>0),atk numeric NOT NULL CHECK(atk>0),
 def numeric NOT NULL CHECK(def>0),spd numeric NOT NULL CHECK(spd>0),luk numeric NOT NULL CHECK(luk>0)
);
INSERT INTO public.canonical_character_growth_exponents VALUES
('ATTACKER',1.05,0.9,1.1,0.95,1),
('BALANCED',1,1,1,1,1),
('DEFENDER',0.95,1.1,0.9,1.1,1),
('HP_TANK',0.85,1.1,0.95,1.15,1.05),
('LUCKY_STAR',1.05,1.05,1.05,0.95,0.85),
('SPEEDSTER',1.1,1,1.1,0.85,0.95);
CREATE TABLE public.canonical_character_growth_assignments (
 version text NOT NULL,
 character_id text NOT NULL,
 growth_pattern_id text NOT NULL REFERENCES public.canonical_character_growth_exponents(growth_pattern_id),
 PRIMARY KEY(version,character_id),
 FOREIGN KEY(version,character_id) REFERENCES public.canonical_character_master(version,character_id)
);
-- Generated from characters_20260821.json blob cbae064187916fa768bf5ebd0dbc039fc085e35e.
INSERT INTO public.canonical_character_growth_assignments VALUES
('2026-08-21','char_go_01','ATTACKER'),
('2026-08-21','char_kengo_01','ATTACKER'),
('2026-08-21','char_koharu_01','DEFENDER'),
('2026-08-21','char_reiji_01','DEFENDER'),
('2026-08-21','char_ageha_01','SPEEDSTER'),
('2026-08-21','char_leo_01','SPEEDSTER'),
('2026-08-21','char_karen_01','LUCKY_STAR'),
('2026-08-21','char_miyabi_01','LUCKY_STAR'),
('2026-08-21','char_kaede_01','BALANCED'),
('2026-08-21','char_mio_01','BALANCED'),
('2026-08-21','char_tetsu_01','ATTACKER'),
('2026-08-21','char_takuro_01','ATTACKER'),
('2026-08-21','char_lucas_01','ATTACKER'),
('2026-08-21','char_leon_01','ATTACKER'),
('2026-08-21','char_takeshi_01','DEFENDER'),
('2026-08-21','char_genji_01','DEFENDER'),
('2026-08-21','char_riki_01','DEFENDER'),
('2026-08-21','char_long_01','DEFENDER'),
('2026-08-21','char_sora_01','SPEEDSTER'),
('2026-08-21','char_reina_01','SPEEDSTER'),
('2026-08-21','char_noa_01','SPEEDSTER'),
('2026-08-21','char_taiga_01','SPEEDSTER'),
('2026-08-21','char_alice_01','LUCKY_STAR'),
('2026-08-21','char_rui_01','LUCKY_STAR'),
('2026-08-21','char_maya_01','LUCKY_STAR'),
('2026-08-21','char_seiya_01','LUCKY_STAR'),
('2026-08-21','char_sakura_01','BALANCED'),
('2026-08-21','char_martina_01','BALANCED'),
('2026-08-21','char_kageyama_01','BALANCED'),
('2026-08-21','char_cecile_01','BALANCED'),
('2026-08-21','char_chang_01','ATTACKER'),
('2026-08-21','char_daimon_01','ATTACKER'),
('2026-08-21','char_mark_01','ATTACKER'),
('2026-08-21','char_yuji_01','ATTACKER'),
('2026-08-21','char_joe_01','DEFENDER'),
('2026-08-21','char_ren_male_01','DEFENDER'),
('2026-08-21','char_shin_01','DEFENDER'),
('2026-08-21','char_yuki_01','DEFENDER'),
('2026-08-21','char_jihoon_01','SPEEDSTER'),
('2026-08-21','char_kaito_01','SPEEDSTER'),
('2026-08-21','char_minami_01','SPEEDSTER'),
('2026-08-21','char_yukina_01','SPEEDSTER'),
('2026-08-21','char_aoi_01','LUCKY_STAR'),
('2026-08-21','char_mei_01','LUCKY_STAR'),
('2026-08-21','char_ren_01','LUCKY_STAR'),
('2026-08-21','char_serika_01','LUCKY_STAR'),
('2026-08-21','char_makoto_01','BALANCED'),
('2026-08-21','char_momoko_01','BALANCED'),
('2026-08-21','char_rin_01','BALANCED'),
('2026-08-21','char_shion_01','BALANCED'),
('2026-08-21','char_gou_01','ATTACKER'),
('2026-08-21','char_kenji_01','ATTACKER'),
('2026-08-21','char_shun_01','DEFENDER'),
('2026-08-21','char_tatsuya_01','DEFENDER'),
('2026-08-21','char_naoto_01','SPEEDSTER'),
('2026-08-21','char_sawat_01','SPEEDSTER'),
('2026-08-21','char_masato_01','LUCKY_STAR'),
('2026-08-21','char_yoshihiko_01','LUCKY_STAR'),
('2026-08-21','char_souta_01','BALANCED'),
('2026-08-21','char_tomoya_01','BALANCED');
ALTER TABLE public.canonical_character_growth_exponents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.canonical_character_growth_assignments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.canonical_character_growth_exponents,public.canonical_character_growth_assignments FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.canonical_character_growth_exponents,public.canonical_character_growth_assignments TO anon,authenticated,service_role;
CREATE POLICY canonical_character_growth_exponents_read ON public.canonical_character_growth_exponents FOR SELECT TO anon,authenticated USING(true);
CREATE POLICY canonical_character_growth_assignments_read ON public.canonical_character_growth_assignments FOR SELECT TO anon,authenticated USING(true);
DO $check$
BEGIN
 IF (SELECT count(*) FROM public.canonical_character_growth_assignments WHERE version='2026-08-21')<>60
 OR EXISTS(SELECT 1 FROM public.canonical_character_master c LEFT JOIN public.canonical_character_growth_assignments a USING(version,character_id) WHERE c.version='2026-08-21' AND a.character_id IS NULL)
 THEN RAISE EXCEPTION 'CANONICAL_GROWTH_ASSIGNMENT_INCOMPLETE'; END IF;
END $check$;
CREATE OR REPLACE FUNCTION public.canonical_character_stats(p_character_id text,p_level integer,p_awakening integer)
RETURNS TABLE(hp integer,atk integer,def integer,spd integer,luk integer)
LANGUAGE sql STABLE SET search_path TO 'public'
AS $function$
WITH source AS (
 SELECT c.*,e.hp AS hp_exponent,e.atk AS atk_exponent,e.def AS def_exponent,e.spd AS spd_exponent,e.luk AS luk_exponent,
 greatest(least(p_level,100),1)::integer AS character_level,
 greatest(least(p_awakening,5),0)::integer AS awakening
 FROM public.canonical_character_master c
 JOIN public.canonical_character_growth_assignments a USING(version,character_id)
 JOIN public.canonical_character_growth_exponents e USING(growth_pattern_id)
 WHERE c.version='2026-08-21' AND c.character_id=p_character_id
), level_stats AS (
 SELECT
 round(lv1_hp::numeric+(lv100_hp::numeric-lv1_hp::numeric)*power((character_level-1)::numeric/99,hp_exponent))::bigint AS hp,
 round(lv1_atk::numeric+(lv100_atk::numeric-lv1_atk::numeric)*power((character_level-1)::numeric/99,atk_exponent))::bigint AS atk,
 round(lv1_def::numeric+(lv100_def::numeric-lv1_def::numeric)*power((character_level-1)::numeric/99,def_exponent))::bigint AS def,
 round(lv1_spd::numeric+(lv100_spd::numeric-lv1_spd::numeric)*power((character_level-1)::numeric/99,spd_exponent))::bigint AS spd,
 round(lv1_luk::numeric+(lv100_luk::numeric-lv1_luk::numeric)*power((character_level-1)::numeric/99,luk_exponent))::bigint AS luk,
 awakening FROM source
)
SELECT
 (hp*(array[10000,10800,11500,13200,15000,17500]::bigint[])[awakening+1]/10000)::integer,
 (atk*(array[10000,10800,11500,13200,15000,17500]::bigint[])[awakening+1]/10000)::integer,
 (def*(array[10000,10800,11500,13200,15000,17500]::bigint[])[awakening+1]/10000)::integer,
 (spd*(array[10000,10300,10600,11000,11500,12000]::bigint[])[awakening+1]/10000)::integer,
 (luk*(array[10000,10300,10600,11000,11500,12000]::bigint[])[awakening+1]/10000)::integer
FROM level_stats
$function$;
-- CURRENT projectionのみ整合。日次Snapshotを更新するrefresh RPCは呼ばない。
-- 通知専用Triggerのみ、表lock内で一時停止し同じ有効状態へ復元。
LOCK TABLE public.user_power_rankings IN ACCESS EXCLUSIVE MODE;
DO $projection$
DECLARE v_enabled "char";
BEGIN
 SELECT tgenabled INTO STRICT v_enabled FROM pg_trigger
 WHERE tgrelid='public.user_power_rankings'::regclass AND tgname='m9x_power_leader_activity_trigger' AND NOT tgisinternal;
 IF (SELECT md5(pg_get_functiondef(tgfoid)) FROM pg_trigger
     WHERE tgrelid='public.user_power_rankings'::regclass AND tgname='m9x_power_leader_activity_trigger')
   <> 'baf68eaa73ad7efbdd4b31ece593919e' THEN
   RAISE EXCEPTION 'POWER_ACTIVITY_TRIGGER_SOURCE_DRIFT';
 END IF;
 ALTER TABLE public.user_power_rankings DISABLE TRIGGER m9x_power_leader_activity_trigger;
 INSERT INTO public.user_power_rankings(user_id,total_power,updated_at)
 SELECT u.id,least(public.calculate_user_total_power(u.id),2147483647)::integer,clock_timestamp()
 FROM public.users u
 ON CONFLICT(user_id) DO UPDATE SET total_power=excluded.total_power,updated_at=excluded.updated_at
 WHERE user_power_rankings.total_power IS DISTINCT FROM excluded.total_power;
 CASE v_enabled
 WHEN 'O' THEN ALTER TABLE public.user_power_rankings ENABLE TRIGGER m9x_power_leader_activity_trigger;
 WHEN 'A' THEN ALTER TABLE public.user_power_rankings ENABLE ALWAYS TRIGGER m9x_power_leader_activity_trigger;
 WHEN 'R' THEN ALTER TABLE public.user_power_rankings ENABLE REPLICA TRIGGER m9x_power_leader_activity_trigger;
 WHEN 'D' THEN ALTER TABLE public.user_power_rankings DISABLE TRIGGER m9x_power_leader_activity_trigger;
 ELSE RAISE EXCEPTION 'UNKNOWN_POWER_ACTIVITY_TRIGGER_MODE';
 END CASE;
END $projection$;

NOTIFY pgrst,'reload schema';
COMMIT;
