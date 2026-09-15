# 第5工程 Preview適用準備・B読取照合

STATUS: VALIDATED（読取・適用計画のみ）。実適用、実HTTP、実機受入は未実施。

調査基準は `49222de05d0d9925beb6439c56c03a61b8564af5`、branch `codex/raid-preview-candidate-step5-20260909`。親が本番/Character差分を統合中。最終実装SHAは親のfreeze後に報告へ記録する。Bは製品source・SQL・外部データ・DDL・権限・Cron・flagを変更していない。2026-09-09 12:46–12:51 JSTの管理APIとcatalog SELECTに基づく。適用直前のbaselineを代替しない。

## 対象識別と既存14本

管理API `list_projects` の `tribe-neon-preview` / `sufvuqdnqohpfzkwxohq` / `db.sufvuqdnqohpfzkwxohq.supabase.co` / ACTIVE_HEALTHY / PostgreSQL17を確認。 [旧永続適用報告](raid_room_pc_persistent_execution.md) の対象と一致する。本番 `ktpolnkyyfkowxdmijww` は今回のSQL照会対象にしていない。

実DB `deployment_audit_raid_v1.applied_changes` に以下が存在し、[既存manifest](raid-room-persistent/manifest.json) と一致した。

- change_id: `raid-room-preview-375a0ad-delta-v1`
- payload SHA256: `adc3bccfc6345f5fd36dfcdd1d42bbba01531882437f61f50036365ed1d77ffb`
- source: `375a0ad642a81e9db10a9379f03e5e5f77fb4562`
- validation: `391e39766e13e4e9b4c23398e345ae5240c9aeb2`
- recorded_at: `2026-09-08 09:51:30.887865+00`

標準migration履歴は277件。元14本は標準履歴と独自適用台帳の差があるため、**元14本・旧snapshot差分・未登録8本を再投入しない**。`db push`、全未適用一括apply、履歴repairによる偽装登録も行わない。旧persistent driverも再実行しない。

現在のcreation/battle/rescueはすべてtrue。初回適用時falseだった旧報告を現状として扱わない。独自台帳にはその後のsmoke settings/expiry cron/legacy stop/room enable/QA HPの別適用IDも存在する。本工程でそれらを変更・再適用しない。

## 固定4本と適用順

以下は実ファイルbytesの `Get-FileHash -Algorithm SHA256`。親統合完了後と実適用直前に再計算する。標準履歴に4versionなし、対応新関数もなし、private schema / daily tableも未存在を実catalogで確認した。

| 順 | ファイル（supabase/migrations/） | SHA256 |
| --- | --- | --- |
| 1 | 20260908175140_raid_top_daily_authority.sql | 36621aa30007457f5e190896ffed90e3a0631e10eafc4cd469007537cb5ca14d |
| 2 | 20260908175143_raid_top_aggregate_api.sql | 34e1225b717b267760ebe90495203162630680fb52b67e9c08b0121d4b2d3d18 |
| 3 | 20260908181251_raid_room_display_projection.sql | 7944c2a068ea7ec78be6ad88823dbdc5aeac2ee0027a7000bc0003b8b7757e73 |
| 4 | 20260909023226_raid_remaining_pages_projection.sql | 14cb3052ffe7218730aab65640f0f484634d4cf43f8e4d56158dcc320b3a7ffb |

1は新private日次table/RLS/internal functionと既存choices/createの置換。2は日次を使うtop集約。3は参加状態・リーダー・Guild・予定報酬の表示補助。4は20件一覧・最大50救援ID・5体のskill/予定報酬表示。3/4は旧14本由来のread/資格/報酬設定テーブルを参照し、発行処理は変更しない。

確認した依存はcanonical_raid_variants（7エリア各5体、member_character_ids等）、canonical_quest_enemy_pool_entries（version/HARD/local_affinity/weight/skill_loadout）、canonical_skill_master（display_name/exclusive_character_id等）、clear/rescue reward rules/items、rescue publications（channel/guild_id等）の実列。private schemaが適用時までに他系統で作られた場合、1のschema全体REVOKEが共有ACLを変更し得るため、その時点で停止して差分レビューする。今回時点ではschema自体がない。

