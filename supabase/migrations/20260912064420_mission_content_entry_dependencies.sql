-- LOCAL CANDIDATE ONLY. No grants/backfill; preserve within-content progression.
-- Requires Preview impact review before production application.
begin;
do $$
begin
  if (select count(*) from public.missions where id in ('MIS_N_P004','MIS_N_P006','MIS_N_P008','MIS_N_P010')) <> 4 then
    raise exception 'mission entry master incomplete';
  end if;
  if exists (
    select 1 from (values ('MIS_N_P004','MIS_N_P003'),('MIS_N_P006','MIS_N_P005'),
      ('MIS_N_P008','MIS_N_P007'),('MIS_N_P010','MIS_N_P009')) expected(id, prior)
    join public.missions m on m.id=expected.id
    where m.prerequisite_mission_id is not null and m.prerequisite_mission_id <> expected.prior
  ) then raise exception 'mission prerequisite drift'; end if;
end $$;
update public.missions set prerequisite_mission_id=null
where id in ('MIS_N_P004','MIS_N_P006','MIS_N_P008','MIS_N_P010');
update public.missions set next_mission_id=null
where (id,next_mission_id) in (('MIS_N_P003','MIS_N_P004'),('MIS_N_P005','MIS_N_P006'),
  ('MIS_N_P007','MIS_N_P008'),('MIS_N_P009','MIS_N_P010'));
-- Existing sync initializes newly available rows. Existing progress/claims untouched.
commit;
