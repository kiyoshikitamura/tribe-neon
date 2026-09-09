-- Present実関数に必要な既存schemaの最小列。実DBや全migrationの複製ではない。
alter table presents add column claimed_at timestamptz, add column created_at timestamptz default now();
alter table users add column neon_diamonds bigint default 0;
create table equipment_battle_master(equipment_id text primary key);
create table user_equipments(user_id uuid,equipment_id text,equipment_master_id text,level int,plus_val int);
create table user_items(user_id uuid,item_id text,quantity int,primary key(user_id,item_id));
alter table presents add column source_kind text,add column source_key text,add column source_metadata jsonb;
create unique index presents_source_unique on presents(user_id,source_kind,source_key) where source_kind is not null and source_key is not null;