新規functionsはprivateの認証確認付きdefinerとpublic invoker wrapper。public/anon既定EXECUTEをREVOKEし、authenticatedのみ必要なschema USAGEと関数EXECUTEを付与する。private日次関数とtableはauthenticated直接権限なし。適用後はACL/RLSと未認証拒否を別途検証する。

## 置換される現定義との差

実 `pg_get_functiondef` を読んだ。現choicesはproduction-enabled全variantを返すSTABLE definer。候補はVOLATILEで同一日次正本の2件のみ返す。現createはSQL260相当で日次選択制限なし。候補はv_dailyと当日対象gateを追加する。既存の認証/READ COMMITTED/運用設定/ユーザーlock/同request payload整合/成功receipt返却/レベル5/難度lock/総合力/有効master/24時間生成/登録を保持する。同request成功再送の返却は日次gateより前、設定OFF時の再送拒否は既存どおり。

日次正本はJST当日行を保存し、日次advisory lockと再読で初回並走を直列化、待機中の日付変更を再確認する。参照RPCでも初回は日次tableへINSERTするため、**現工程のread-only SELECTで新top/choicesを試し呼びしない**。日次初期化は後続の承認済み実HTTP検証として扱う。

現関数 `md5(pg_get_functiondef(...))`（SQL文字列整形込みのdrift検知値、上記ファイルSHA256とは別物）:

| 関数 | MD5 |
| --- | --- |
| create_raid_room_v1(text,text,uuid) | 911e837f85fa0bf8decedd7280b4ccd3 |
| list_raid_room_boss_choices_v1() | 86250813d16aa8a6684eec94436f9f2a |
| raid_room_projection_v1(uuid) | 0839c20e092587c1a2395d01b3ee29e9 |
| raid_room_can_read_v1(uuid) | ed9422038f2bdc2886298edd9d310e33 |
| _raid_room_register_v1(uuid,uuid,text) | e5034819f20327d3c2d0ba520fbe3b0e |
| _raid_room_power_gate_v1(text,bigint) | b0f471fc30ebafc55a8207d451a2f5ed |
| calculate_user_total_power(uuid) | ab6772b65f3e345778686bfd49322828 |
| start_raid_room_battle_v1(uuid,text[],text,uuid) | 5681fbadc02025793f5f683723d2b975 |
| get_raid_room_rescue_v1(uuid) | 23bea9f29bb2a3b7d015abd457191b3c |
| get_raid_room_participants_v1(uuid,integer,integer) | a39135093bf37ad5a99f9d139096b818 |

## 親統合の既存本番依存を誤再適用しない

| 対象 | Preview標準履歴 | 今回実読取 |
| --- | --- | --- |
| 20260907000250 acquisition landing | あり | landing RPCあり、MD5 4c43e8a8f46f1e6afedd21f03d816692 |
| 20260907000251 world intro events | なし | observation RPCにWORLD_INTRO_SKIPPED、facts CHECKにVIEWED/SKIPPED両方あり。RPC MD5 44e979464caacdc3e9e17f338c730af2 |
| 20260905000241 preopen extension | なし | mission progress_end_atとranking master ends_atが双方2099-12-30 15:00:00+00（JST12/31） |
| 20260909003245 PvP bigint | このversionなし、20260909002512あり | get_pvp_opponents_page(uuid,integer,integer) MD5 636f7e768a3a554ba2b4a7f02f4bf372、Aが確認した本番hotfixと一致 |

begin_kpi_acquisition_journey_v1(text,text)も存在、MD5 22b2d9790128c32b6bf2685708850beb。履歴不在を未適用と判断して00251/00241を投入しない。00241の全更新列、00250/00251全文・ACLの候補との完全一致、過去の別適用台帳はこの補助照合では未確認。Raid4本の適用単位へこれらを混ぜない。

## 後続の適用・復旧手順（今回は未実行）

