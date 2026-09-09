# Social Active / Raid Point 日次KPI監査

DB判定: **SAFE_ADDITIVE**。新規テーブル・Fact削除・履歴Backfillなし。

対象はGitHub `kiyoshikitamura/tribe-neon` のKPI専用ブランチ `codex/kpi-dashboard-production-20260904`。
基準SHA `cf830b0d4c4cfcd7cf21be2273cc292148771273`。
Production Supabaseは `ktpolnkyyfkowxdmijww`。2026-09-10 JSTにREAD ONLY監査。

| 項目 | 確認したProduction Authority |
| --- | --- |
| DAU | `sync_active_users` → プロフィール行存在確認 → `kpi_record_daily_activity` → `kpi_daily_user_activity`。保存済みOverviewと同じ `kpi_is_subject_excluded(subject_id,last_active_at)` を使用。独自Auth/名前判定は追加しない |
| Subject | `kpi_subjects.source_user_id` がUserとの一意対応。集計は `subject_id` |
| Guild所属DAU | `kpi_guild_membership_periods`。既存 `kpi_effective_active_guild_daily_v1` と同じJST日末所属。`joined_at < 翌日0時`、`left_at IS NULL OR left_at >= 翌日0時` |
| Guild/Global | `send_chat_message` → `board_posts` の `GUILD` / `GLOBAL`。人間投稿は `user_id` 有り、`is_system=false`。Guildは投稿時の対象Guild所属期間も検証 |
| DM | `send_direct_message` → `direct_messages.sender_id`。自己送信・NULL宛先を除外 |
| BBS | `create_bbs_thread` → `bbs_threads`（本文）、`create_bbs_post` → `bbs_posts`（返信）。双方をUnion。現存スレッドとの関連を確認 |
| Raid保有 | `users.raid_points`。現在残高から過去消費を逆算しない |
| Raid消費 | `start_raid_battle` がPoint減算と同じtransactionで作成する `battle_replay_sessions`。`RAID` / `RAID_SERVER` / `official_context.costType=RAID_POINT` の `cost` を開始日時 `created_at` のJST日で合計 |

投稿本文はRPCの有効長制約を適用。Bot/NPC/自動投稿は既存の `is_system`・User/Subject Authorityに従い除外。
現存投稿を参照するため、削除済み投稿を残存Activation Factから復活させない。
投稿時と活動時の既存除外分類を維持する。加入当日の挨拶も含む。
Guild/Global/DM/BBSは最後にDISTINCT Subjectとし、DAUかつGuild所属の集合内だけを数える。

Raidは `SUM(cost)>=3` のみ。初回無料、Cash/Diamond、別Battle Modeを除外。
開始時消費なので未完了Battleでも消費が成立していれば含む。勝敗・完了回数への置換なし。
当日DAUにないUserは除外。分母0は既存 `kpi_overview_saved_rate` と同じNULL率。

実装は読取専用関数 `kpi_daily_engagement_v1` と、既存refreshへのJSON項目追加。
新関数はSECURITY INVOKER、実行権限は集計ownerのみ。anon/authenticated/service_roleには新規権限なし。
既存30分定期集計に統合し、画面/API閲覧は引き続き保存済み結果のSELECTのみ。
月次には独自の新指標を作らず、日次一覧への既存導線を使用。
Guild Chat ActivationのFact、RPC、旧payload `chat`、その他Guild指標は維持。

## 検証

`node scripts/verify_kpi_engagement.mjs` は実Migration SQLをPGliteで実行。
指定Social6/Raid5ケース、JST境界・所属期間・再加入・重複・自己DM・削除・不正cost・QA除外など15ケース。
Production旧refreshと新refreshの355行で、新規項目/生成時刻以外のpayload差分0。
新規関数の匿名/authenticated/service_role拒否も検証。
`node scripts/verify_kpi_engagement_ui.mjs` は実Reactコンポーネントをrenderし、カード順・数値・ゼロ・未集計表示を確認。
ローカルfixtureのブラウザ表示も確認済み。Production実画面とは別の検証。

Direct SQL: `scripts/sql/kpi-engagement-direct-acceptance.sql`。
対象日を変更するとチャネルUU・Union UU・DAU・所属DAU・Subject別消費量を取得可能。
Productionの実数値はローカル監査記録に保存し、公開Repositoryへ含めない。

本番反映は旧refreshの定義hashを照合した後、同一REPEATABLE READ transactionで旧/新refreshを比較し、差分時にrollbackする。
履歴書換えやゲーム本体のRPC変更は行わない。Production Acceptanceの最終結果は作業フォルダのリリース記録に記載する。

Production適用versionは `20260909151723`（MCP発行）。RepositoryのCLI生成ファイル `20260909150352_kpi_social_active_raid_point_daily.sql` と対応する。
本番では、このDDLを事前drift検出とtransaction内の回帰検証で囲んで適用した。再適用は不要。
新規集計関数のProduction実測は345日分約93ms。追加indexは不要と判定した。
