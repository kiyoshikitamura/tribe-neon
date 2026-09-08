# Raid Room 工程2 — Preview互換性と適用差分

STATUS: HUMAN_REVIEW_READY（工程2の適用計画。実Preview受入・親VALIDATEDではない）

照合基準は **375a0ad642a81e9db10a9379f03e5e5f77fb4562**。第21工程を待たず、製品コードを固定して照合した。工程1の記録commit `afb0ca4` を継承した専用worktree/branch `codex/raid-room-pc-step2-20260908` に記録する。第21工程、親ブランチ、release_boardは変更しない。

## 結論

現Previewの列・制約・既存関数signatureにRaid 14本のDDLを妨げる衝突は検出しなかった。14本は履歴もRoomオブジェクトも未存在で、新規構造がすべて必要。**snapshot共用関数だけは不足metadataの追加差分が必要**。履歴未登録8ファイルの一括再適用は禁止とし、必要依存は00232と00233に限定して実定義比較した。

適用案は、snapshotのSPD/LUK補正を残した追加、Raid新規構造と最終writer、毎分Cron登録の分離で構成する。既存6 Cron・KPI定義・KPI追加migration・既存Present受取経路を保持する。既存共用関数の置換は22名（23 signature）とsnapshotの1 signature。PVP通知の追加、Raidランキング停止、Roomへの旧報酬除外は実際に挙動が変わるため、影響を下記に明記する。

実DBで実行したのは **BEGIN READ ONLY / timeouts / ROLLBACK内のcatalog・件数・マスターSELECTだけ**。DDL、業務RPC、ユーザー/Guild作成、migration履歴操作、Cron変更、Edge/UI Deployは未実行。取得した定義をメモリ内PostgreSQLへ再構成した検証と、実DB変更を区別する。

## 観測対象と根拠

|対象|結果|
|---|---|
|Preview|`tribe-neon-preview` / `sufvuqdnqohpfzkwxohq` / PostgreSQL 17.6|
|catalog取得|2026-09-08 17:37:27 JST。200 relation、1,560列、402関数のsignature/body hash/owner/ACL、87 triggerを取得。必要依存157関数の本文を保存|
|再照合|[baseline-recheck.json](evidence/raid-room-step2-20260908/baseline-recheck.json) の時刻。関数・履歴・Cron・列・制約・trigger・RLS/GRANT・index・policyの9項目すべて一致|
|データ条件|17:45 JSTにユーザー19、Guild0、旧Raid PENDING Replay0、ランキング通知16を確認。既存ユーザーの個別情報は抽出しない|
|マスター|有効Raid variant 7件、すべてboss_master FK対象あり、各5体、HP>0。品目18件。報酬品目/数量・閾値の承認とは別|
|履歴|275件。Raidの完全version `20260908000250`〜`20260908000263` は未登録|
|保持するremote-only履歴|`20260831000215_anonymous_tutorial_cleanup_24h`、`20260907000250_acquisition_attribution_landing_authority`、`20260908041511_kpi_overview_saved_results`|
|DB/Edge/UI対応|工程1の観測ではUI 375a0ad、Room UI未有効、Edge resolve-battle v6はRoom未対応。この工程では再Deployしない。実適用前には配信版を再取得|

[catalog.sql / JSON](evidence/raid-room-step2-20260908/catalog.json)、[データ確認](evidence/raid-room-step2-20260908/data-check.json)、[元ファイルSHA256と適用manifest](evidence/raid-room-step2-20260908/plan-manifest.json) を参照。データ確認の最初のSELECTは誤った品目テーブル名で失敗し、取得済catalogの `canonical_item_master` に修正して再実行した。失敗時もREAD ONLYで変更なし。

## 14本の互換性と採用差分

全行のDDLは、現catalogから再構成したメモリ内PostgreSQLで作成成功。PL/pgSQLの全分岐実行や実データの戦闘成功までを示すものではない。