1. 親の完全SHA・4hash・対象ref・既存台帳を固定する。KPI/本番Character/他Preview担当と変更枠を調整し、外部CI/管理操作・実行中DDL・対象lockの重なりがないことを実行直前に確認する。4本以外のmigration経路が無効であることも確認する。今回は時間枠取得/停止操作をしていない。
2. 直前の履歴、2置換関数の全文/owner/ACL/config、private存在、保護関数MD5、対象table/RLS、フラグ、報酬設定、Cron定義を資格情報なしのbaselineへ保存する。古いユーザー/KPI件数を不変基準にせず今回直前値を使う。
3. 固定4本だけを順に扱う専用実行計画を親がレビューする。各ファイルにBEGIN/COMMITがあるため、外側BEGINで包むだけでは全体atomicにならない。全4本の単一transactionが必要なら、内側transaction境界のみを除く生成driverを別artifactとしてレビューしhashを付け、既定ROLLBACKで実DB検証する。元4ファイルは改変しない。運用可否・適用実行は後続承認の範囲で行う。
4. timeoutを設定し、DDL/postflight失敗はtransaction全体をROLLBACK。成功でも既定検証はROLLBACK後に新接続で旧定義/ACL/未存在tableへ戻ったことを確認する。予定を実施済みと記録しない。
5. 後続承認の保存実行では新しい適用ID・実行ID・hash・baseline/postflightを記録する。旧14本台帳を変更しない。標準履歴の扱いは専用driverと揃えてレビューし、未記録を一括repairで解消しない。応答消失時はOUTCOME_UNKNOWNとして再送せず、別接続の記録/定義で判定する。
6. 適用後の部分失敗がある場合、完了段階を照合してから新差分を作る。CREATE-only table/functionsがあるため4本を最初から再実行しない。COMMIT後の復旧は新日次データを消さず、親が固定旧関数/ACLを必要範囲で戻す別承認差分またはforward fixを作る。旧14本、報酬台帳、Replay、既存レイド、Cron、flagを巻き戻さない。

現flagsはtrueなので、4本の適用だけで新規挑戦可能対象が7→当日2へ変わる。稼働中の旧UIとの組合せを含め、変更枠/専用Preview配信と合わせる必要がある。無断flag OFFは復旧手順に含めない。

## 後続の実HTTP→3役UI確認（今回は未実行）

前提順序は **固定4SQLの適用とpostflight → 対応する固定フロントSHAの専用Preview配信 → 配信metadata/接続ref確認 → HTTP認証/表示/3役UI**。SQL適用前の最新フロント配信を接続成功としない。共有alias変更を伴わずimmutable URLで確認する。本工程ではSQL適用もフロント配信も行わない。

1. 固定Preview配信URL/完全SHAが対象Supabase refへ接続し、Mock無効であることを確認する。3つの独立browser profileを主催者・通常参加者・救援参加者に割り当て、承認済みQAアカウントの通常Authを使用する。token/password/refresh tokenはログ・HAR・READMEへ出さない。必要なアカウント作成やGuild加入は既存APIの後続承認済み操作とする。
2. HTTP bearerの本人sessionとsubjectを確認し、get_raid_top_v1を取得。未認証は拒否、認証後は本人参戦/閲覧可救援/日次を正しいresource状態で表示。RPC欠落・401/403・通信失敗を0件としない。top loaderのuser/Guild変更破棄と重複要求上限も確認する。
3. 同時3sessionのget_raid_top_v1とlist_raid_room_boss_choices_v1でdateJst/2variant一致、7エリア/5体masterと画面素材一致を確認。JST境界は実時刻または隔離環境で検証し、共有Previewの時計/日次行を直接変更しない。新requestの対象外拒否、既存成功request同payload再送は日跨ぎでも同レイド、異payload競合を確認する。既存24時間/撃破/日跨ぎ参戦が維持されることも別に確認する。
4. 主催者はトップ選択だけで開始せず、既存確認→挑戦受付へ進む。通常参加者は一覧→詳細→通常参加、救援者はActivity/GuildのrescueIdを保持して既存救援参加。各公開先のレイド毎3回、依頼時Guild識別、現在Guild閲覧制限、終了カードの戦況遷移を確認。通常参加を後から救援に読み替えない。
5. 同Replay再読込、MVP、個人敗北/共有撃破の別表示、実receipt damage/appliedDamage/lateFinalization、ack失敗時保持、ack成功後元レイド帰還、トップ更新を確認。プロフィール非重畳と戻りscroll、報酬予定と発行済みPresent分離/受取/closeを3役で確認する。資格条件は実設定を使用し、成立しない報酬を直接DB編集で作らない。
6. 390pxと低高さでタップ/横はみ出し/フッター/画像・文字を撮影し、人の目視と機械検証を分けて報告。開催中/撃破/期限終了/未取得を実API条件で確認し、作れない状態は未確認と明記する。

