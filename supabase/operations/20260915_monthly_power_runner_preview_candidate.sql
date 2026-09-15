-- Preview sufvuqdnqohpfzkwxohq 専用の登録候補。既定はROLLBACK。
-- Migrationではない。Productionで実行しない。cron有効化・Season操作は行わない。
begin;
set local lock_timeout='3s';
set local statement_timeout='30s';
do $$
declare existing cron.job%rowtype; jid bigint;
begin
 if md5(pg_get_functiondef('public.finalize_due_monthly_power_seasons_v1()'::regprocedure)) <> 'f1a7b786e85afc53bdd6d6d4022d7ec2' then
  raise exception 'Monthly runner definition drift';
 end if;
 if has_function_privilege('anon','public.finalize_due_monthly_power_seasons_v1()','EXECUTE')
 or has_function_privilege('authenticated','public.finalize_due_monthly_power_seasons_v1()','EXECUTE')
 or not has_function_privilege('service_role','public.finalize_due_monthly_power_seasons_v1()','EXECUTE') then
  raise exception 'Monthly runner privilege drift';
 end if;
 if to_regprocedure('public.advance_monthly_power_seasons_v1()') is null then raise exception 'Monthly rollover definition required';end if;
 select * into existing from cron.job where jobname='ranking-power-monthly-finalize-v1';
 if found then
  if existing.command not in ('select public.finalize_due_monthly_power_seasons_v1();','select public.advance_monthly_power_seasons_v1();')
    or existing.schedule <> '*/5 * * * *' or existing.active then
   raise exception 'Existing monthly cron requires review';
  end if;
  perform cron.alter_job(existing.jobid,command:='select public.advance_monthly_power_seasons_v1();',active:=false);
 else
  jid:=cron.schedule('ranking-power-monthly-finalize-v1','*/5 * * * *','select public.advance_monthly_power_seasons_v1();');
  perform cron.alter_job(jid,active:=false);
 end if;
end $$;
select jobname,schedule,command,active from cron.job where jobname='ranking-power-monthly-finalize-v1';
rollback;
