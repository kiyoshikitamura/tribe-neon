# レイドトップ 第2工程 C検証報告

基準 `c397df2ef489916192109120e4303d05f2da8b0c`。実装SHAは親commit後に記録。Cはテスト・fixture・runner・本報告のみ編集、commitなし。

## 実装・機械検証済み

隔離PostgreSQL **17.11**、localhost **127.0.0.1:55462**、専用ユーザー `raid_top_local`。runnerは接続先/サーバーIP/ポート/ユーザー/PG majorを固定検査し、毎回新規テストDBだけを作成する。既存OSのDB、Preview、本番へ接続しない。

親統合済み正式migration `20260908175140_raid_top_daily_authority.sql` → `20260908175143_raid_top_aggregate_api.sql` を既存SQL250〜260と最小schema fixtureの上に適用。

`node scripts/raid-top-data/verify-pg.mjs`: **10群PASS**。

1. 12接続・異なる認証ユーザーの同時初回取得で同じ2エリア、日次正本は1行。
2. 空一覧はready/[]。匿名・存在しないユーザーは42501で拒否。
3. top/選択肢は同じ日次2対象。対象外の新規requestは22023、対象内受付・再送は同じレイド。
4. 主催/通常/救援role、主催者Guild、登録人数、参加者顔最大5を一括投影。
5. 同一レイドの最新閲覧可能救援を1件採用。非所属はACTIVITY、所属はGUILD、移籍後はACTIVITY。scope/guildIdを保持。
6. 非所属Guild救援の直接閲覧・参加も42501。救援参加roleを保持。
7. JST23:59:59→00:00:00で日キー変更。旧成功requestは現在対象外でも同じroomId/作成時刻/期限を返す。新requestは拒否。前日23:59:59開始・24時間期限の既存レイドに通常参加/救援参加できる。
8. 本人一覧と救援一覧は最大20。HP0/期限終了は除外。24時間期限を維持。大量fixtureは既存難度別開催数制約の範囲で3難度へ分散。
9. authenticatedからprivate日次tableのSELECT/DELETEと内部日次関数直接実行を拒否。anonから公開topも拒否。
10. 初期化時の7エリアmaster不足は55000の取得失敗。空readyにしない。テストclock関数・参照の残存0を検査。

親追加 `verify-concurrency.mjs`: **2群PASS**。実advisory待ちを確認してからJST境界を進め、新日だけ生成。同request8接続同時再送で同一レイド/台帳1件。親の同時性レポートを参照。

`node tests/raid-room/top-data-run-tests.mjs`: **6件PASS**。

- 実PG `get_raid_top_v1()` のJSON保存値を既定RPC loader→実parser→実RaidTopへ通す縦結合。要求1回・引数なし、敵5体素材・主催者顔・救援参加表示を確認。
- RPCエラー/不正形状を拒否し0件へ変換しない。
- Guild scope不整合、顔6件、21件pageを拒否。未知character IDを固定人物に置換しない。
- 既定hookの認証切替で旧応答を破棄。空readyと取得errorを区別。
- JST0時+100msの次回再取得時刻計算。
- visibility復帰の一括再取得、ログアウト後通信停止。

型/Mock build、第1工程top16件＋関連既存189件、CLI advisorsは親担当。親から型・Mock build・関連回帰PASS、security advisorsの新規オブジェクト指摘なし（最小fixtureの既存補助関数2件search_path警告）との報告。

## 再現手順

```powershell
# 親の隔離PG17 clusterがlocalhost55462で起動済みであること。
# outputs/raid-top-data-runtime へ pg@8.16.3 を導入（追跡package/lockに変更なし）
node scripts/raid-top-data/verify-pg.mjs
node scripts/raid-top-data/verify-concurrency.mjs
$env:RAID_TEST_RUNTIME_DIR = '<既存esbuild/jsdom/React Testing Library runtime>'
node tests/raid-room/top-data-run-tests.mjs
```

TS縦結合テストは前段PG実行の `outputs/raid-top-data/actual-pg-snapshot.json` を要求し、架空の固定snapshotへフォールバックしない。PG最終実行DBは `raid_top_test_1788890594495_43824`。親同時性DBは `raid_top_test_1788890589242_44972`。各runのレポートは `outputs/raid-top-data/{pg-report,concurrency-report}.json`。追跡証跡へのコピーは親担当。

## 検証境界・実機確認待ち

- 隔離PGの実SQL/ロック/権限は検証した。最小既存schema fixture、auth.uidはrequest claim GUCを読むテスト定義。PostgREST/GoTrueを含むSupabase全サービス環境ではない。Preview・実ユーザー認証・実端末受入は未実施。
- JST境界はOS時計や本番関数を変更せず、隔離DB内の日次/生成関数だけ `clock_timestamp()` を一時テストclockへ差替し、finallyで元定義を復元した。通常のSQL・12接続同時初期化は元定義で実行。
- SQLテスト中の失敗は、初期fixtureの期待値（再送応答の参加人数は最新投影、難度別開催上限）とテストclockの不一致を修正して解決。製品の戦闘/報酬/参加上限は変更していない。runner全接続はstatement_timeout=15秒。
- 戦闘/報酬/Replay/ack回帰は既存テストと親担当結果を参照。報酬ダイアログのスクロール、参加者プロフィール遷移は引き続き残件。

## 親統合時の証跡

追跡証跡は docs/development/evidence/raid-top-step2-20260909/ 配下のpg-report.json、concurrency-report.json、security-advisors.json。親のMock build/型/既存回帰結果は統合報告を参照。

検証終了後、今回新規作成した outputs/raid-top-step2-pg/data のPGだけを停止し、データはローカルに保持する。再実行時は専用clusterを同じlocalhost55462で起動する（既存OSの5432等には向けない）。
