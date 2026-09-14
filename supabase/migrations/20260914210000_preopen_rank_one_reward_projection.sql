-- プレOPENの公開報酬投影を承認済み1位限定へ合わせる。
-- cosmetic本体、報酬値、既存付与履歴、Season状態・終了処理は変更しない。
begin;
do $patch$
declare
  v_definition text;
  v_anchor text := 'where cosmetic.active';
begin
  v_definition := pg_get_functiondef('public.get_public_ranking_reward_master()'::regprocedure);
  if (length(v_definition)-length(replace(v_definition,v_anchor,'')))/length(v_anchor) <> 1
     or position('PREOPEN_GUILD_POWER_2026' in v_definition)=0 then
    raise exception 'PREOPEN_REWARD_PROJECTION_SOURCE_DRIFT';
  end if;
  execute replace(v_definition,v_anchor,
    'where cosmetic.active and cosmetic.id = ''guild_preopen_2026_rank_1''');
end $patch$;
notify pgrst,'reload schema';
commit;
