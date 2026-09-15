-- Pure curve verification for all 60 canonical characters, 100 levels, six proposed types, five stats.
-- Does not assert assignment authority or connect battle runtime.
BEGIN;
-- DRAFT ONLY: runtime connection is blocked pending 60 canonical-ID growth assignments.
-- Generated from src/domain/gameplay/canonical/data/character_growth_20260914.json
-- Does not change canonical_character_stats, ownership, level, power, or snapshots.
CREATE TABLE public.canonical_character_growth_exponents (
 growth_pattern_id text PRIMARY KEY,
 hp numeric NOT NULL CHECK(hp>0), atk numeric NOT NULL CHECK(atk>0),
 def numeric NOT NULL CHECK(def>0), spd numeric NOT NULL CHECK(spd>0), luk numeric NOT NULL CHECK(luk>0)
);
INSERT INTO public.canonical_character_growth_exponents(growth_pattern_id,hp,atk,def,spd,luk) VALUES
('ATTACKER',1.05,0.90,1.10,0.95,1.00),
('BALANCED',1.00,1.00,1.00,1.00,1.00),
('DEFENDER',0.95,1.10,0.90,1.10,1.00),
('HP_TANK',0.85,1.10,0.95,1.15,1.05),
('LUCKY_STAR',1.05,1.05,1.05,0.95,0.85),
('SPEEDSTER',1.10,1.00,1.10,0.85,0.95);
ALTER TABLE public.canonical_character_growth_exponents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.canonical_character_growth_exponents FROM anon,authenticated;
GRANT SELECT ON public.canonical_character_growth_exponents TO anon,authenticated,service_role;
CREATE POLICY canonical_character_growth_exponents_read ON public.canonical_character_growth_exponents
 FOR SELECT TO anon,authenticated USING (true);

CREATE TEMP TABLE curve_values ON COMMIT DROP AS
SELECT c.character_id,g.growth_pattern_id,l.level,s.stat,s.start_value,s.end_value,
 round(s.start_value+(s.end_value-s.start_value)*power((l.level-1)::numeric/99,s.exponent))::integer value
FROM public.canonical_character_master c CROSS JOIN public.canonical_character_growth_exponents g
CROSS JOIN generate_series(1,100) l(level)
CROSS JOIN LATERAL (VALUES ('hp',c.lv1_hp,c.lv100_hp,g.hp),('atk',c.lv1_atk,c.lv100_atk,g.atk),('def',c.lv1_def,c.lv100_def,g.def),('spd',c.lv1_spd,c.lv100_spd,g.spd),('luk',c.lv1_luk,c.lv100_luk,g.luk)) s(stat,start_value,end_value,exponent)
WHERE c.version='2026-08-21';
DO $test$
BEGIN
 IF (SELECT count(*) FROM curve_values)<>180000 THEN RAISE EXCEPTION 'curve matrix incomplete'; END IF;
 IF EXISTS(SELECT 1 FROM curve_values WHERE (level=1 AND value<>start_value) OR (level=100 AND value<>end_value)) THEN RAISE EXCEPTION 'endpoints changed'; END IF;
 IF EXISTS(SELECT 1 FROM (SELECT value,lag(value) OVER(PARTITION BY character_id,growth_pattern_id,stat ORDER BY level) previous FROM curve_values) t WHERE value<previous) THEN RAISE EXCEPTION 'non-monotonic'; END IF;
 IF EXISTS(SELECT 1 FROM curve_values WHERE growth_pattern_id='BALANCED' AND value<>round(start_value+(end_value-start_value)*(level-1)::numeric/99)) THEN RAISE EXCEPTION 'balanced is not rounded-linear'; END IF;
 IF EXISTS(SELECT character_id,stat FROM curve_values WHERE level=50 GROUP BY character_id,stat HAVING count(distinct value)<2) THEN RAISE EXCEPTION 'middle-level types do not differ'; END IF;
END;
$test$;
SELECT 'PASS:180000 values, endpoints, monotonicity, rounded BALANCED, middle-level difference; assignment/runtime NOT VALIDATED' result;
ROLLBACK;