## 未確認・残件

- 4本は未適用。実DBのDDL実行/postflight、HTTP認証→集約、日次初回/並走/境界、3役UIは未実施。
- 専用配信URLの最終SHA/Mock無効/環境設定は親・Aの配信調査と統合freezeに依存。
- 最新Cron定義/実行中session/外部CI/QA3役の現存資格は本読取では未確認。適用直前確認として残す。
- 既存関数定義と主要依存列は確認したが、4SQL全依存の実DBcompile成功を意味しない。ROLLBACK検証を飛ばさない。

Supabaseスキルのchangelogと [Data API security](https://supabase.com/docs/guides/api/securing-your-api) を取得して確認。grantsとRLSは別層であり、関数wrapper権限/内部認証も合わせて検証する。Web markdown取得がunsupported content-typeだったためPowerShellのHTTPS読取へ切り替えた。外部書込は一切ない。

## 親レビュー後のEdge確認・切戻し補足

2026-09-09、親の統合候補 `86853c6241085fc3fc2a8e46fcf25973b4e1e77e` で読取再確認。`git diff 49222de05d0d9925beb6439c56c03a61b8564af5 -- supabase/functions src/domain/battle/canonical_runtime.ts src/domain/battle/canonical_effects.ts` は差分なし。既存Preview受入報告の配信SHA `feeca750e4c07e66c7607cfbb0290c3370a1aae8` と当該5ファイルも差分なし。対象は `resolve-battle/index.ts` / `engine.ts` / `raid-room-route.ts` とimportされるcanonical_runtime/canonical_effects。useBattleも既存 `resolve-battle` 呼出を維持し、新表示4SQLは既存finalizer参照を変更しない。**この固定候補のコード差分に起因するEdge追加更新は不要**。

[旧Preview接続記録](raid_room_preview_connection_report_20260908.md) と [受入記録](raid_room_preview_acceptance_report_20260908.md) ではEdge v7 / ACTIVE / verify_jwt=true、bundle SHA256 `b762e7c25826f9a417c87cf550388e291f2c75d0e278599e6a1d3dcd70fd8b21` を記録している。ただし本工程では現在稼働中Edgeのbundleを取得していないため、**稼働版との同一性は未確認**。後続実行直前に現version/設定/5ソース依存を読取照合する。不一致なら別差分レビューへ戻し、推測で旧Edgeを再配信しない。稼働版が期待どおりならSQL→フロント→HTTPの間にEdge deployを挟む必要はない。

フロントだけの不具合は、まずDB4SQLを保持したまま、戻す固定フロントSHAと新日次契約の互換性を確認して専用Preview配信先を切り戻す。旧UIでもchoices RPC経由なら当日2件となるが、7件前提・新表示RPC・Replay復帰の互換性は実際に検証する。共有aliasや運用flagを無断で変更しない。フロント切戻しを理由に日次正本をDROP/DELETEしたり既存レイド・参加・報酬を戻したりしない。

DB側の不具合もある場合はフロント切戻しと別に、保存済み2関数/ACLを使う最小復旧またはforward fixをレビューする。日次table/既存の日次2件は保持する。旧create/choicesへ戻すと新規挑戦対象制限が変わるため、それを単なるUI切戻しに含めない。新frontが新RPCを要求したままDBだけ旧状態へ戻す組合せは禁止し、実行順序と固定SHAを復旧manifestへ記録する。

canonical PvP `2b24b11f8e64f27391e5e09c09002c93ed7221e8` は親がローカル統合済み。Preview既存hotfix実定義一致のため、Bは追加SQLを作成しておらず、4本以外の適用は計画へ追加していない。
