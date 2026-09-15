import { spawnSync } from "node:child_process";
import { canonicalCharacterStats, canonicalEquipmentFlatStat } from "../src/domain/gameplay/canonical/calculations.ts";
import { CANONICAL_CHARACTERS, CANONICAL_EQUIPMENTS } from "../src/domain/gameplay/canonical/masters.ts";
import { resolveBattle } from "../supabase/functions/resolve-battle/engine.ts";
import { getLinkedPostgresConnection, loadEnvironmentFile } from "./postgres_connection.mjs";
import { verifySupabaseTarget } from "./supabase_target_guard.mjs";

loadEnvironmentFile("development");
const target = await verifySupabaseTarget({ environment: "development", mutation: false });
const connection = await getLinkedPostgresConnection();
const executable = process.platform === "win32" ? "C:\\Program Files\\PostgreSQL\\17\\bin\\psql.exe" : "psql";
const query = String.raw`
begin;
create temporary table canonical_smoke_result(key text primary key, value jsonb not null) on commit drop;
insert into public.users(id,username,cash,pvp_points,pvp_points_last_recovered_at,diamonds,vitality_last_recovered_at,updated_at)
values ('00000000-0000-4000-8000-000000000001','smokeusr',999999999,0,now(),0,now(),now());
insert into public.user_characters(id,user_id,character_id,level,awakening_level) values
 ('00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000001','char_go_01',50,5),
 ('00000000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000000001','char_tetsu_01',1,0),
 ('00000000-0000-4000-8000-000000000013','00000000-0000-4000-8000-000000000001','char_chang_01',50,3),
 ('00000000-0000-4000-8000-000000000014','00000000-0000-4000-8000-000000000001','char_gou_01',100,5),
 ('00000000-0000-4000-8000-000000000015','00000000-0000-4000-8000-000000000001','char_reiji_01',100,5),
 ('00000000-0000-4000-8000-000000000016','00000000-0000-4000-8000-000000000001','char_ageha_01',100,5);
insert into public.user_equipments(id,user_id,equipment_id,level,plus_val,equipped_character_id,slot_index,random_options) values
 ('00000000-0000-4000-8000-000000000021','00000000-0000-4000-8000-000000000001','WEAPON_004',100,0,'00000000-0000-4000-8000-000000000011',0,'[{"atk":999999}]'::jsonb),
 ('00000000-0000-4000-8000-000000000022','00000000-0000-4000-8000-000000000001','WEAPON_001',50,0,null,null,'[]'::jsonb),
 ('00000000-0000-4000-8000-000000000023','00000000-0000-4000-8000-000000000001','WEAPON_002',59,1,null,null,'[]'::jsonb);
insert into public.user_items(id,user_id,item_id,quantity) values
 ('00000000-0000-4000-8000-000000000031','00000000-0000-4000-8000-000000000001','EQUIP_LB_HAMMER',99),
 ('00000000-0000-4000-8000-000000000032','00000000-0000-4000-8000-000000000001','EQUIP_EXP_S',99);
insert into public.user_skills(id,user_id,skill_card_id) values
 ('00000000-0000-4000-8000-000000000041','00000000-0000-4000-8000-000000000001','SKILL_051'),
 ('00000000-0000-4000-8000-000000000042','00000000-0000-4000-8000-000000000001','SKILL_001'),
 ('00000000-0000-4000-8000-000000000043','00000000-0000-4000-8000-000000000001','SKILL_051'),
 ('00000000-0000-4000-8000-000000000044','00000000-0000-4000-8000-000000000001','SKILL_054'),
 ('00000000-0000-4000-8000-000000000045','00000000-0000-4000-8000-000000000001','SKILL_055'),
 ('00000000-0000-4000-8000-000000000046','00000000-0000-4000-8000-000000000001','SKILL_047'),
 ('00000000-0000-4000-8000-000000000047','00000000-0000-4000-8000-000000000001','SKILL_048');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
insert into canonical_smoke_result select 'awaken', public.awaken_character('00000000-0000-4000-8000-000000000012');
insert into canonical_smoke_result select 'limit_break', public.limit_break_equipment('00000000-0000-4000-8000-000000000021',true);
insert into canonical_smoke_result select 'equipment_level_up', public.level_up_equipment('00000000-0000-4000-8000-000000000023','EQUIP_EXP_S',2);
insert into canonical_smoke_result select 'set_skill', public.set_character_skill('00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000041',5);
insert into canonical_smoke_result select 'set_loadout', public.set_character_skill_loadout('00000000-0000-4000-8000-000000000011',array['00000000-0000-4000-8000-000000000041']::uuid[],array[5]);
insert into canonical_smoke_result select 'set_aux', jsonb_build_array(
  public.set_character_skill('00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000046',0),
  public.set_character_skill('00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000047',1),
  public.set_character_skill('00000000-0000-4000-8000-000000000015','00000000-0000-4000-8000-000000000044',5),
  public.set_character_skill('00000000-0000-4000-8000-000000000016','00000000-0000-4000-8000-000000000045',5)
);
do $$
begin
  begin
    perform public.level_up_equipment('00000000-0000-4000-8000-000000000022','EQUIP_EXP_S',1);
    raise exception 'equipment cap unexpectedly accepted';
  exception when sqlstate '23514' then
    insert into canonical_smoke_result values ('equipment_level_cap_guard','true'::jsonb);
  end;
  begin
    perform public.set_character_skill('00000000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000000041',0);
    raise exception 'exclusive mismatch unexpectedly accepted';
  exception when sqlstate '23514' then
    insert into canonical_smoke_result values ('exclusive_character_guard', 'true'::jsonb);
  end;
  begin
    perform public.set_character_skill('00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000043',4);
    raise exception 'exclusive count unexpectedly accepted';
  exception when sqlstate '23514' then
    insert into canonical_smoke_result values ('exclusive_count_guard', 'true'::jsonb);
  end;
end $$;
insert into canonical_smoke_result
select 'snapshot', public.build_server_battle_snapshot('00000000-0000-4000-8000-000000000001',array['00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000015','00000000-0000-4000-8000-000000000016'],'PLAYER');
insert into canonical_smoke_result
select 'power', to_jsonb(public.calculate_user_character_power('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000011'));
insert into canonical_smoke_result
select 'function_values', jsonb_build_object(
 'skill_slots',(select jsonb_agg(public.canonical_skill_slot_count(value) order by value) from unnest(array[0,1,2,3,4,5]) value),
 'lb_multipliers',(select jsonb_agg(public.canonical_equipment_lb_multiplier(value) order by value) from unnest(array[0,1,2,3,4,5,6,7,8,9,10]) value),
 'lb_options',public.canonical_equipment_lb_options('WEAPON',10));
insert into canonical_smoke_result
select 'stats', jsonb_agg(jsonb_build_object('character_id', character_id, 'level', level, 'awakening', awakening, 'stats', to_jsonb(s)) order by character_id,level,awakening)
from (
  select character_id, level, awakening
  from (
    select character_id from unnest(array['char_go_01','char_tetsu_01','char_chang_01','char_gou_01']) character_id
    union select character_id from (select character_id from public.canonical_character_master where version='2026-08-21' order by lv100_hp desc limit 1) max_hp
    union select character_id from (select character_id from public.canonical_character_master where version='2026-08-21' order by lv100_atk desc limit 1) max_atk
    union select character_id from (select character_id from public.canonical_character_master where version='2026-08-21' order by lv100_def desc limit 1) max_def
    union select character_id from (select character_id from public.canonical_character_master where version='2026-08-21' order by lv100_spd desc limit 1) max_spd
    union select character_id from (select character_id from public.canonical_character_master where version='2026-08-21' order by lv100_luk desc limit 1) max_luk
  ) selected cross join unnest(array[1,2,50,99,100]) level cross join unnest(array[0,1,3,5]) awakening
) cases
cross join lateral public.canonical_character_stats(character_id,level,awakening) s;
select jsonb_object_agg(key,value) from canonical_smoke_result;
rollback;
`;
const result = spawnSync(executable, ["-X", "-q", "-v", "ON_ERROR_STOP=1", "-At", "--host", connection.host, "--port", connection.port, "--username", connection.user, "--dbname", connection.database, "--command", query], { encoding: "utf8", env: { ...process.env, PGPASSWORD: connection.password } });
if (result.status !== 0) throw new Error(result.stderr || "Development DB smoke test failed");
const output = JSON.parse(result.stdout.trim().split(/\r?\n/).at(-1));
const source = new Map(CANONICAL_CHARACTERS.map((character) => [character.character_id, character]));
for (const row of output.stats) {
  const character = source.get(row.character_id);
  const expected = canonicalCharacterStats(character.lv1, character.lv100, row.level, row.awakening, character.growth_pattern);
  for (const stat of ["hp", "atk", "def", "spd", "luk"]) {
    if (expected[stat] !== row.stats[stat]) throw new Error(`TS/DB stat mismatch: ${row.character_id} Lv${row.level} +${row.awakening} ${stat}`);
  }
}
const snapshotSkill = output.snapshot.flatMap((character) => character.skills).find((skill) => skill.skillId === "SKILL_051");
if (snapshotSkill?.skillId !== "SKILL_051" || snapshotSkill?.effects?.find((effect) => effect.type === "IGNORE_DEF")?.rate !== 0.55) throw new Error("SKILL_051 canonical effect did not reach snapshot");
if (output.exclusive_character_guard !== true || output.exclusive_count_guard !== true) throw new Error("Exclusive skill validation guard did not execute");
const snapshotSkills = output.snapshot.flatMap((character) => character.skills);
for (const skillId of ["SKILL_047", "SKILL_048", "SKILL_054", "SKILL_055"]) {
  if (!snapshotSkills.some((skill) => skill.skillId === skillId && Array.isArray(skill.effects))) throw new Error(`${skillId} effects did not reach snapshot`);
}
const go = source.get("char_go_01");
const expectedGo = canonicalCharacterStats(go.lv1, go.lv100, 50, 5, go.growth_pattern);
const weapon = CANONICAL_EQUIPMENTS.find((entry) => entry.equipment_id === "WEAPON_004");
if (output.snapshot[0]?.stats?.atk !== expectedGo.atk + canonicalEquipmentFlatStat(weapon.base_stats.atk,100,1)
  || output.snapshot[0]?.stats?.spd !== expectedGo.spd + canonicalEquipmentFlatStat(weapon.base_stats.spd,100,1)) {
  throw new Error("Canonical equipment flat stats did not reach snapshot or Random Option affected them");
}
if (output.equipment_level_cap_guard !== true || output.equipment_level_up?.level !== 60 || output.equipment_level_up?.level_cap !== 60) throw new Error("Equipment level cap RPC validation failed");
if (output.power <= 0) throw new Error("Ranking power did not calculate");
const runtime = resolveBattle(20_260_821, "SKILL_PRIORITY", 3, output.snapshot, [{
  id: "enemy_canonical_smoke", characterId: "enemy_canonical_smoke", name: "Canonical Smoke Enemy", team: "ENEMY", alignment: "JUSTICE",
  stats: { hp: 99_999_999, atk: 1, def: 45_000, spd: 1, luk: 0 }, skills: [],
}]);
const actualSkill051 = runtime.events.find((event) => event.type === "DAMAGE" && event.payload.actorId === "player_00000000-0000-4000-8000-000000000011" && event.round === 3);
if (!actualSkill051 || actualSkill051.payload.ignoreDefBp !== 5500 || Number(actualSkill051.payload.amount) <= 0) {
  throw new Error(`SKILL_051 Ignore DEF 55% was not executed from the Development DB snapshot: ${JSON.stringify(runtime.events.filter((event) => event.payload.actorId === "player_00000000-0000-4000-8000-000000000011"))}`);
}
console.log(JSON.stringify({ environment: target.environment, project_ref: target.projectRef, parity_rows: output.stats.length, max_hp_plus_five: output.stats.find((row) => row.character_id === "char_koharu_01" && row.level === 100 && row.awakening === 5)?.stats.hp, smoke: { ...output, stats: undefined } }, null, 2));
