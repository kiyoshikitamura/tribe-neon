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
ROLLBACK;
