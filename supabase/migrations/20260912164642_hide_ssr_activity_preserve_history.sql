-- 最新の運営方針: SSR獲得は全体Activityに表示しない。既存履歴は保持する。
-- Preview実定義に対する限定差分。QA除外・24時間・他Activity・取得件数を保持。
do $migration$
declare
  v_definition text := pg_get_functiondef('public.get_recent_social_activity_feed(integer)'::regprocedure);
  v_trigger_definition text;
begin
  if md5(v_definition) <> '02101b2ca64a0a61a6c60db110fb0793' then
    raise exception 'social_activity_feed definition changed; review current definition before applying';
  end if;
  select pg_get_triggerdef(oid) into v_trigger_definition
    from pg_trigger where tgrelid='public.gacha_execution_history'::regclass
      and tgname='m9x_gacha_activity_trigger' and not tgisinternal;
  if v_trigger_definition is not null and v_trigger_definition <>
    'CREATE TRIGGER m9x_gacha_activity_trigger AFTER UPDATE OF status ON public.gacha_execution_history FOR EACH ROW EXECUTE FUNCTION on_m9x_gacha_activity()' then
    raise exception 'gacha activity trigger changed; review before applying';
  end if;
  if position('''SSR_CHARACTER'',''SSR_SKILL'',''SSR_EQUIPMENT'',' in v_definition) = 0 then
    raise exception 'expected SSR activity filter not found';
  end if;
  execute replace(v_definition,
    '''SSR_CHARACTER'',''SSR_SKILL'',''SSR_EQUIPMENT'',', '');
end;
$migration$;

drop trigger if exists m9x_gacha_activity_trigger on public.gacha_execution_history;