|version末尾 / ファイル用途|現Previewとの照合と採用内容|
|---|---|
|250 read_projection|`users.id/username`、`raid_bosses`のuuid ID・bigint HP・status/期限/outcome列、progress/damage/guild列が存在。Room・membersを新設。既存データのRoom割当なし|
|251 condition_rules|既存同名table/functionなし。4難度の参加下限のみ新設。救援閾値NULLを保持|
|252 lifecycle|bossのspawned_at/expires_at、outcome_finalized_at互換。Room×user PK、instance UNIQUE/FK、難度lockと24時間を追加|
|253 creation|variantのID/area/max_hp/有効flag互換。`raid_bosses`の必須列boss_id/expires_atをINSERTが供給。7 variantのboss_master FKを確認。既存同baseのACTIVE UNIQUE制約なし。作成flag=false|
|254 legacy_isolation|旧start/finalize/expiry/respawn/生成/報酬のsignature互換。body差はRoom台帳除外とlock。旧Replayの確定・既存Present経路を保持|
|255 entry|`users.level/raid_points/raid_free_entry_consumed/raid_points_last_recovered_at`、Replayのuuid/JSONB/tactic/context列とCHECKが互換。Room receipt・開始flag=falseを追加。実出撃snapshotが参加判定の正本|
|256 finalization|ReplayのPENDING/FINALIZED・RAID・result/timestamp形状CHECK、damage logのReplay一意index、progressのPKが互換。route/確定を追加。既存3 trigger関数へRoom除外。trigger attachmentは保持|
|257 recovery_and_expiry|本人receipt参照・期限一括RPCを新設。pg_cron利用可。登録DOだけを03 SQLへ分離し、既存jobへ触れない|
|258 recovery_controls|新設receiptへrecovery_acknowledged_atを追加。取消台帳・復帰/ack/cancel・start更新。既存Replay列追加なし|
|259 rescue|socialのCHECK実値はSSR3種・POWER_RANK_1・GUILD_CREATEDの5種。既存値をすべて残しRAID_HELP_REQUESTを追加。`board_posts.raid_rescue_id uuid` NULL可FKを追加。既存列/5 triggerを保持|
|260 rescue_rewards|`presents.id` UUID、item_id text、quantity integer、status/expire_at互換。Room×本人の報酬/付与台帳を新設。AFTER UPDATE OF outcome_finalized_at trigger追加。新規操作の設定lockを統一。報酬flag=false|
|261 ranking_retirement|共用ランキング列/PK/FK/通知テーブルは実在。Raid分岐だけ停止、PVP/GUILD_POWER/POWERを保持。SEASON通知INSERTは現Previewとの差分として追加（下記）|
|262 clear_rewards|Present・members・Replayの型互換。別報酬台帳とAFTER UPDATE triggerを追加。救援と討伐の二重台帳を統合しない。報酬flag=false/閾値NULL|
|263 legacy_cutover|旧設定tableを新設、初期enabled=true。旧start/get_active/rotate/respawnのみ停止guard追加。適用だけでは旧生成停止にならない。停止操作は後続工程|

## 履歴未登録8ファイルの扱い

|ファイル|Raid依存の判断と実定義比較|適用案|
|---|---|---|
|20260901000215_tutorial_battle_pacing.sql|tutorial enemy projection。Room戦闘の直接依存ではない|対象外。再適用しない|
|20260901000216_pvp_main_formation_matchmaking.sql|PvP候補選択。Roomの選択編成snapshotとは別|対象外。再適用しない|
|20260901000216_tutorial_battle_acceptance_pacing.sql|同version別ファイル。tutorial専用|対象外。履歴repairしない|
|20260901000217_reattach_tutorial_enemy_projection.sql|patrol replayへのhook。Room作成/確定では呼ばない|対象外。再適用しない|
|20260901000218_tutorial_enemy_hp_half.sql|tutorial enemy HP調整|対象外。再適用しない|
|20260902000231_natural_patrol_encounter_authority.sql|patrol enemy取得。Room enemyはcanonical variantから構築|対象外。再適用しない|
|20260902000232_battle_snapshot_presentation_metadata.sql|`build_server_battle_snapshot(uuid,text[],text)` が直接依存。現定義はmetadata4項目が不足し、元ファイルにはない装備SPD/LUK補正が存在|**元ファイル再適用不可**。01 SQLで現定義にcharacterId/level/awakeningLevel/rarityだけ追加し、配列件数不一致は23503|
|20260903000233_ranking_reward_notification_contract.sql|261の通知INSERT先が直接依存。6列、PK、recipient FK、period CHECK、3列UNIQUE、pending index、RLS/ACLは実在。現SEASON grant関数には通知INSERTがない|table再作成不要。261が必要なINSERTを供給。他のUI用RPCは保持。元ファイル全体は再適用しない|

00232追加は共有snapshotを通る今後のQuest/PvP/GvGにも表示metadataを供給する。stats・equipment・skills・既存JSONの各値を変えない。保存済みReplay/snapshotの書換えはない。00233由来の通知追加はPVPの今後の正当な新規Season報酬に作用し、発行済み報酬への遡及INSERTは行わない。既存に同用途のUNIQUE indexが2本あるが、この工程で削除しない。

## 共用関数・trigger・KPI・Cronの影響

22名の各body差は [function-diffs](evidence/raid-room-step2-20260908/function-diffs) に保存。入力引数名/型・戻り値の衝突なし。`CREATE OR REPLACE` で既存依存OIDを保持し、定義をDROPしない。snapshotを除く既存関数に現Preview固有の別補正を消す差は検出しなかった。

