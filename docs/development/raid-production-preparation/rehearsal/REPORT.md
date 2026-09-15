# 隔離リハーサル実行記録

この記録は本番移行準備であり、本番書込み・公開切替を行っていない。総合判定は PARTIAL_PASS。DB互換性・局所的な業務回帰と、Supabase実接続受入を分ける。

## 今回の実行

- 現Production catalog（202 relation / 405 function）から専用PostgreSQL 17.11を再構成。ホスト127.0.0.1、port55462、専用初期化cluster。既存OSの5432接続は使用しない。
- 未変更の`review-apply.psql`で00 baseline guard→01 snapshot→02 Raid差分→04 postflightを単一transaction内で適用。379の対象外関数とACL保持、新Room RLS、作成/戦闘/救援false、報酬false、legacy trueを確認。
- ROLLBACKにより新Room relation不在・405関数の復元を照合。
- PGlite最小fixtureで統合ライフサイクル・回復制御17件PASS。挑戦・通常参加・救援・戦闘・討伐/期限終了・報酬発行/受取・再送・二重受取拒否・旧開始済Replay確定・旧生成停止・取消/復帰を含む。この17件はProduction再構成DBの実戦闘ではない。同じ再構成DBでの追加13群は後述。
- Native PG17の別最小fixture、2接続で同一要求の同時Room作成が同一Roomへ収束することと、排他lockのtimeout/ROLLBACK後の再開を確認。
- 既存 `scripts/raid-detail/verify-display-pg.mjs` をNative PG17で実行、4群PASS。`outputs/raid-detail/actual-display.json`を実生成。表示projection、通常/救援所属、他人/匿名拒否、表示参照で報酬等の副作用なし。

正確な判定・ファイルハッシュは `production-bundle-result.json`、`targeted-regression.json`、`native-concurrency.json` を参照。

## 証跡の再利用と未確認

`docs/development/raid_room_preview_acceptance_report_20260908.md` の専用Preview実戦闘11件、3役、Present4件、再送/再受取拒否は過去の有効証跡として再利用。旧配信SHAであることを維持し、今回統合SHAの実接続PASSに数えない。報告内のQA限定HP短縮・テスト報酬/QAユーザーは本番設定へ持ち込まない。

`docs/development/evidence/raid-step6-supplement/parent-natural-expiry.json` は期限前でUNVERIFIED。自然期限終了のPASS証跡として再利用しない。

Native PGは実PostgreSQLだが、AuthはGUCで代用、Cronはcatalog metadataのみ、Edge/HTTP/UIサービスはない。業務fixtureのsnapshot/result/報酬は合成である。本番同等のAuth/RLS経由、Edge resolve-battle、Cron daemon、実ブラウザーを通す全工程PASSとは区別する。

## 再実行

`scripts/raid-production-rehearsal/native-pg-adapter.mjs` はlocalhost55462、専用user `raid_top_local`、PG17だけを許可し毎回新規DBを作る。外部接続文字列は受け取らない。`RAID_TOP_DATA_RUNTIME`には固定済みpg依存を置くディレクトリを指定する。

```powershell
$env:RAID_TOP_DATA_RUNTIME='<pg依存ディレクトリ>'
$env:RAID_PGLITE_MODULE=(Resolve-Path scripts/raid-production-rehearsal/native-pg-adapter.mjs).Path
$env:RAID_REHEARSAL_ENGINE='Native PostgreSQL 17 / isolated loopback 55462'
node scripts/raid-production-rehearsal/verify-production-bundle.mjs docs/development/raid-production-preparation/bundle/01-snapshot-dependency.sql docs/development/raid-production-preparation/bundle/02-raid-delta.sql
node scripts/raid-production-rehearsal/verify-native-concurrency.mjs
node scripts/raid-detail/verify-display-pg.mjs
$env:RAID_TEST_RUNTIME='<PGlite0.5.8依存ディレクトリ>'
node scripts/raid-production-rehearsal/run-targeted-regression.mjs
```

