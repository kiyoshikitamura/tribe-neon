-- Preview sufvuqdnqohpfzkwxohq 専用。Production実行禁止。
-- 今回追加した記事だけを、承認済み文案 7.2 に訂正する。
-- Authority: docs/development/formal_open_integrated_release_management_20260914.md
-- 元の本番お知らせ・他の記事・公開日時・公開状態は変更しない。
-- 文案内の Season 終了/開始、Emblem 付与、Mission 終了、Pack 公開を
-- この SQL が実施したことにはならない。正式公開前に各工程の完了照合が必要。
BEGIN;
DO $restore_news$
DECLARE
  v_updated integer;
BEGIN
  UPDATE public.news
  SET title = '【TRIBE NEON 正式オープン】',
      content = $news$TRIBE NEONは正式オープンしました。

プレオープンSeasonは正式オープンに伴い終了しました。
プレオープン総合力ランキング1位のTRIBEには、限定Guild Emblemを付与しました。
新Seasonは正式オープンから2026年9月30日 23:59まで開催します。
ギルバト準備Missionの達成済み報酬は、終了後30日間受け取ることができます。

新たに、Raid Encounter、Guild Emblem、専用Skill / Equipment、Packなどが利用できます。
AP最大値は正式オープンに伴い50へ変更されています。$news$
  WHERE release_key = 'formal-release-update-20260915';

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one Preview formal release article, found %', v_updated;
  END IF;
END;
$restore_news$;
COMMIT;
