# Raid 工程2：共有Preview ROLLBACK検証

2026-09-08、KPI担当と変更枠を合わせ、commit `e646751e2e846adacb72068d9815b48583a2d48f` の `review-apply.psql` に対応するSQLを共有Previewで実行した。postflightは成功し、末尾ROLLBACK後の独立した照合も成功した。確認範囲の定義・データに永続差分はない。

## 対象・調整

対象は Preview `sufvuqdnqohpfzkwxohq`。コード照合基準は `375a0ad642a81e9db10a9379f03e5e5f77fb4562`、DB照合基準は[工程2の取得catalog](evidence/raid-room-step2-20260908/catalog.json)。

KPI担当「Add Daily/Monthly KPI Toggle」（thread `01a07f0f-3729-7db0-9851-642099bc7264`）から、18:17〜18:27 JSTにDDL・migration・手動集計・Preview変更を重ねない旨の回答を受領した。既存KPI Cron（毎時07・37分）は停止せず、実行直前にCron稼働中0件・他の実行中client session 0件を確認した。事後照合後、同担当へ枠の早期解放を通知した。

## 実行方法と時刻

環境にpsql CLIがないため、[元driver](raid-room-step2/review-apply.psql)の相対includeを展開し、Supabase管理接続のexecute_sqlで単一リクエストとして実行した。psqlプロセス自体の実行ではない。SQL順序、BEGIN、statement_timeout 60秒、lock_timeout 2秒、末尾ROLLBACKを保持し、postflight後に証跡用SELECTを1文追加した。元driverや適用差分は変更していない。

- 18:17:24 JST：直前READ ONLY照合、baseline 9項目すべて一致。
- 18:17:39 JST：実行要求開始。
- 18:17:44 JST：transaction 47143でpostflight成功。その後NOTIFY、ROLLBACKを実行し、18:17:45までに正常応答。
- 18:20:15 JST：別リクエストで事後READ ONLY照合成功。
- 追加確認：transaction 47143の実行中backend・transaction lockはいずれも残存なし。

実行SQLは[expanded-review-apply.sql](evidence/raid-room-rollback-20260908/expanded-review-apply.sql)。元driver SHA256は `33f4853b53e2b4969953208b73fa4cbd8f2150d13ed264f7d57cc42d29891dea`。展開ファイルのSHA256等は[execution-manifest.json](evidence/raid-room-rollback-20260908/execution-manifest.json)に記録した。

対象includeは00 baseline guard、01 snapshot依存差分、02 Raid差分、04 postflightのみ。03 Cron登録・05停止手順・06テスト分類は実行していない。静的確認は222文、BEGIN 1、ROLLBACK 1、COMMIT 0、Cron操作0。NOTIFYも同一transaction内でROLLBACKされる。

## postflight・実行前後

[postflight.json](evidence/raid-room-rollback-20260908/postflight.json)に35関数の署名・ACL・search_path・戻り型・SECURITY DEFINER属性と結果を保存した。postflightのDO検証は例外なく完了し、保護対象の共用関数、既存Cron、migration履歴、RLS、機能フラグ等の条件を満たした。

| 確認 | 結果 |
| --- | --- |
| transaction内の新規関連テーブル | 22 |
| Room数 / Room Cron数 | 0 / 0 |
| Room作成・戦闘・救援フラグ | すべてfalse |
| legacy Raidフラグ | true |
| snapshotの追加metadata | あり |
| 実行前後のbaseline | 9/9一致 |
| 既存Cron | 6件の定義・active状態すべて同一 |
| 検査対象データ | 13テーブルの件数・内容MD5すべて同一 |
| ROLLBACK後のRoom / legacy設定relation | ともに不在 |

baselineは関数本文・署名・owner・ACL、migration履歴、Cron、列、制約、trigger、table RLS・grant、index、policyを比較した。実行前後とも元baselineと一致したため、一時DDLが残っていないことを確認した。

データ比較対象はusers、guilds、presents、raid_bosses、guild_members、raid_damage_logs、battle_replay_events、battle_replay_sessions、raid_instance_user_progress、ranking_reward_notifications、kpi_aggregation_runs、kpi_metric_snapshots、kpi_overview_saved_results。既存19ユーザー、Guild 0件、KPI保存結果355件を含め不変だった。全DB行の網羅的な比較ではない。

## 証跡と残作業

[before.json](evidence/raid-room-rollback-20260908/before.json)、[after.json](evidence/raid-room-rollback-20260908/after.json)、[comparison.json](evidence/raid-room-rollback-20260908/comparison.json)が実行前後の証跡。[state.sql](evidence/raid-room-rollback-20260908/state.sql)は再照合クエリ。[execution-result.json](evidence/raid-room-rollback-20260908/execution-result.json)は実行応答、[rollback-confirmation.json](evidence/raid-room-rollback-20260908/rollback-confirmation.json)はtransaction終了の追加確認。

今回の復旧はdriver末尾のROLLBACKで完了した。追加の復旧SQLは不要。将来COMMITする際は共有Previewの時間調整とbaseline再照合をやり直し、[工程2の影響・復旧計画](raid_room_pc_step2.md)を用いる。

DB COMMIT、Cron登録・停止、Edge/UI Deploy、運用有効化、migration履歴repair、pushは実施していない。専用ユーザー・Guildの作成も未実行で、[準備済み手順](raid-room-step2/test-users.md)を保持する。今回の成功は実PreviewでのDDL互換性とpostflightの検証結果であり、実戦闘・複数接続・Edge/UI・報酬受入の完了を示すものではない。
