# Raid Room PC 接続事前確認

実施: 2026-09-08 17:19〜17:27 JST / STATUS: IN_PROGRESS

工程1の読み取り確認を実施。管理接続は利用可能。独立Previewの変更競合・適用差分・テスト担当の確定が残るため、DB/Edge/UIの適用は未着手。親レビューのVALIDATED、実機提供可能とは扱わない。

## 作業対象

- Repository: https://github.com/kiyoshikitamura/tribe-neon.git
- PR #27: OPEN / Draft / merged=false。開始時head `375a0ad642a81e9db10a9379f03e5e5f77fb4562`。
- PR branch: `codex/raid-room-rescue-20260908`。PR base: `codex/kpi-dashboard-production-20260904`。
- PC branch: `codex/raid-room-pc-preflight-20260908`。上記headから新規checkoutを作成。
- 開始フォルダは空でgit管理外。新規clone後の作業ツリーはclean。既存checkout・未commit変更の上書きなし。
- remote originは上記Repository（fetch/push）。適用コード候補SHAは未確定。読み取り照合SHAと実機提供候補を区別する。
- release_boardは第20工程VALIDATED。第21工程は引き継ぎ指示どおり未統合扱い。親側の製品コード・既存契約・release_boardは変更しない。

正本として `.agents/AGENTS.md`（追加AGENTSなし）、release_board、RAID第20工程契約、Raid仕様、Preview切替/設定手順、第19/20工程統合記録、deployment_guideとその後継supabase_environment_runbookを照合した。第21工程契約はこのcheckoutに存在しない。

## 既存管理接続と配信

|項目|観測結果|
|---|---|
|GitHub|接続済み。PR情報・status取得、git clone/fetch成功|
|PC CLI|git/node/npmあり。PATH上のgh/supabase/vercel/psqlは検出されず。作業フォルダに既存env/CLI linkなし。資格情報の新規作成・取得はしていない|
|Supabase|既存MCPおよびDashboardログインを利用可能。MCPのpostgresロールでPreview READ ONLY成功|
|Preview project|`tribe-neon-preview` / `sufvuqdnqohpfzkwxohq` / ACTIVE_HEALTHY / ap-southeast-2|
|DB識別|管理APIが返したhost `db.sufvuqdnqohpfzkwxohq.supabase.co`。SQL database=`postgres` / role=`postgres` / PostgreSQL 17.6 / transaction_read_only=`on`。直結psql接続は未検証|
|API / Auth endpoint|`https://sufvuqdnqohpfzkwxohq.supabase.co` / 同URLの `/auth/v1`。認証フロー自体は未実行|
|Auth Site URL|`https://tribe-neon-mobile-preview.vercel.app`（Dashboard実測）|
|Vercel管理接続|既存ブラウザログインを利用可能。team `kiyoshi-kitamura` / project `tribe-neon`|
|配信|`dpl_FEpuwaPT6EnYqfgNBUgeAd4XcioM` / Preview / Ready / 2026-09-08 17:18:46 JST表示|
|実配信SHA|`375a0ad642a81e9db10a9379f03e5e5f77fb4562`。Vercel Source欄で照合。GitHub status successだけから推定していない|
|固定配信URL|https://tribe-neon-705g1hvhg-kiyoshi-kitamura.vercel.app/|
|branch alias|https://tribe-neon-git-codex-raid-room-rescue-20260908-kiyoshi-kitamura.vercel.app/|
|配信物読取|固定URLのHTTP 200、参照JS 14本すべて200。JS内Supabase URLはPreview ref。JS実行・ゲームログイン・業務RPCなし|
|Vercel公開設定|Preview共通 `NEXT_PUBLIC_SUPABASE_URL` は上記Preview、`NEXT_PUBLIC_APP_ENV=preview`。`NEXT_PUBLIC_RAID_ROOM_UI_ENABLED` は全環境検索で登録なし。`NEXT_PUBLIC_USE_MOCK_DB` はProduction行のみでPreview登録なし|
|Mock / Room UI判定|現行設定と固定ソースから実DBモード・Room UI未有効化と判断。認証済み実行時の通信確認は未実施。JSにMock文字列がないことだけで実DB接続成功とは判定しない|
|Edge|Preview `resolve-battle` v6 / ACTIVE / verify_jwt=true。bundle SHA256 `63c6c7d4a5e7fefc0b06aef943c4fd75b5446ec594f8d5db69480634b524d8c1`|

Vercel根拠: https://vercel.com/kiyoshi-kitamura/tribe-neon/FEpuwaPT6EnYqfgNBUgeAd4XcioM 。公開設定の値だけを確認し、キー・パスワードは表示/転記していない。設定画面の現在値と、過去buildに固定された設定の完全照合は区別する。

Auth redirect allow-list実測7件: `http://localhost:3000/**`、`http://localhost:3100/**`、`https://tribe-neon-mobile-preview.vercel.app`、同URLの `/**` と `/auth/callback`、`https://tribe-neon-*-kiyoshi-kitamura.vercel.app/**`、`https://kpi-preview.tribe-neon.com/**`。mobile-preview aliasの現在の配信先SHAは未照合であり、Raid候補URLに代用しない。

## DB実測と適用候補

証跡: [db-audit.json](evidence/raid-room-pc-20260908/db-audit.json)、[履歴差分](evidence/raid-room-pc-20260908/migration-history-diff.json)、[オブジェクト差分](evidence/raid-room-pc-20260908/object-presence-diff.json)。監査SQLはすべてBEGIN READ ONLY、statement_timeout=10s、lock_timeout=2s、ROLLBACK。`get_active_raids` を含む業務RPCは呼び出していない。