## 完全な接続リハーサルの残工程

必要な環境判断は「Productionと区別された使い捨てSupabase検証projectを用意する担当・project ref」。共有Previewへ本番用DDLをそのまま投入しない。未確定の公開閾値/報酬値は別途設定一覧の判断対象であり、QA値で置換して公開可にしない。

1. Production readonly schema snapshotから専用projectの構造・関数・RLS・ACL・view・必要な非個人master・Cron定義を復元する。Authは専用の新規3人（主催/通常/救援）で、既存Productionユーザーを複製しない。
2. BundleのSHA256SUMSを検証。隔離ref/URLを実行台帳に固定し、00 baseline guard→01→02→04を同一transactionで適用。環境固有のguard差があれば、偽装PASSせず差異と理由を別記してレビューする。適用後に旧flag true/新flag falseを照合。
3. 固定統合SHAのRoom対応Edgeを専用projectへDeployし、同SHAフロントを専用URLへDeploy。DB→Edge→UI順。Production aliasを付けない。candidateとEdgeハッシュはrelease-audit証跡を使う。
4. 隔離環境限定の設定を独立台帳に記録して有効化。Roomの公開HPは公開候補のmaster値を保持。試験用戦闘で短縮が必要な場合は専用Roomだけを明示し、公開設定の受入と混同しない。
5. 各役の実認証セッションで挑戦→通常参加/救援リンク→通常攻撃/スキル→終了→Present発行/単件受取を操作し、Replay ID/Room ID/Present IDでAPI応答とDB台帳を結びつける。同じ開始/確定/受取を再送し消費/貢献/台帳/所持数不変を照合。別ユーザーのIDでは拒否を確認。
6. 旧開始済Replayを切替前に作り、旧生成停止後も旧確定を通す。新旧ルート、既存Present受取、KPI/非Raidランキング保持を確認。
7. `03-expiry-cron.sql`を隔離環境のみ実行し実daemonによる期限終了を観測。事前にRoom expires_at、次回job時刻、job結果・finalized_atを記録。手動batchの成功を自然Cronの成功にしない。
8. `05-stop-new-operations.sql`を隔離環境で実行。新規操作拒否、開始済Replayの確定/復帰、本人Present受取、Room期限job継続、台帳保持を確認。BEGIN内の障害ROLLBACKと、適用後の前進停止を別ケースとして記録。
9. Character/カード枠/チュートリアルを同配信で受入。命中エフェクト、HP/数値同期、cut-in解除、Result→継続、SKIP非表示。初期装備はFresh→再ログインの不足証跡だけ補う。
10. 実行SHA・DB Bundle hash・Edge hash・設定・結果・実機受入者/時刻を別欄で記録し、全件PASSになるまで本番実行判定を出さない。

## 最終のBundle/復旧照合

Native PG17でProductionの7 viewsとoptions、postgres owner、関数ACL、table RLS/ACL、107 policies、Cron metadata6件、migration履歴17件まで再構成。**未変更の00 baseline guard全項目と、強化済04 postflightがPASS**。初期試行ではviewをtableに置換していたためguardが正しく停止したが、実view定義を追加取得して再構成を修正し、guard自体は変更していない。

実psqlで未変更の`review-apply.psql`を既定ROLLBACKと明示COMMITの両方で実行しPASS。COMMITした先は新規作成した隔離DBだけ。その後、未変更の`05-stop-new-operations.sql`を明示COMMITし、4フラグfalseの永続化、Room/Replay/Present件数とCron metadata保持を確認した。Production再構成データは空であるため、開始済みReplay継続と受取の業務結果は別の17件fixture試験としてのみ報告する。

