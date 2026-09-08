# Raid 永続適用の記録・再実行防止案

作成日: 2026-09-08。391e397のROLLBACK検証に対する追加設計であり、同commitの実行証跡には含まれていない。今回DBへ接続・変更せず、COMMIT・Cron登録・Deploy・push・Git commitも実施しない。

## 適用単位と記録

固定の適用IDを `raid-room-preview-375a0ad-delta-v1`、対象を `sufvuqdnqohpfzkwxohq` とする。対象はsnapshot依存差分＋Raid14本由来の調整済み差分のみ。元14本や未登録8本を適用済みと偽装しない。Cron・運用有効化・テストアカウント作成は別の適用単位とする。

次回の永続適用用driverは、以下の順序で別ファイルに作る。391e397の展開SQLは検証証跡として不変に保つ。現在のreview-apply.psqlの末尾だけをCOMMITへ置き換える方法では、以下の記録・再実行防止は備わらない。

1. KPIと時間枠を再調整し、管理APIのproject refと接続先hostを照合する。GUCの自己申告だけでは接続先を証明できない。
2. Repository上で承認対象ファイルの生バイトSHA256を確定し、before状態・承認者・作業者・実行IDを保存する。SQL内に最終SQL自身のハッシュを埋め込むと循環するため、下記DB記録には01＋02のpayloadハッシュを使い、展開済み最終driverのハッシュは外部manifestに記録する。
3. 単一接続でBEGIN、ON_ERROR_STOP、statement_timeout 60秒、lock_timeout 2秒を設定する。共通advisory lock取得→記録テーブル準備・再実行判定→00 baseline guard→01依存→02差分→04 postflight→適用記録INSERT→NOTIFY→終端、の順序を固定する。
4. 記録部分を追加した新driverも既定ROLLBACKで事前検証する。01/02だけでなく、記録の原子性、同時実行拒否、再実行拒否を隔離DBで試験する。現時点ではこの追加driverは未実装・未実行。
5. 将来、永続適用が承認された回だけ終端をCOMMITにする。正常応答だけに依存せず、新規接続から記録1行と適用後catalog・フラグを照合する。

## DB内の記録とガードの具体形

以下は将来driverへ組み込む設計SQL。今回実行しない。`deployment_audit`は新設案で、既存同名schema・tableの有無、owner・定義・ACLを事前確認し、不一致なら停止する。既存オブジェクトをIF NOT EXISTSで無条件に信用しない。Data APIの公開schemaに追加しない。

```sql
-- BEGIN後、DDLより先に実行。全Raid適用driverで同じキーを共有する。
do $$ begin
  if not pg_try_advisory_xact_lock(20260908, 250263) then
    raise exception 'RAID_APPLY_BUSY';
  end if;
end $$;

-- 初回だけ。既存の場合は事前に定義・owner・ACLを検証する。
create schema deployment_audit authorization postgres;
revoke all on schema deployment_audit from public, anon, authenticated, service_role;
create table deployment_audit.applied_changes (
  project_ref text not null,
  change_id text not null,
  payload_sha256 text not null check (payload_sha256 ~ '^[0-9a-f]{64}$'),
  source_commit text not null,
  validation_commit text not null,
  execution_id uuid not null unique,
  operator_identity text not null,
  approval_reference text not null,
  evidence_path text not null,
  baseline_manifest_sha256 text not null,
  postflight jsonb not null,
  database_role name not null default session_user,
  transaction_id xid8 not null default pg_current_xact_id(),
  recorded_at timestamptz not null default clock_timestamp(),
  primary key (project_ref, change_id)
);
alter table deployment_audit.applied_changes enable row level security;
revoke all on deployment_audit.applied_changes from public, anon, authenticated, service_role;
```

owner以外に書込を許可せず、アプリ用policyは作らない。通常運用ではUPDATE・DELETEせず訂正は別の監査イベントで残す。DB管理者まで含む改ざん防止機構ではないため、外部証跡も保存する。recorded_atはCOMMIT時刻ではなくtransaction内の記録時刻である。

既存記録を読み、DDL実行前に次の判定を行う。パラメータは事前manifestの値を安全にバインドする。文字列結合でSQLを組み立てない。

