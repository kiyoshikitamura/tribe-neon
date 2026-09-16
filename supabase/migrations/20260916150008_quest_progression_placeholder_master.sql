-- 仮Master。JSONを変更して本スクリプトで再生成。既存LEGACY列は変更しない。
begin;
alter table public.canonical_quest_master
 add column if not exists progression_vitality_cost integer check(progression_vitality_cost>0),
 add column if not exists progression_duration_sec integer check(progression_duration_sec>0),
 add column if not exists progression_user_exp integer check(progression_user_exp>=0),
 add column if not exists progression_cash_reward integer check(progression_cash_reward>=0),
 add column if not exists progression_reward_pool_id text,
 add column if not exists progression_first_clear_user_exp integer check(progression_first_clear_user_exp>=0),
 add column if not exists progression_first_clear_cash_reward integer check(progression_first_clear_cash_reward>=0),
 add column if not exists progression_first_clear_reward_pool_id text,
 add column if not exists progression_boss_stat_multiplier_bp integer check(progression_boss_stat_multiplier_bp>0),
 add column if not exists progression_boss_stats jsonb,
 add column if not exists progression_normal_reward_timing text check(progression_normal_reward_timing in ('EXPLORATION_COMPLETE','BOSS_VICTORY')),
 add column if not exists progression_first_clear_reward_timing text check(progression_first_clear_reward_timing in ('BOSS_VICTORY')),
 add column if not exists progression_is_provisional boolean;
