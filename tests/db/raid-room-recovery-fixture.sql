-- Cron登録契約のdouble。pg_cronの実スケジューラー/実行workerではない。
create schema cron;
create table cron.job(jobid bigint generated always as identity primary key,jobname text,schedule text,command text);
create function cron.schedule(text,text,text) returns bigint language plpgsql as $$
declare v_id bigint; begin
 insert into cron.job(jobname,schedule,command) values($1,$2,$3) returning jobid into v_id;
 return v_id;
end $$;
create function cron.unschedule(bigint) returns boolean language plpgsql as $$
begin delete from cron.job where jobid=$1; return found; end $$;