```sql
-- このSELECT結果をガードDOブロック内で判定し、該当時はRAISE EXCEPTION。
select payload_sha256, execution_id
from deployment_audit.applied_changes
where project_ref = 'sufvuqdnqohpfzkwxohq'
  and change_id = 'raid-room-preview-375a0ad-delta-v1';
```

| DBの状態 | 処理 |
| --- | --- |
| 同じ適用ID・同じpayloadハッシュあり | ALREADY_APPLIEDで停止。SQLを再実行せず、記録と現定義を照合する |
| 同じ適用ID・異なるpayloadハッシュあり | CHECKSUM_CONFLICTで停止。上書き・自動スキップしない |
| 記録なし、baseline一致 | 初回適用を継続 |
| 記録なし、baseline不一致 | DRIFT_OR_UNRECORDED_APPLYで停止。定義と履歴を調査する |
| ロック取得不可 | RAID_APPLY_BUSYで停止。待機後の自動再送はしない |

postflight成功後にのみ、上の全必須列を指定して通常のINSERTを1回行う。ON CONFLICT DO NOTHING / UPDATEは使わない。複合主キーは同じ適用IDの重複記録を最終的に拒否する。DDLとINSERTを同一transactionに含めることで、ROLLBACK時は両方消え、COMMIT時は両方残る。ロックを無視する別経路のDDLをadvisory lockだけで阻止することはできない。

## 外部実行記録

`docs/development/evidence/raid-room-persistent-<実行ID>/`へ次を保存する。現時点では作成せず、成功実績も記入しない。

- request.json：project ref、host（資格情報なし）、適用ID、実行ID、作業者、承認参照、KPI調整枠、source/validation commit。
- manifest.json：01/02それぞれのSHA256とpayload SHA256、最終driver SHA256、baseline manifest SHA256。payloadは01の生バイト＋02の生バイトをこの順で連結したものと定義する。改行の自動変換もハッシュ不一致として扱う。
- before.json、実際に送信したexpanded SQL、postflight.json、実行応答、時刻・transaction ID。
- after.json：別接続から取得した適用記録、適用後catalog、保護対象KPI/Cron/shared関数、フラグ。Roomフラグfalse、Cron追加0を再確認。
- outcome.json：APPLIED_VERIFIED / ROLLED_BACK / OUTCOME_UNKNOWNのいずれか。適用後の期待catalogハッシュを次回照合用に別途保存する。事前baselineが一致することを永続適用後の成功条件にしない。

## 応答断・再試行・復旧

COMMIT応答が失われた場合はOUTCOME_UNKNOWNとして停止し、同じSQLを再送しない。元transactionの終了を確認したうえで新規接続から適用IDを検索する。記録と期待する適用後定義が一致すればAPPLIED_VERIFIED、記録なし＋事前baseline一致なら未適用と判断できる。それ以外は部分的な手動変更や未記録適用を調査する。

ROLLBACK検証ではDBに適用済み記録を残さず、外部証跡だけ残す。永続適用後に停止・修正が必要でも元記録を削除して再実行可能にしない。停止または修正差分に新しい適用IDと承認・証跡を割り当てる。元SQLの内容修正だけで同じIDを使い回さない。

## Supabase migration履歴との関係

この台帳はSupabase標準migration履歴とは別物である。Supabase CLIは `supabase_migrations.schema_migrations` を参照するため、独自台帳を追加しても元14本・未登録8本の自動再適用は防げない。[公式migration説明](https://supabase.com/docs/guides/deployment/database-migrations)

共有Previewでは通常のdb push・migration up・全未適用ファイルの一括applyを使用しない。現時点でpushを行わないため、CI上の恒久ガードもまだ導入されていない。永続適用前には対象Previewへの自動DB migration経路を確認し、標準履歴との整合計画が完成するまで停止を確認する。許可する実行経路は上記専用driverだけに限定する。既存8本の一括repairや元14本の適用済み偽装で解消しない。

通常のmigration配信へ戻す場合は、環境別の履歴と実定義を照合した後、別工程で正規化したmigration基準点・配信対象を設計し、空DBからの再現と既存Previewとの差分ゼロを検証する。この移行が完了するまでは「標準CLIを含めて二重適用防止済み」とは扱わない。

transaction単位のadvisory lockは終了時に自動解放される。セッション単位のロックと混用しない。[PostgreSQL 17ロック仕様](https://www.postgresql.org/docs/17/explicit-locking.html)