do $$ begin if (select count(*) from public.canonical_quest_master where version='2026-08-30' and quest_id in ('q_shinjuku_1','q_shinjuku_2','q_shinjuku_3','q_shibuya_1','q_shibuya_2','q_shibuya_3','q_ikebukuro_1','q_ikebukuro_2','q_ikebukuro_3','q_roppongi_1','q_roppongi_2','q_roppongi_3','q_akihabara_1','q_akihabara_2','q_akihabara_3','q_kawasaki_1','q_kawasaki_2','q_kawasaki_3','q_yokohama_1','q_yokohama_2','q_yokohama_3'))<>21 then raise exception 'Quest master requires all 21 existing stages'; end if; end $$;
update public.canonical_quest_master set progression_vitality_cost=3,progression_duration_sec=60,progression_user_exp=100,progression_cash_reward=300,progression_reward_pool_id='QP_NORMAL_q_shinjuku_1',progression_first_clear_user_exp=100,progression_first_clear_cash_reward=300,progression_first_clear_reward_pool_id='QP_FIRST_q_shinjuku_1',progression_boss_stat_multiplier_bp=10000,progression_boss_stats='{"hp":1200,"atk":180,"def":60,"spd":60,"luk":0}'::jsonb,progression_normal_reward_timing='EXPLORATION_COMPLETE',progression_first_clear_reward_timing='BOSS_VICTORY',progression_is_provisional=true where version='2026-08-30' and quest_id='q_shinjuku_1';
delete from public.canonical_quest_reward_pool_items where version='2026-08-30' and reward_pool_id='QP_NORMAL_q_shinjuku_1';
insert into public.canonical_quest_reward_pool_items(version,reward_pool_id,roll_index,item_id,quantity,probability_bp) values('2026-08-30','QP_NORMAL_q_shinjuku_1',1,'CHAR_EXP_M',1,10000);
insert into public.canonical_quest_reward_pool_items(version,reward_pool_id,roll_index,item_id,quantity,probability_bp) values('2026-08-30','QP_NORMAL_q_shinjuku_1',2,'EQUIP_EXP_M',1,10000);
delete from public.canonical_quest_reward_pool_items where version='2026-08-30' and reward_pool_id='QP_FIRST_q_shinjuku_1';
insert into public.canonical_quest_reward_pool_items(version,reward_pool_id,roll_index,item_id,quantity,probability_bp) values('2026-08-30','QP_FIRST_q_shinjuku_1',1,'CHAR_EXP_M',1,10000);
insert into public.canonical_quest_reward_pool_items(version,reward_pool_id,roll_index,item_id,quantity,probability_bp) values('2026-08-30','QP_FIRST_q_shinjuku_1',2,'EQUIP_EXP_M',1,10000);
update public.canonical_quest_master set progression_vitality_cost=4,progression_duration_sec=120,progression_user_exp=150,progression_cash_reward=400,progression_reward_pool_id='QP_NORMAL_q_shinjuku_2',progression_first_clear_user_exp=125,progression_first_clear_cash_reward=350,progression_first_clear_reward_pool_id='QP_FIRST_q_shinjuku_2',progression_boss_stat_multiplier_bp=10000,progression_boss_stats='{"hp":2000,"atk":250,"def":85,"spd":60,"luk":0}'::jsonb,progression_normal_reward_timing='EXPLORATION_COMPLETE',progression_first_clear_reward_timing='BOSS_VICTORY',progression_is_provisional=true where version='2026-08-30' and quest_id='q_shinjuku_2';
delete from public.canonical_quest_reward_pool_items where version='2026-08-30' and reward_pool_id='QP_NORMAL_q_shinjuku_2';
insert into public.canonical_quest_reward_pool_items(version,reward_pool_id,roll_index,item_id,quantity,probability_bp) values('2026-08-30','QP_NORMAL_q_shinjuku_2',1,'CHAR_EXP_M',1,10000);
insert into public.canonical_quest_reward_pool_items(version,reward_pool_id,roll_index,item_id,quantity,probability_bp) values('2026-08-30','QP_NORMAL_q_shinjuku_2',2,'EQUIP_EXP_M',1,10000);
delete from public.canonical_quest_reward_pool_items where version='2026-08-30' and reward_pool_id='QP_FIRST_q_shinjuku_2';
insert into public.canonical_quest_reward_pool_items(version,reward_pool_id,roll_index,item_id,quantity,probability_bp) values('2026-08-30','QP_FIRST_q_shinjuku_2',1,'CHAR_EXP_M',1,10000);
insert into public.canonical_quest_reward_pool_items(version,reward_pool_id,roll_index,item_id,quantity,probability_bp) values('2026-08-30','QP_FIRST_q_shinjuku_2',2,'EQUIP_EXP_M',1,10000);
update public.canonical_quest_master set progression_vitality_cost=5,progression_duration_sec=180,progression_user_exp=200,progression_cash_reward=500,progression_reward_pool_id='QP_NORMAL_q_shinjuku_3',progression_first_clear_user_exp=150,progression_first_clear_cash_reward=400,progression_first_clear_reward_pool_id='QP_FIRST_q_shinjuku_3',progression_boss_stat_multiplier_bp=10000,progression_boss_stats='{"hp":2800,"atk":320,"def":110,"spd":60,"luk":0}'::jsonb,progression_normal_reward_timing='EXPLORATION_COMPLETE',progression_first_clear_reward_timing='BOSS_VICTORY',progression_is_provisional=true where version='2026-08-30' and quest_id='q_shinjuku_3';
delete from public.canonical_quest_reward_pool_items where version='2026-08-30' and reward_pool_id='QP_NORMAL_q_shinjuku_3';
insert into public.canonical_quest_reward_pool_items(version,reward_pool_id,roll_index,item_id,quantity,probability_bp) values('2026-08-30','QP_NORMAL_q_shinjuku_3',1,'CHAR_EXP_M',1,10000);
insert into public.canonical_quest_reward_pool_items(version,reward_pool_id,roll_index,item_id,quantity,probability_bp) values('2026-08-30','QP_NORMAL_q_shinjuku_3',2,'EQUIP_EXP_M',1,10000);
delete from public.canonical_quest_reward_pool_items where version='2026-08-30' and reward_pool_id='QP_FIRST_q_shinjuku_3';
insert into public.canonical_quest_reward_pool_items(version,reward_pool_id,roll_index,item_id,quantity,probability_bp) values('2026-08-30','QP_FIRST_q_shinjuku_3',1,'CHAR_EXP_M',1,10000);
insert into public.canonical_quest_reward_pool_items(version,reward_pool_id,roll_index,item_id,quantity,probability_bp) values('2026-08-30','QP_FIRST_q_shinjuku_3',2,'EQUIP_EXP_M',1,10000);
update public.canonical_quest_master set progression_vitality_cost=6,progression_duration_sec=240,progression_user_exp=250,progression_cash_reward=600,progression_reward_pool_id='QP_NORMAL_q_shibuya_1',progression_first_clear_user_exp=175,progression_first_clear_cash_reward=450,progression_first_clear_reward_pool_id='QP_FIRST_q_shibuya_1',progression_boss_stat_multiplier_bp=10000,progression_boss_stats='{"hp":3600,"atk":390,"def":135,"spd":60,"luk":0}'::jsonb,progression_normal_reward_timing='EXPLORATION_COMPLETE',progression_first_clear_reward_timing='BOSS_VICTORY',progression_is_provisional=true where version='2026-08-30' and quest_id='q_shibuya_1';
delete from public.canonical_quest_reward_pool_items where version='2026-08-30' and reward_pool_id='QP_NORMAL_q_shibuya_1';
insert into public.canonical_quest_reward_pool_items(version,reward_pool_id,roll_index,item_id,quantity,probability_bp) values('2026-08-30','QP_NORMAL_q_shibuya_1',1,'CHAR_EXP_M',1,10000);
insert into public.canonical_quest_reward_pool_items(version,reward_pool_id,roll_index,item_id,quantity,probability_bp) values('2026-08-30','QP_NORMAL_q_shibuya_1',2,'EQUIP_EXP_M',1,10000);
delete from public.canonical_quest_reward_pool_items where version='2026-08-30' and reward_pool_id='QP_FIRST_q_shibuya_1';
insert into public.canonical_quest_reward_pool_items(version,reward_pool_id,roll_index,item_id,quantity,probability_bp) values('2026-08-30','QP_FIRST_q_shibuya_1',1,'CHAR_EXP_M',2,10000);
insert into public.canonical_quest_reward_pool_items(version,reward_pool_id,roll_index,item_id,quantity,probability_bp) values('2026-08-30','QP_FIRST_q_shibuya_1',2,'EQUIP_EXP_M',2,10000);
update public.canonical_quest_master set progression_vitality_cost=7,progression_duration_sec=300,progression_user_exp=300,progression_cash_reward=700,progression_reward_pool_id='QP_NORMAL_q_shibuya_2',progression_first_clear_user_exp=200,progression_first_clear_cash_reward=500,progression_first_clear_reward_pool_id='QP_FIRST_q_shibuya_2',progression_boss_stat_multiplier_bp=10000,progression_boss_stats='{"hp":4400,"atk":460,"def":160,"spd":60,"luk":0}'::jsonb,progression_normal_reward_timing='EXPLORATION_COMPLETE',progression_first_clear_reward_timing='BOSS_VICTORY',progression_is_provisional=true where version='2026-08-30' and quest_id='q_shibuya_2';
delete from public.canonical_quest_reward_pool_items where version='2026-08-30' and reward_pool_id='QP_NORMAL_q_shibuya_2';
insert into public.canonical_quest_reward_pool_items(version,reward_pool_id,roll_index,item_id,quantity,probability_bp) values('2026-08-30','QP_NORMAL_q_shibuya_2',1,'CHAR_EXP_M',1,10000);
insert into public.canonical_quest_reward_pool_items(version,reward_pool_id,roll_index,item_id,quantity,probability_bp) values('2026-08-30','QP_NORMAL_q_shibuya_2',2,'EQUIP_EXP_M',1,10000);
delete from public.canonical_quest_reward_pool_items where version='2026-08-30' and reward_pool_id='QP_FIRST_q_shibuya_2';
insert into public.canonical_quest_reward_pool_items(version,reward_pool_id,roll_index,item_id,quantity,probability_bp) values('2026-08-30','QP_FIRST_q_shibuya_2',1,'CHAR_EXP_M',2,10000);
insert into public.canonical_quest_reward_pool_items(version,reward_pool_id,roll_index,item_id,quantity,probability_bp) values('2026-08-30','QP_FIRST_q_shibuya_2',2,'EQUIP_EXP_M',2,10000);
update public.canonical_quest_master set progression_vitality_cost=8,progression_duration_sec=360,progression_user_exp=350,progression_cash_reward=800,progression_reward_pool_id='QP_NORMAL_q_shibuya_3',progression_first_clear_user_exp=225,progression_first_clear_cash_reward=550,progression_first_clear_reward_pool_id='QP_FIRST_q_shibuya_3',progression_boss_stat_multiplier_bp=10000,progression_boss_stats='{"hp":5200,"atk":530,"def":185,"spd":60,"luk":0}'::jsonb,progression_normal_reward_timing='EXPLORATION_COMPLETE',progression_first_clear_reward_timing='BOSS_VICTORY',progression_is_provisional=true where version='2026-08-30' and quest_id='q_shibuya_3';
delete from public.canonical_quest_reward_pool_items where version='2026-08-30' and reward_pool_id='QP_NORMAL_q_shibuya_3';
insert into public.canonical_quest_reward_pool_items(version,reward_pool_id,roll_index,item_id,quantity,probability_bp) values('2026-08-30','QP_NORMAL_q_shibuya_3',1,'CHAR_EXP_M',1,10000);
insert into public.canonical_quest_reward_pool_items(version,reward_pool_id,roll_index,item_id,quantity,probability_bp) values('2026-08-30','QP_NORMAL_q_shibuya_3',2,'EQUIP_EXP_M',1,10000);
delete from public.canonical_quest_reward_pool_items where version='2026-08-30' and reward_pool_id='QP_FIRST_q_shibuya_3';
insert into public.canonical_quest_reward_pool_items(version,reward_pool_id,roll_index,item_id,quantity,probability_bp) values('2026-08-30','QP_FIRST_q_shibuya_3',1,'CHAR_EXP_M',2,10000);
insert into public.canonical_quest_reward_pool_items(version,reward_pool_id,roll_index,item_id,quantity,probability_bp) values('2026-08-30','QP_FIRST_q_shibuya_3',2,'EQUIP_EXP_M',2,10000);
update public.canonical_quest_master set progression_vitality_cost=9,progression_duration_sec=420,progression_user_exp=400,progression_cash_reward=900,progression_reward_pool_id='QP_NORMAL_q_ikebukuro_1',progression_first_clear_user_exp=250,progression_first_clear_cash_reward=600,progression_first_clear_reward_pool_id='QP_FIRST_q_ikebukuro_1',progression_boss_stat_multiplier_bp=10000,progression_boss_stats='{"hp":6000,"atk":600,"def":210,"spd":60,"luk":0}'::jsonb,progression_normal_reward_timing='EXPLORATION_COMPLETE',progression_first_clear_reward_timing='BOSS_VICTORY',progression_is_provisional=true where version='2026-08-30' and quest_id='q_ikebukuro_1';
delete from public.canonical_quest_reward_pool_items where version='2026-08-30' and reward_pool_id='QP_NORMAL_q_ikebukuro_1';
insert into public.canonical_quest_reward_pool_items(version,reward_pool_id,roll_index,item_id,quantity,probability_bp) values('2026-08-30','QP_NORMAL_q_ikebukuro_1',1,'CHAR_EXP_M',1,10000);
insert into public.canonical_quest_reward_pool_items(version,reward_pool_id,roll_index,item_id,quantity,probability_bp) values('2026-08-30','QP_NORMAL_q_ikebukuro_1',2,'EQUIP_EXP_M',1,10000);
delete from public.canonical_quest_reward_pool_items where version='2026-08-30' and reward_pool_id='QP_FIRST_q_ikebukuro_1';
insert into public.canonical_quest_reward_pool_items(version,reward_pool_id,roll_index,item_id,quantity,probability_bp) values('2026-08-30','QP_FIRST_q_ikebukuro_1',1,'CHAR_EXP_M',3,10000);
insert into public.canonical_quest_reward_pool_items(version,reward_pool_id,roll_index,item_id,quantity,probability_bp) values('2026-08-30','QP_FIRST_q_ikebukuro_1',2,'EQUIP_EXP_M',3,10000);
update public.canonical_quest_master set progression_vitality_cost=10,progression_duration_sec=480,progression_user_exp=450,progression_cash_reward=1000,progression_reward_pool_id='QP_NORMAL_q_ikebukuro_2',progression_first_clear_user_exp=275,progression_first_clear_cash_reward=650,progression_first_clear_reward_pool_id='QP_FIRST_q_ikebukuro_2',progression_boss_stat_multiplier_bp=10000,progression_boss_stats='{"hp":6800,"atk":670,"def":235,"spd":60,"luk":0}'::jsonb,progression_normal_reward_timing='EXPLORATION_COMPLETE',progression_first_clear_reward_timing='BOSS_VICTORY',progression_is_provisional=true where version='2026-08-30' and quest_id='q_ikebukuro_2';
delete from public.canonical_quest_reward_pool_items where version='2026-08-30' and reward_pool_id='QP_NORMAL_q_ikebukuro_2';
insert into public.canonical_quest_reward_pool_items(version,reward_pool_id,roll_index,item_id,quantity,probability_bp) values('2026-08-30','QP_NORMAL_q_ikebukuro_2',1,'CHAR_EXP_M',2,10000);
insert into public.canonical_quest_reward_pool_items(version,reward_pool_id,roll_index,item_id,quantity,probability_bp) values('2026-08-30','QP_NORMAL_q_ikebukuro_2',2,'EQUIP_EXP_M',2,10000);
delete from public.canonical_quest_reward_pool_items where version='2026-08-30' and reward_pool_id='QP_FIRST_q_ikebukuro_2';
insert into public.canonical_quest_reward_pool_items(version,reward_pool_id,roll_index,item_id,quantity,probability_bp) values('2026-08-30','QP_FIRST_q_ikebukuro_2',1,'CHAR_EXP_M',3,10000);
insert into public.canonical_quest_reward_pool_items(version,reward_pool_id,roll_index,item_id,quantity,probability_bp) values('2026-08-30','QP_FIRST_q_ikebukuro_2',2,'EQUIP_EXP_M',3,10000);
update public.canonical_quest_master set progression_vitality_cost=11,progression_duration_sec=540,progression_user_exp=500,progression_cash_reward=1100,progression_reward_pool_id='QP_NORMAL_q_ikebukuro_3',progression_first_clear_user_exp=300,progression_first_clear_cash_reward=700,progression_first_clear_reward_pool_id='QP_FIRST_q_ikebukuro_3',progression_boss_stat_multiplier_bp=10000,progression_boss_stats='{"hp":7600,"atk":740,"def":260,"spd":60,"luk":0}'::jsonb,progression_normal_reward_timing='EXPLORATION_COMPLETE',progression_first_clear_reward_timing='BOSS_VICTORY',progression_is_provisional=true where version='2026-08-30' and quest_id='q_ikebukuro_3';
delete from public.canonical_quest_reward_pool_items where version='2026-08-30' and reward_pool_id='QP_NORMAL_q_ikebukuro_3';
insert into public.canonical_quest_reward_pool_items(version,reward_pool_id,roll_index,item_id,quantity,probability_bp) values('2026-08-30','QP_NORMAL_q_ikebukuro_3',1,'CHAR_EXP_M',2,10000);
insert into public.canonical_quest_reward_pool_items(version,reward_pool_id,roll_index,item_id,quantity,probability_bp) values('2026-08-30','QP_NORMAL_q_ikebukuro_3',2,'EQUIP_EXP_M',2,10000);
delete from public.canonical_quest_reward_pool_items where version='2026-08-30' and reward_pool_id='QP_FIRST_q_ikebukuro_3';
insert into public.canonical_quest_reward_pool_items(version,reward_pool_id,roll_index,item_id,quantity,probability_bp) values('2026-08-30','QP_FIRST_q_ikebukuro_3',1,'CHAR_EXP_M',3,10000);
insert into public.canonical_quest_reward_pool_items(version,reward_pool_id,roll_index,item_id,quantity,probability_bp) values('2026-08-30','QP_FIRST_q_ikebukuro_3',2,'EQUIP_EXP_M',3,10000);
update public.canonical_quest_master set progression_vitality_cost=12,progression_duration_sec=600,progression_user_exp=550,progression_cash_reward=1200,progression_reward_pool_id='QP_NORMAL_q_roppongi_1',progression_first_clear_user_exp=325,progression_first_clear_cash_reward=750,progression_first_clear_reward_pool_id='QP_FIRST_q_roppongi_1',progression_boss_stat_multiplier_bp=10000,progression_boss_stats='{"hp":8400,"atk":810,"def":285,"spd":60,"luk":0}'::jsonb,progression_normal_reward_timing='EXPLORATION_COMPLETE',progression_first_clear_reward_timing='BOSS_VICTORY',progression_is_provisional=true where version='2026-08-30' and quest_id='q_roppongi_1';
delete from public.canonical_quest_reward_pool_items where version='2026-08-30' and reward_pool_id='QP_NORMAL_q_roppongi_1';
insert into public.canonical_quest_reward_pool_items(version,reward_pool_id,roll_index,item_id,quantity,probability_bp) values('2026-08-30','QP_NORMAL_q_roppongi_1',1,'CHAR_EXP_M',2,10000);
insert into public.canonical_quest_reward_pool_items(version,reward_pool_id,roll_index,item_id,quantity,probability_bp) values('2026-08-30','QP_NORMAL_q_roppongi_1',2,'EQUIP_EXP_M',2,10000);
delete from public.canonical_quest_reward_pool_items where version='2026-08-30' and reward_pool_id='QP_FIRST_q_roppongi_1';
insert into public.canonical_quest_reward_pool_items(version,reward_pool_id,roll_index,item_id,quantity,probability_bp) values('2026-08-30','QP_FIRST_q_roppongi_1',1,'CHAR_EXP_M',4,10000);
insert into public.canonical_quest_reward_pool_items(version,reward_pool_id,roll_index,item_id,quantity,probability_bp) values('2026-08-30','QP_FIRST_q_roppongi_1',2,'EQUIP_EXP_M',4,10000);
update public.canonical_quest_master set progression_vitality_cost=13,progression_duration_sec=660,progression_user_exp=600,progression_cash_reward=1300,progression_reward_pool_id='QP_NORMAL_q_roppongi_2',progression_first_clear_user_exp=350,progression_first_clear_cash_reward=800,progression_first_clear_reward_pool_id='QP_FIRST_q_roppongi_2',progression_boss_stat_multiplier_bp=10000,progression_boss_stats='{"hp":9200,"atk":880,"def":310,"spd":60,"luk":0}'::jsonb,progression_normal_reward_timing='EXPLORATION_COMPLETE',progression_first_clear_reward_timing='BOSS_VICTORY',progression_is_provisional=true where version='2026-08-30' and quest_id='q_roppongi_2';
delete from public.canonical_quest_reward_pool_items where version='2026-08-30' and reward_pool_id='QP_NORMAL_q_roppongi_2';
insert into public.canonical_quest_reward_pool_items(version,reward_pool_id,roll_index,item_id,quantity,probability_bp) values('2026-08-30','QP_NORMAL_q_roppongi_2',1,'CHAR_EXP_M',2,10000);
insert into public.canonical_quest_reward_pool_items(version,reward_pool_id,roll_index,item_id,quantity,probability_bp) values('2026-08-30','QP_NORMAL_q_roppongi_2',2,'EQUIP_EXP_M',2,10000);
delete from public.canonical_quest_reward_pool_items where version='2026-08-30' and reward_pool_id='QP_FIRST_q_roppongi_2';
insert into public.canonical_quest_reward_pool_items(version,reward_pool_id,roll_index,item_id,quantity,probability_bp) values('2026-08-30','QP_FIRST_q_roppongi_2',1,'CHAR_EXP_M',4,10000);
insert into public.canonical_quest_reward_pool_items(version,reward_pool_id,roll_index,item_id,quantity,probability_bp) values('2026-08-30','QP_FIRST_q_roppongi_2',2,'EQUIP_EXP_M',4,10000);
update public.canonical_quest_master set progression_vitality_cost=14,progression_duration_sec=720,progression_user_exp=650,progression_cash_reward=1400,progression_reward_pool_id='QP_NORMAL_q_roppongi_3',progression_first_clear_user_exp=375,progression_first_clear_cash_reward=850,progression_first_clear_reward_pool_id='QP_FIRST_q_roppongi_3',progression_boss_stat_multiplier_bp=10000,progression_boss_stats='{"hp":10000,"atk":950,"def":335,"spd":60,"luk":0}'::jsonb,progression_normal_reward_timing='EXPLORATION_COMPLETE',progression_first_clear_reward_timing='BOSS_VICTORY',progression_is_provisional=true where version='2026-08-30' and quest_id='q_roppongi_3';
delete from public.canonical_quest_reward_pool_items where version='2026-08-30' and reward_pool_id='QP_NORMAL_q_roppongi_3';
insert into public.canonical_quest_reward_pool_items(version,reward_pool_id,roll_index,item_id,quantity,probability_bp) values('2026-08-30','QP_NORMAL_q_roppongi_3',1,'CHAR_EXP_M',2,10000);
insert into public.canonical_quest_reward_pool_items(version,reward_pool_id,roll_index,item_id,quantity,probability_bp) values('2026-08-30','QP_NORMAL_q_roppongi_3',2,'EQUIP_EXP_M',2,10000);
delete from public.canonical_quest_reward_pool_items where version='2026-08-30' and reward_pool_id='QP_FIRST_q_roppongi_3';
insert into public.canonical_quest_reward_pool_items(version,reward_pool_id,roll_index,item_id,quantity,probability_bp) values('2026-08-30','QP_FIRST_q_roppongi_3',1,'CHAR_EXP_M',4,10000);
insert into public.canonical_quest_reward_pool_items(version,reward_pool_id,roll_index,item_id,quantity,probability_bp) values('2026-08-30','QP_FIRST_q_roppongi_3',2,'EQUIP_EXP_M',4,10000);
update public.canonical_quest_master set progression_vitality_cost=15,progression_duration_sec=780,progression_user_exp=700,progression_cash_reward=1500,progression_reward_pool_id='QP_NORMAL_q_akihabara_1',progression_first_clear_user_exp=400,progression_first_clear_cash_reward=900,progression_first_clear_reward_pool_id='QP_FIRST_q_akihabara_1',progression_boss_stat_multiplier_bp=10000,progression_boss_stats='{"hp":10800,"atk":1020,"def":360,"spd":60,"luk":0}'::jsonb,progression_normal_reward_timing='EXPLORATION_COMPLETE',progression_first_clear_reward_timing='BOSS_VICTORY',progression_is_provisional=true where version='2026-08-30' and quest_id='q_akihabara_1';
delete from public.canonical_quest_reward_pool_items where version='2026-08-30' and reward_pool_id='QP_NORMAL_q_akihabara_1';
insert into public.canonical_quest_reward_pool_items(version,reward_pool_id,roll_index,item_id,quantity,probability_bp) values('2026-08-30','QP_NORMAL_q_akihabara_1',1,'CHAR_EXP_M',2,10000);
insert into public.canonical_quest_reward_pool_items(version,reward_pool_id,roll_index,item_id,quantity,probability_bp) values('2026-08-30','QP_NORMAL_q_akihabara_1',2,'EQUIP_EXP_M',2,10000);
delete from public.canonical_quest_reward_pool_items where version='2026-08-30' and reward_pool_id='QP_FIRST_q_akihabara_1';
insert into public.canonical_quest_reward_pool_items(version,reward_pool_id,roll_index,item_id,quantity,probability_bp) values('2026-08-30','QP_FIRST_q_akihabara_1',1,'CHAR_EXP_M',5,10000);
insert into public.canonical_quest_reward_pool_items(version,reward_pool_id,roll_index,item_id,quantity,probability_bp) values('2026-08-30','QP_FIRST_q_akihabara_1',2,'EQUIP_EXP_M',5,10000);
update public.canonical_quest_master set progression_vitality_cost=16,progression_duration_sec=840,progression_user_exp=750,progression_cash_reward=1600,progression_reward_pool_id='QP_NORMAL_q_akihabara_2',progression_first_clear_user_exp=425,progression_first_clear_cash_reward=950,progression_first_clear_reward_pool_id='QP_FIRST_q_akihabara_2',progression_boss_stat_multiplier_bp=10000,progression_boss_stats='{"hp":11600,"atk":1090,"def":385,"spd":60,"luk":0}'::jsonb,progression_normal_reward_timing='EXPLORATION_COMPLETE',progression_first_clear_reward_timing='BOSS_VICTORY',progression_is_provisional=true where version='2026-08-30' and quest_id='q_akihabara_2';
delete from public.canonical_quest_reward_pool_items where version='2026-08-30' and reward_pool_id='QP_NORMAL_q_akihabara_2';
insert into public.canonical_quest_reward_pool_items(version,reward_pool_id,roll_index,item_id,quantity,probability_bp) values('2026-08-30','QP_NORMAL_q_akihabara_2',1,'CHAR_EXP_M',2,10000);
insert into public.canonical_quest_reward_pool_items(version,reward_pool_id,roll_index,item_id,quantity,probability_bp) values('2026-08-30','QP_NORMAL_q_akihabara_2',2,'EQUIP_EXP_M',2,10000);
delete from public.canonical_quest_reward_pool_items where version='2026-08-30' and reward_pool_id='QP_FIRST_q_akihabara_2';
insert into public.canonical_quest_reward_pool_items(version,reward_pool_id,roll_index,item_id,quantity,probability_bp) values('2026-08-30','QP_FIRST_q_akihabara_2',1,'CHAR_EXP_M',5,10000);
insert into public.canonical_quest_reward_pool_items(version,reward_pool_id,roll_index,item_id,quantity,probability_bp) values('2026-08-30','QP_FIRST_q_akihabara_2',2,'EQUIP_EXP_M',5,10000);
update public.canonical_quest_master set progression_vitality_cost=17,progression_duration_sec=900,progression_user_exp=800,progression_cash_reward=1700,progression_reward_pool_id='QP_NORMAL_q_akihabara_3',progression_first_clear_user_exp=450,progression_first_clear_cash_reward=1000,progression_first_clear_reward_pool_id='QP_FIRST_q_akihabara_3',progression_boss_stat_multiplier_bp=10000,progression_boss_stats='{"hp":12400,"atk":1160,"def":410,"spd":60,"luk":0}'::jsonb,progression_normal_reward_timing='EXPLORATION_COMPLETE',progression_first_clear_reward_timing='BOSS_VICTORY',progression_is_provisional=true where version='2026-08-30' and quest_id='q_akihabara_3';
delete from public.canonical_quest_reward_pool_items where version='2026-08-30' and reward_pool_id='QP_NORMAL_q_akihabara_3';
insert into public.canonical_quest_reward_pool_items(version,reward_pool_id,roll_index,item_id,quantity,probability_bp) values('2026-08-30','QP_NORMAL_q_akihabara_3',1,'CHAR_EXP_M',3,10000);
insert into public.canonical_quest_reward_pool_items(version,reward_pool_id,roll_index,item_id,quantity,probability_bp) values('2026-08-30','QP_NORMAL_q_akihabara_3',2,'EQUIP_EXP_M',3,10000);
delete from public.canonical_quest_reward_pool_items where version='2026-08-30' and reward_pool_id='QP_FIRST_q_akihabara_3';
insert into public.canonical_quest_reward_pool_items(version,reward_pool_id,roll_index,item_id,quantity,probability_bp) values('2026-08-30','QP_FIRST_q_akihabara_3',1,'CHAR_EXP_M',5,10000);
insert into public.canonical_quest_reward_pool_items(version,reward_pool_id,roll_index,item_id,quantity,probability_bp) values('2026-08-30','QP_FIRST_q_akihabara_3',2,'EQUIP_EXP_M',5,10000);
update public.canonical_quest_master set progression_vitality_cost=18,progression_duration_sec=960,progression_user_exp=850,progression_cash_reward=1800,progression_reward_pool_id='QP_NORMAL_q_kawasaki_1',progression_first_clear_user_exp=475,progression_first_clear_cash_reward=1050,progression_first_clear_reward_pool_id='QP_FIRST_q_kawasaki_1',progression_boss_stat_multiplier_bp=10000,progression_boss_stats='{"hp":13200,"atk":1230,"def":435,"spd":60,"luk":0}'::jsonb,progression_normal_reward_timing='EXPLORATION_COMPLETE',progression_first_clear_reward_timing='BOSS_VICTORY',progression_is_provisional=true where version='2026-08-30' and quest_id='q_kawasaki_1';
delete from public.canonical_quest_reward_pool_items where version='2026-08-30' and reward_pool_id='QP_NORMAL_q_kawasaki_1';
insert into public.canonical_quest_reward_pool_items(version,reward_pool_id,roll_index,item_id,quantity,probability_bp) values('2026-08-30','QP_NORMAL_q_kawasaki_1',1,'CHAR_EXP_M',3,10000);
insert into public.canonical_quest_reward_pool_items(version,reward_pool_id,roll_index,item_id,quantity,probability_bp) values('2026-08-30','QP_NORMAL_q_kawasaki_1',2,'EQUIP_EXP_M',3,10000);
delete from public.canonical_quest_reward_pool_items where version='2026-08-30' and reward_pool_id='QP_FIRST_q_kawasaki_1';
insert into public.canonical_quest_reward_pool_items(version,reward_pool_id,roll_index,item_id,quantity,probability_bp) values('2026-08-30','QP_FIRST_q_kawasaki_1',1,'CHAR_EXP_M',6,10000);
insert into public.canonical_quest_reward_pool_items(version,reward_pool_id,roll_index,item_id,quantity,probability_bp) values('2026-08-30','QP_FIRST_q_kawasaki_1',2,'EQUIP_EXP_M',6,10000);
update public.canonical_quest_master set progression_vitality_cost=19,progression_duration_sec=1020,progression_user_exp=900,progression_cash_reward=1900,progression_reward_pool_id='QP_NORMAL_q_kawasaki_2',progression_first_clear_user_exp=500,progression_first_clear_cash_reward=1100,progression_first_clear_reward_pool_id='QP_FIRST_q_kawasaki_2',progression_boss_stat_multiplier_bp=10000,progression_boss_stats='{"hp":14000,"atk":1300,"def":460,"spd":60,"luk":0}'::jsonb,progression_normal_reward_timing='EXPLORATION_COMPLETE',progression_first_clear_reward_timing='BOSS_VICTORY',progression_is_provisional=true where version='2026-08-30' and quest_id='q_kawasaki_2';
delete from public.canonical_quest_reward_pool_items where version='2026-08-30' and reward_pool_id='QP_NORMAL_q_kawasaki_2';
insert into public.canonical_quest_reward_pool_items(version,reward_pool_id,roll_index,item_id,quantity,probability_bp) values('2026-08-30','QP_NORMAL_q_kawasaki_2',1,'CHAR_EXP_M',3,10000);
insert into public.canonical_quest_reward_pool_items(version,reward_pool_id,roll_index,item_id,quantity,probability_bp) values('2026-08-30','QP_NORMAL_q_kawasaki_2',2,'EQUIP_EXP_M',3,10000);
delete from public.canonical_quest_reward_pool_items where version='2026-08-30' and reward_pool_id='QP_FIRST_q_kawasaki_2';
insert into public.canonical_quest_reward_pool_items(version,reward_pool_id,roll_index,item_id,quantity,probability_bp) values('2026-08-30','QP_FIRST_q_kawasaki_2',1,'CHAR_EXP_M',6,10000);
insert into public.canonical_quest_reward_pool_items(version,reward_pool_id,roll_index,item_id,quantity,probability_bp) values('2026-08-30','QP_FIRST_q_kawasaki_2',2,'EQUIP_EXP_M',6,10000);
update public.canonical_quest_master set progression_vitality_cost=20,progression_duration_sec=1080,progression_user_exp=950,progression_cash_reward=2000,progression_reward_pool_id='QP_NORMAL_q_kawasaki_3',progression_first_clear_user_exp=525,progression_first_clear_cash_reward=1150,progression_first_clear_reward_pool_id='QP_FIRST_q_kawasaki_3',progression_boss_stat_multiplier_bp=10000,progression_boss_stats='{"hp":14800,"atk":1370,"def":485,"spd":60,"luk":0}'::jsonb,progression_normal_reward_timing='EXPLORATION_COMPLETE',progression_first_clear_reward_timing='BOSS_VICTORY',progression_is_provisional=true where version='2026-08-30' and quest_id='q_kawasaki_3';
delete from public.canonical_quest_reward_pool_items where version='2026-08-30' and reward_pool_id='QP_NORMAL_q_kawasaki_3';
insert into public.canonical_quest_reward_pool_items(version,reward_pool_id,roll_index,item_id,quantity,probability_bp) values('2026-08-30','QP_NORMAL_q_kawasaki_3',1,'CHAR_EXP_M',3,10000);
insert into public.canonical_quest_reward_pool_items(version,reward_pool_id,roll_index,item_id,quantity,probability_bp) values('2026-08-30','QP_NORMAL_q_kawasaki_3',2,'EQUIP_EXP_M',3,10000);
delete from public.canonical_quest_reward_pool_items where version='2026-08-30' and reward_pool_id='QP_FIRST_q_kawasaki_3';
insert into public.canonical_quest_reward_pool_items(version,reward_pool_id,roll_index,item_id,quantity,probability_bp) values('2026-08-30','QP_FIRST_q_kawasaki_3',1,'CHAR_EXP_M',6,10000);
insert into public.canonical_quest_reward_pool_items(version,reward_pool_id,roll_index,item_id,quantity,probability_bp) values('2026-08-30','QP_FIRST_q_kawasaki_3',2,'EQUIP_EXP_M',6,10000);
update public.canonical_quest_master set progression_vitality_cost=21,progression_duration_sec=1140,progression_user_exp=1000,progression_cash_reward=2100,progression_reward_pool_id='QP_NORMAL_q_yokohama_1',progression_first_clear_user_exp=550,progression_first_clear_cash_reward=1200,progression_first_clear_reward_pool_id='QP_FIRST_q_yokohama_1',progression_boss_stat_multiplier_bp=10000,progression_boss_stats='{"hp":15600,"atk":1440,"def":510,"spd":60,"luk":0}'::jsonb,progression_normal_reward_timing='EXPLORATION_COMPLETE',progression_first_clear_reward_timing='BOSS_VICTORY',progression_is_provisional=true where version='2026-08-30' and quest_id='q_yokohama_1';
delete from public.canonical_quest_reward_pool_items where version='2026-08-30' and reward_pool_id='QP_NORMAL_q_yokohama_1';
insert into public.canonical_quest_reward_pool_items(version,reward_pool_id,roll_index,item_id,quantity,probability_bp) values('2026-08-30','QP_NORMAL_q_yokohama_1',1,'CHAR_EXP_M',3,10000);
insert into public.canonical_quest_reward_pool_items(version,reward_pool_id,roll_index,item_id,quantity,probability_bp) values('2026-08-30','QP_NORMAL_q_yokohama_1',2,'EQUIP_EXP_M',3,10000);
delete from public.canonical_quest_reward_pool_items where version='2026-08-30' and reward_pool_id='QP_FIRST_q_yokohama_1';
insert into public.canonical_quest_reward_pool_items(version,reward_pool_id,roll_index,item_id,quantity,probability_bp) values('2026-08-30','QP_FIRST_q_yokohama_1',1,'CHAR_EXP_M',7,10000);
insert into public.canonical_quest_reward_pool_items(version,reward_pool_id,roll_index,item_id,quantity,probability_bp) values('2026-08-30','QP_FIRST_q_yokohama_1',2,'EQUIP_EXP_M',7,10000);
update public.canonical_quest_master set progression_vitality_cost=22,progression_duration_sec=1200,progression_user_exp=1050,progression_cash_reward=2200,progression_reward_pool_id='QP_NORMAL_q_yokohama_2',progression_first_clear_user_exp=575,progression_first_clear_cash_reward=1250,progression_first_clear_reward_pool_id='QP_FIRST_q_yokohama_2',progression_boss_stat_multiplier_bp=10000,progression_boss_stats='{"hp":16400,"atk":1510,"def":535,"spd":60,"luk":0}'::jsonb,progression_normal_reward_timing='EXPLORATION_COMPLETE',progression_first_clear_reward_timing='BOSS_VICTORY',progression_is_provisional=true where version='2026-08-30' and quest_id='q_yokohama_2';
delete from public.canonical_quest_reward_pool_items where version='2026-08-30' and reward_pool_id='QP_NORMAL_q_yokohama_2';
insert into public.canonical_quest_reward_pool_items(version,reward_pool_id,roll_index,item_id,quantity,probability_bp) values('2026-08-30','QP_NORMAL_q_yokohama_2',1,'CHAR_EXP_M',3,10000);
insert into public.canonical_quest_reward_pool_items(version,reward_pool_id,roll_index,item_id,quantity,probability_bp) values('2026-08-30','QP_NORMAL_q_yokohama_2',2,'EQUIP_EXP_M',3,10000);
delete from public.canonical_quest_reward_pool_items where version='2026-08-30' and reward_pool_id='QP_FIRST_q_yokohama_2';
insert into public.canonical_quest_reward_pool_items(version,reward_pool_id,roll_index,item_id,quantity,probability_bp) values('2026-08-30','QP_FIRST_q_yokohama_2',1,'CHAR_EXP_M',7,10000);
insert into public.canonical_quest_reward_pool_items(version,reward_pool_id,roll_index,item_id,quantity,probability_bp) values('2026-08-30','QP_FIRST_q_yokohama_2',2,'EQUIP_EXP_M',7,10000);
update public.canonical_quest_master set progression_vitality_cost=23,progression_duration_sec=1260,progression_user_exp=1100,progression_cash_reward=2300,progression_reward_pool_id='QP_NORMAL_q_yokohama_3',progression_first_clear_user_exp=600,progression_first_clear_cash_reward=1300,progression_first_clear_reward_pool_id='QP_FIRST_q_yokohama_3',progression_boss_stat_multiplier_bp=10000,progression_boss_stats='{"hp":17200,"atk":1580,"def":560,"spd":60,"luk":0}'::jsonb,progression_normal_reward_timing='EXPLORATION_COMPLETE',progression_first_clear_reward_timing='BOSS_VICTORY',progression_is_provisional=true where version='2026-08-30' and quest_id='q_yokohama_3';
delete from public.canonical_quest_reward_pool_items where version='2026-08-30' and reward_pool_id='QP_NORMAL_q_yokohama_3';
insert into public.canonical_quest_reward_pool_items(version,reward_pool_id,roll_index,item_id,quantity,probability_bp) values('2026-08-30','QP_NORMAL_q_yokohama_3',1,'CHAR_EXP_M',3,10000);
insert into public.canonical_quest_reward_pool_items(version,reward_pool_id,roll_index,item_id,quantity,probability_bp) values('2026-08-30','QP_NORMAL_q_yokohama_3',2,'EQUIP_EXP_M',3,10000);
delete from public.canonical_quest_reward_pool_items where version='2026-08-30' and reward_pool_id='QP_FIRST_q_yokohama_3';
insert into public.canonical_quest_reward_pool_items(version,reward_pool_id,roll_index,item_id,quantity,probability_bp) values('2026-08-30','QP_FIRST_q_yokohama_3',1,'CHAR_EXP_M',7,10000);
insert into public.canonical_quest_reward_pool_items(version,reward_pool_id,roll_index,item_id,quantity,probability_bp) values('2026-08-30','QP_FIRST_q_yokohama_3',2,'EQUIP_EXP_M',7,10000);

