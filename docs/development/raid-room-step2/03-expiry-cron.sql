-- DB/Edge対応・運用競合解消後の別transaction。既定ROLLBACK。
begin;
set local lock_timeout='2s';
set local statement_timeout='10s';
do $schedule$
begin
 if to_regprocedure('public.finalize_expired_raid_rooms_v1(integer)') is null then raise exception 'Room expiry RPC missing'; end if;
 if exists(select 1 from cron.job where jobname='raid-room-expiry-minute') then raise exception 'Room job already exists; inspect definition'; end if;
 perform cron.schedule('raid-room-expiry-minute','* * * * *',$job$select public.finalize_expired_raid_rooms_v1(100);$job$);
end $schedule$;
select jobid,jobname,schedule,command,active from cron.job order by jobid;
rollback;
