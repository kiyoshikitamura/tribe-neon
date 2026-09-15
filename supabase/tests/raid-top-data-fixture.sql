-- 隔離DBだけの追加fixture。人物名は検証データ、敵IDは現行マスター。
alter table users add column favorite_character_id text;
update users set favorite_character_id='char_reiji_01';
delete from canonical_raid_variants;
insert into users(id,username,favorite_character_id) select ('00000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'確認用'||n,'char_reiji_01' from generate_series(31,60)n;
insert into user_main_formations select id,gen_random_uuid() from users where id>='00000000-0000-0000-0000-000000000031';
insert into creation_fixture_power select id,300000 from users where id>='00000000-0000-0000-0000-000000000031';