- migration履歴275件。Raidの完全version `20260908000250`〜`20260908000263` は14本とも履歴なし。Roomテーブル、Room RPC、`raid_legacy_settings`、救援リンク列も未存在。適用済みと見なせるRoom差分は今回検出しなかった。
- **末尾00250だけで照合しない。** DBには別工程 `20260907000250_acquisition_attribution_landing_authority` が存在し、Raidの `20260908000250` とは別。さらにPRにない `20260908041511_kpi_overview_saved_results` が存在する。
- 00250以前にも履歴未登録ファイル8件（同versionの2ファイルを含む）がある。一方 `ranking_reward_notifications` 等は実在。履歴欠落をスキーマ欠落と同一視せず、再適用候補にはまだ確定しない。ファイル一覧は履歴差分JSON参照。
- 14本から抽出した `public.*` 参照を実catalogと照合。欠落58名はRoom追加群・本人貢献RPC・旧停止設定。既存依存名は検出できた。ただし名前の存在照合であり、全列/制約/関数body互換の証明ではない。
- `raid_bosses` / `battle_replay_sessions` / `raid_damage_logs` / `presents` / users等の列定義を取得。品目マスター18件。ユーザー19、Guild0、Replay5、Present12。Replay5件はQUEST/RESOLVED/NOT_REQUIREDで、現時点の旧Raid未確定Replayは0。旧Raidの状態別件数は証跡参照。
- 実 `get_active_raids()` は `rotate_daily_raids()` を呼ぶ。rotate/respawnにはRoom除外・旧停止guardなし。`start_raid_battle` はLv5/RP/Replay経路を保持し、`finalize_raid_battle` は旧Raid/順位更新を含む。実定義はdb-audit.jsonのdetailsに保存。
- `claim_present(uuid)` はauth.uid本人・UNCLAIMED・期限を検査し、row lock後 `grant_present_payload` を呼ぶ。authenticated実行権あり。既存経路を保持する。呼出しによる受取検証は未実施。
- Edge v6の取得ソース4ファイルに `get_raid_battle_route_v1` / `finalize_raid_room_battle_v1` なし。現在のPR Edgeとの版一致は成立しない。DB256以前に新Edgeへ更新しない。

|必要なRaid差分候補|目的と適用前条件|
|---|---|
|20260908000250〜253|Room参照・条件・lifecycle・作成。既存users/raid_bosses/編成/マスターの列と権限互換をさらに照合|
|20260908000254〜256|旧経路分離・参加/開始・Room確定。既存Replayと旧確定を保持。256完了がEdge更新の前提|
|20260908000257〜258|復帰・取消。257は `raid-room-expiry-minute` を毎分登録する。RoomフラグfalseでもCron登録あり|
|20260908000259〜260|救援・Present。Activity/Guild Chatの既存列/triggerと品目経路を照合|
|20260908000261〜263|順位廃止・討伐Present・旧生成/開始停止設定。既存ランキングCronと共用関数に影響するため他担当と照合|

これは適用候補一覧であり、実行承認済みSQL一式ではない。最新の他工程差分を保持した実定義比較と親レビュー後、必要差分だけを確定する。`db push`、番号順全再実行、履歴repairは未実行。

## Cronと競合

pg_cron 1.6.4利用可能。既存6 jobすべてactive。取得した最新20実行はすべてsucceeded。ただしRoom期限jobは未登録のため実CronによるRoom期限終了は未検証。

|jobid / name|schedule|実command|
|---|---|---|
|2 / anonymous-onboarding-cleanup-daily|0 18 * * *|cleanup_expired_anonymous_onboarding()|
|3 / ranking-pvp-monthly-jst|0 15 * * *|advance_ranking_season('PVP',clock_timestamp())|
|4 / ranking-raid-weekly-jst|0 15 * * 0|advance_ranking_season('RAID',clock_timestamp())|
|5 / daily-ranking-reward-finalize-jst-midnight|0 15 * * *|finalize_daily_ranking_rewards()|
|7 / preopen-guild-power-finalize-20260909-jst|* 15 8 9 *|finalize_preopen_guild_power_season()|
|12 / kpi-overview-saved-results-half-hourly|7,37 * * * *|statement_timeout=120s; refresh_kpi_overview_saved_results()|

scheduleはDB保存値をそのまま記録。Room移行のために既存jobを停止していない。KPI追加migration、job12（17:07 JST成功）、Authのkpi-preview許可、VercelのKPI専用branch設定を観測。**Productionから分離されたPreviewであることは確認したが、他作業から独立して占有できる環境とは未確認。** 現担当・利用予約・テストアカウントの使用許可は未確認。Guildが0なので救援両公開先を確認できる既存Guildもない。

## 次の工程へ渡す条件

1. 親から第21工程の統合状態・CI影響・適用候補SHAを受け取り、今回の固定SHAとの差を照合する。
2. KPI/他担当とPreview共用範囲・変更時間・使用するテストユーザー3役とGuildを確定する。ユーザーが存在することをテスト利用許可と扱わない。
3. 履歴欠落8ファイルとDB独自差分について実定義比較を完了し、既存機能を保持した適用SQL・復旧版を固定する。
4. DB→同SHAのEdge→同SHAのUIの順。報酬値は [PC検証記録の暫定案](raid_room_pc_validation.md) を親へ返し、未承認のまま投入しない。

接続追加そのものは現時点のblockerではない。後続のCLI実行が必要になった場合のみ、Preview限定の既存管理接続と対象guardを整える。認証情報をチャットへ要求しない。本番 `ktpolnkyyfkowxdmijww`、本番ドメイン、親ブランチ、第21工程ファイルに変更なし。mergeなし。