-- 初回CASH・XP・アイテムを同一トランザクションで一度だけ付与する内部関数。
create table if not exists public.quest_progression_first_reward_receipts (
 user_id uuid not null references public.users(id) on delete cascade,
 quest_id text not null references public.quests(id),
 patrol_id uuid not null,
 reward jsonb not null default '{}'::jsonb,
 granted_at timestamptz not null default clock_timestamp(),
 primary key(user_id,quest_id)
);
alter table public.quest_progression_first_reward_receipts enable row level security;
revoke all on public.quest_progression_first_reward_receipts from public,anon,authenticated;
grant select on public.quest_progression_first_reward_receipts to authenticated;
grant all on public.quest_progression_first_reward_receipts to service_role;
drop policy if exists quest_progression_first_reward_own on public.quest_progression_first_reward_receipts;
create policy quest_progression_first_reward_own on public.quest_progression_first_reward_receipts for select to authenticated using(user_id=(select auth.uid()));

create or replace function public._grant_quest_progression_first_reward_v1(p_user_id uuid,p_quest_id text,p_patrol_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_q public.canonical_quest_master%rowtype; v_receipt jsonb; v_inserted boolean; v_item record;
 v_items jsonb:='[]'::jsonb; v_cash integer; v_xp integer; v_xp_result jsonb;
begin
 if p_user_id is null or (auth.uid() is not null and auth.uid()<>p_user_id) then raise exception 'Quest reward owner mismatch' using errcode='42501'; end if;
 if not exists(select 1 from public.user_quest_first_clears where user_id=p_user_id and quest_id=p_quest_id) then raise exception 'Quest first clear is not recorded'; end if;
 if not exists(select 1 from public.user_patrols where id=p_patrol_id and user_id=p_user_id and coalesce(course_id,quest_id)=p_quest_id) then raise exception 'Quest patrol owner mismatch'; end if;
 select * into strict v_q from public.canonical_quest_master where version='2026-08-30' and quest_id=p_quest_id and is_production_enabled;
 insert into public.quest_progression_first_reward_receipts(user_id,quest_id,patrol_id)
 values(p_user_id,p_quest_id,p_patrol_id) on conflict do nothing returning true into v_inserted;
 if not coalesce(v_inserted,false) then
  select reward into v_receipt from public.quest_progression_first_reward_receipts where user_id=p_user_id and quest_id=p_quest_id;
  return v_receipt;
 end if;
 v_cash:=coalesce(v_q.progression_first_clear_cash_reward,0); v_xp:=coalesce(v_q.progression_first_clear_user_exp,0);
 for v_item in select * from public.canonical_quest_reward_pool_items where version=v_q.version and reward_pool_id=v_q.progression_first_clear_reward_pool_id order by roll_index loop
  if floor(random()*10000)::integer<v_item.probability_bp then
   v_item.item_id:=public.resolve_canonical_reward_item(v_item.item_id);
   perform public._grant_gameplay_reward_v1(p_user_id,'QUEST_DROP','progression:first:'||p_quest_id||':'||v_item.roll_index,v_item.item_id,v_item.quantity);
   v_items:=v_items||jsonb_build_array(jsonb_build_object('item_id',v_item.item_id,'quantity',v_item.quantity));
  end if;
 end loop;
 if v_cash>0 then update public.users set cash=coalesce(cash,0)+v_cash where id=p_user_id; end if;
 if v_xp>0 then v_xp_result:=public.apply_user_xp(p_user_id,v_xp); end if;
 v_receipt:=jsonb_build_object('cash',v_cash,'xp',v_xp,'items',v_items,'first_clear',true,'xp_result',v_xp_result);
 update public.quest_progression_first_reward_receipts set reward=v_receipt where user_id=p_user_id and quest_id=p_quest_id;
 return v_receipt;
end $$;
revoke all on function public._grant_quest_progression_first_reward_v1(uuid,text,uuid) from public,anon,authenticated;

commit;