- `advance_ranking_season` はRAIDでNULLを返す。`grant_canonical_daily_ranking_reward` はRAID_PERSONALのみ0、Season grantはRAID2種のみ0。PVPの境界整合/報酬確定/繰越の呼出しを保持する。
- `finalize_daily_ranking_rewards` はRaid snapshot/新規recipientを作らず、POWER/GUILD_POWER/PVPを維持する。既存Raid報酬台帳/Present/ランキング履歴は削除しない。
- `converge_ranking_lifecycle_safety` はPVP修復を維持し、Raidの過去境界修復を廃止する。`raid_season_reset` は認証後no-opとなり、現定義にあるdamage log DELETE/HP再開を行わなくなる。
- Replayの既存trigger6件のうち、daily activity、Guild official EXP、daily ranking participationの3つの関数を更新する。Room確定は旧Raid活動報酬/Guild EXP/順位加算から除外。`on_official_battle_funnel`、`on_first_official_battle_funnel`、旧PvP Cash除去は保持するため、Room確定も既存first/second raid等のfunnel観測対象になり得る。KPI factを無効化しない。
- Guild救援投稿は `author_id=主催者, user_id=NULL, is_system=true`。5 trigger（Guild EXP、mission、activation funnel、first human response、zz_kpi_v249_guild_chat_message）の早期return条件と互換。人の発言・response・KPI messageとして加算しない。全体Activityには新種別を追加する。
- `claim_present(uuid)` / `grant_present_payload` / `resolve_canonical_reward_item`、KPI関数・table・trigger・RLS/GRANTを保持。Room報酬には既存Present受取を使用する。実受取は未実行。

|既存job|保持内容 / 実適用後の影響|
|---|---|
|2 anonymous-onboarding-cleanup-daily|`0 18 * * *` / 同じcommand・activeを保持|
|3 ranking-pvp-monthly-jst|`0 15 * * *` / PVP経路を維持|
|4 ranking-raid-weekly-jst|`0 15 * * 0` / job自体は保持するが、呼び先のRAID分岐はno-opになる。これを従来どおりの順位更新と報告しない|
|5 daily-ranking-reward-finalize-jst-midnight|`0 15 * * *` / Raidカテゴリ廃止。他カテゴリを保持|
|7 preopen-guild-power-finalize-20260909-jst|`* 15 8 9 *` / command・activeを保持|
|12 kpi-overview-saved-results-half-hourly|`7,37 * * * *` / 120秒timeoutを含むcommand・active・KPI保存関数を保持|

新job `raid-room-expiry-minute` は[03 SQL](raid-room-step2/03-expiry-cron.sql)で後続登録する。同名jobが存在したら中断し、unschedule→作り直しはしない。RoomフラグfalseはCron停止を意味しない。登録しない間は自動期限確定が動かないため、実機提供可能とは扱わない。

## 適用SQLと実行境界

レビュー入口は [review-apply.psql](raid-room-step2/review-apply.psql)。生成物は `supabase/migrations` へ置かず、自動db push対象にしない。実DB適用は今回の依頼範囲外。

1. 後続担当が管理APIのproject ref/hostと実接続先を照合する。本番 `ktpolnkyyfkowxdmijww` では使用しない。`PGHOST=db.sufvuqdnqohpfzkwxohq.supabase.co` の直結、または管理APIで返されたPreview専用pooler資格情報を使う。接続ラベルやGUCだけを接続先の証拠にしない。
2. 同じPreviewを使うKPI担当との変更時間を調整し、catalog・設定・Cron・旧未確定Replayを再取得する。[00-readonly-recheck.sql](raid-room-step2/00-readonly-recheck.sql) が9件一致してから進める。不一致なら現在版を再照合し、guardの削除や期待hashの機械更新だけで通さない。
3. 専用管理sessionで `psql -X -v ON_ERROR_STOP=1 -f docs/development/raid-room-step2/review-apply.psql` を使う。**このコマンドも実DBのDDLを伴うため、本工程では実行しない**。SQLは既定ROLLBACK。保存する後続実行では内容レビュー後に最後のROLLBACKのみCOMMITへ変更する。
4. driverはbaseline guard→[01 snapshot追加](raid-room-step2/01-snapshot-dependency.sql)→[02 Raid差分](raid-room-step2/02-raid-delta.sql)→[04 postflight](raid-room-step2/04-postflight.sql) を単一transactionで実行する。元14本の中間writerはtransaction内のみで、外部には最終版が見える。SQL断片01/02を単独実行しない。各DROP CHECK/ADD COLUMNは既存tableをlockし、timeoutなら全ROLLBACK。
5. Postflightは対象外関数body・既存Cron・履歴の保持、Room flags=false、旧flag=true、報酬false、Room RLSを検査する。保存後はcatalog差分で対象外列/constraint/index/policy/trigger/owner/ACLが不変か確認する。適用中は他担当DDLを禁止する変更窓を設け、事前SELECTとDDLの間の競合を避ける。
6. 保存した場合は実行者/時刻/ref、適用artifact hash、前後catalog、成功/失敗を別の適用台帳として記録する。この計画は元14versionの履歴を偽装登録しない。既定のmigration runnerへ組み込む場合は後続工程でCLI `migration new` により専用migrationを作成し、既存14本の再投入を防ぐ適用manifestを整える。`db push` / 履歴repair / migration番号一括実行は使わない。
7. DB確定後、Roomルート対応Edge→同SHAのUIの順で後続適用する。03 Cron、旧運用停止、新規設定/報酬有効化は別操作として記録する。第21工程が後から統合された場合は今回の固定SHAとの差分だけを追加照合する。

