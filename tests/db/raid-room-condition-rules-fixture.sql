-- 最小のローカル依存。外部Auth・DB・既存マスターを使用しない。
create role anon;
create role authenticated;
create role service_role;
create role condition_public_probe;
grant usage on schema public to anon, authenticated, service_role, condition_public_probe;
