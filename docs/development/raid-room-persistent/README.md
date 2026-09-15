# 永続適用用driver（既定ROLLBACK）

完成SQLは `persistent-apply.sql`。現段階では実DB未実行。UTF-8（BOMなし）・LF固定で、Git属性も追加した。391e397の過去の実行証跡や元14 migrationは変更していない。

## 動作

適用IDは `raid-room-preview-375a0ad-delta-v1`。01＋02をLFへ正規化して連結したpayloadのSHA256を、実行直前にPostgreSQLのsha256で検算する。SQL本文の改変・CRLFへの変換はハッシュ不一致となる。全文のSHA256、baseline・postflightのSHA256はmanifest.jsonに記録する。署名機構ではないため、承認済みmanifestとの外部照合は必須。

BEGIN→作業者・承認・実行ID検査→transaction advisory lock→既存記録検査→元baseline9項目→台帳新設→payload検算・実行→元postflight→台帳INSERT→NOTIFY→ROLLBACKの順。保存時にもDDLと記録は必ず同一transactionに入る。

台帳は専用の非公開schema `deployment_audit_raid_v1.applied_changes` とした。共用schemaを再利用せず、既存schemaに期待する記録がない場合も停止する。既存schemaを検査なしに受け入れて適用を継続する経路はない。ownerはpostgres、RLS有効、PUBLIC/anon/authenticated/service_roleの権限なし。同ID・同ハッシュはALREADY_APPLIED、同ID・別ハッシュはCHECKSUM_CONFLICTで拒否する。記録を削除して再適用せず、修正は別ID・別driverとする。

## 将来の実行手順

1. KPIとの作業枠、管理APIのproject refと接続host `db.sufvuqdnqohpfzkwxohq.supabase.co` を再照合する。このSQL自身は接続先の外部識別を証明できない。
2. manifestとSQLの生バイトSHA256を照合。before・実行ID・承認参照・接続先（資格情報を除く）を外部証跡へ保存する。
3. psqlなら `-X -v ON_ERROR_STOP=1` を必須にし、同じ接続で以下のsession設定を行った後にdriverを読み込む。値は実際の作業者・承認参照・UUIDに置換する。管理接続で実行する場合も同じsession内に設定する。

```sql
select set_config('raid.operator', '実際の作業者', false);
select set_config('raid.approval', '実際の承認参照', false);
select set_config('raid.execution_id', '00000000-0000-0000-0000-000000000001', false);
-- 上のUUIDは例。実行ごとに新規UUIDを発行する。
```

4. まずこのdriverをROLLBACKで再検証する。永続適用の別承認後に限り、レビュー用コピーの末尾1文をCOMMITに変更し、その最終ファイルのSHA256を外部manifestへ新しく記録する。
5. COMMIT後は新規接続で台帳1行・期待する適用後catalog・KPI/Cron/フラグを再照合する。応答断はOUTCOME_UNKNOWNとし、記録とtransaction終了を確認するまで再送しない。DB台帳のrecorded_atはcommit時刻ではない。

## 検証結果

`validation.json`：隔離PGliteで9項目PASS。DDLと台帳の同時ROLLBACK、payload改変拒否、postflight失敗時の原子性、隔離DB内COMMIT後の記録保存、再実行・異ハッシュ拒否、主キー重複拒否、未知schema拒否、標準経路ガード、UTF-8/LFを検証した。COMMIT試験は使い捨てのメモリDBのみ。

記録機構の試験は小さい合成payload/baseline/postflightを使用する。実Raid payloadは既存 `verify-step2-offline.mjs --bundle` も再実行し、200表・157関数の再構成、133保護signature、機能フラグ・RLS、snapshot・Guild投稿回帰がPASS。今回の新driver全体を現Previewで実行した実績はない。複数接続でのadvisory lock競合はPGliteの当試験では未検証。

再現コマンド（RAID_PGLITE_MODULEにPGlite 0.5.8のローカルentryを指定）:

```text
node scripts/raid-room/build-persistent-driver.mjs
node scripts/raid-room/verify-persistent-driver.mjs
node scripts/raid-room/verify-step2-offline.mjs --bundle
```

## 標準migration経路

`run_guarded_supabase.mjs` はPreviewのdb push/reset、migration up/repairを拒否する。`run_guarded_migration_file.mjs` はPreviewへの個別migration適用も拒否する。環境名と解決済みproject refの両方で検査し、CLI起動より前に停止する。独自台帳を標準migration履歴と誤認しない。

ローカル `.github/workflows/quality.yml` は品質検証のみで、DB migration配信命令は見つからなかった。元14本と未登録8本は標準migrationディレクトリに残っており、直接のSupabase CLI・MCP・管理者接続にはこのラッパーのガードが効かない。Repository外のCI・Dashboard設定は今回未確認。この制約を元migrationの履歴偽装や一括repairで解消しない。

## 今回のレビュー完了条件と変更枠の運用

ユーザーの2026-09-08の指定により、全経路の技術的遮断は今回の追加完了条件にしない。今回使用するdriverの重複拒否（validation.jsonでPASS）と、変更時間中に他のmigrationを重ねない運用を確認対象とする。

Preview永続適用前にKPI担当と具体的な開始・終了時刻を再合意し、その時間内は他のDDL・migration・手動DB変更を重ねない旨の回答を証跡に残す。直前に実行中migration等がないこととbaselineを再照合し、担当者を一本化して今回のdriverを1回実行する。事後の台帳・postflight照合が完了するまで変更枠を維持し、終了後に担当へ解放を連絡する。重複拒否・不明応答時は自動再送しない。

前回ROLLBACK検証で合意した時間枠は終了済みであり、今回の永続適用枠はまだ設定していない。既存Cronは保持し、新規Cron登録・Deploy・運用有効化は別工程とする。

実DB COMMIT・Cron登録・Deploy・pushは実施していない。変更はローカル作業ツリーに保持している。