完全な接続リハーサルに残るのはSupabase Auth/Edge/UI/Cron daemonを含む統合SHAでの一貫した実接続証跡と、公開設定の確定。SQL Bundle適用/transaction rollback/前進停止/定義保持については今回の隔離PG17でPASS。

専用localhost55462クラスタは検証終了後にpg_ctl fast stopで正常停止した。再起動にはlocal-pg-path.txtの所有clusterのみを指定する。既存OSの5432 serverは変更していない。


## 最終検証artifact SHA256

|ファイル|SHA256|
|---|---|
|01-snapshot-dependency.sql|`42076766fddb5fe9aefa3fb14c7dda88ab7b89b7d3ff4d0a7b2f1e9caa1703c5`|
|02-raid-delta.sql|`8c2d65e3a6ec2c615f3d6efbece9e1be0acb0e05070060b5da19b33dbabffd46`|
|00-baseline-guard.sql|`cb0b62fe9a52c7a5984258563e394232e9c951fe64fcd010b92355488bf383e1`|
|04-postflight.sql|`fc1f2ce45e8ce1be2313154593efed58c077e328e77e23724398a6e440490d35`|
|05-stop-new-operations.sql|`ea307347c3dba800496a1ab6657dab1624d9830d523ecaeb6c06d39d7797bde1`|
|review-apply.psql|`a72d3297f98ec8ca84e71b172c3480331c4c57f0e2f3e0198eac916a81d8d8a7`|

同じ再構成DBでの基本ライフサイクルは追加検証で完了（下記）。実Edgeの戦闘計算、HTTP認証、Cron daemon、同じDBの期限/旧戦闘境界は引き続き残る。

## 同じProduction再構成DBでの追加ライフサイクル

`same-bundle-lifecycle.json` は `production-bundle-result.json` と同じDB `raid_prod_rehearsal_1788965164920` を使用した13群PASS。関数置換・constraint/trigger無効化・Bundle変更なし。

候補のcanonical character/skill/equipmentデータとRaid variantを投入。公開HP32,000,000を短縮せず、専用合成3ユーザーを既存制約・KPI/保守trigger込みで作成した。Room作成→通常登録→救援公開/参加→3役のサーバーsnapshot/開始→合成戦闘resultをサービス専用確定RPCへ投入→討伐→救援者の両報酬発行/Present受取/二重受取拒否までPASS。3 Replayの確定再送で同じ結果を返すことも照合。3Replayと2PresentのIDはJSONに記録。

初期依存として `guard_preopen_guild_power_cutoff()` のSELECT INTO STRICTがPREOPEN master/season行不在でP0002となった。専用DBだけに将来期間2099年の合成PREOPEN season行を作って既存guardを通し、guardは変更しなかった。QA用報酬CASH19/37、救援1戦/100貢献、討伐閾値0を隔離fixtureとして明示。これらの値・2099年season・合成ユーザーは本番Bundle/公開設定に含めない。終了時に新規操作/両報酬flagをfalseへ戻した。

試行中のusername制約違反はfixtureを7文字以内・試行ごとの一意名に修正。seed抽出のSQL文字列境界を修正。製品DDL/業務関数/制約は変更していない。

この追加PASSはSQL実行と実サーバーsnapshotであり、戦闘resultは合成、AuthはGUC。実Edgeによる計算・HTTP認証・UI受入として報告しない。期限終了/旧開始済戦闘境界/回復17ケースは引き続き別の最小fixtureでのPASS。完全Supabaseサービスについて、親の探索ではdocker/deno/supabaseはPATH上に見つからず、Docker/Edge runtime/完全ローカルstackは起動していない。環境の担当/refと公開設定確定が必要。

再実行: native clusterを再起動後、`RAID_TOP_DATA_RUNTIME`を指定し `node scripts/raid-production-rehearsal/verify-same-bundle-lifecycle.mjs`。先行Bundle検証結果の専用DB名とloopback/server identityを検証して接続する。共有Preview/Productionへの接続文字列を受け付けない。