## 復旧

- **COMMIT前の失敗**: driverのON_ERROR_STOPで停止し、接続をROLLBACK/切断。単一transactionなので01/02の部分状態を残さない。既存6 Cronを触らないため、その復元は不要。
- **COMMIT後・まだ新規操作未有効**: Room flags=falseを確認し、旧・新Replay/Presentsを消さず原因を前進修正する。261で停止したRaid順位報酬を、古い共用関数の一括復元で再開しない。
- **新規操作開始後の障害**: [05-stop-new-operations.sql](raid-room-step2/05-stop-new-operations.sql) で作成・開始・救援新規操作と旧生成/開始を止める。通常参加登録まで含む全書込停止ではない。Room期限jobと既存開始receipt/復帰/確定/本人Present受取を保持する。問題が報酬発行の場合だけ該当難度の発行設定を別途止め、未発行の対象を記録する。
- Room開始後は旧Edge v6へ戻さない。Room対応の既知正常Edge/UIへ戻すか前進修正する。旧開始済みReplayは旧確定ルートを維持。旧生成停止で残った旧期限Instanceはサービス専用finalizeを個別検討し、rotate再開で処理しない。
- 元関数body/ACL/owner/trigger/constraintはcatalogとfunction-diffsに保存している。ただし参照資料であり、自動down migrationではない。Room/receipt/台帳/Present/user資産のDROP/DELETE、RP返却、報酬遡及再計算を復旧に使わない。基盤障害なら別環境へのバックアップ復元を検証後に切替計画を作り、共用Previewを過去へ丸ごと戻してKPI結果を失わせない。

## 検証結果と残件

[offline-validation.json](evidence/raid-room-step2-20260908/offline-validation.json) と [bundle版](evidence/raid-room-step2-20260908/offline-validation-bundle.json) に根拠を保存した。

- PGlite 0.5.8のメモリ内に200 table、157関数と依存constraint/index/triggerを再構成。14本それぞれのDDL作成成功。生成した単一transaction bundleも作成成功。
- 対象外133 signatureのbody/ACLが同一。Room flag/報酬false、旧flag=true、Room RLSを確認。
- Guildシステム投稿で既存triggerが通り、対象KPI/activity/human-response件数の増加なし。
- snapshot wrapperは既存全フィールド一致、SPD 9+3=12・LUK 4+2=6の補正維持、metadata4項目追加を確認。基底snapshotと装備projectionは合成stubであり、実編成全体の計算検証とは区別する。
- 新規3件の合成fixtureで、Game Start時点からのQA除外と既存分類がある場合の中断を確認。実Authユーザーは作成していない。
- 実Previewでbaseline hash9項目一致。新しいユーザー/Guildを使った実戦闘、実Cron、複数接続、Edge、UI、権限ごとの実リクエスト、報酬受取は**未実行**。

オフライン再現: `scripts/raid-room/build-step2-plan.mjs` で固定SHAから再生成。別の一時ディレクトリへ `@electric-sql/pglite@0.5.8` を固定installし、`RAID_PGLITE_MODULE` にその `dist/index.js` の絶対パスを指定して `node scripts/raid-room/verify-step2-offline.mjs` と `--bundle` を実行する。アプリのpackage.json/lockfileには依存を追加していない。エミュレーターではAuthをstub化し、viewを空tableに置換し、Cron daemon/実データを再現しない。実Preview受入の代替ではない。

専用3ユーザー・Guildの新規作成とQA分類手順は [test-users.md](raid-room-step2/test-users.md)。実適用の残件は共用環境の変更窓、後続実行の対象SHA、承認済み報酬設定、専用fixture作成、実環境受入。工程2の作成・照合は第21工程待ちにしない。

DB/Deployを行わない指定を守るため、この工程の成果はローカルRepositoryへcommitして返す。Vercel連携branchへのpushは新しいPreviewを誘発し得るため実施しない。参照: [Vercel Git deployments](https://vercel.com/docs/git)。Supabase changelogを取得し本変更に関係するbreaking changeは検出せず、Auth作成仕様は公式docsと実関数の両方で確認した。
