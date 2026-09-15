# 第6工程 A — Preview適用前読取

対象は `sufvuqdnqohpfzkwxohq` のみ、source `2d2d2b1563e92f1471f9c86fa8a7cc59040ec726`。AはSELECTをREAD ONLY transactionで実行し、外部DDL/DMLは実行していない。

2026-09-09 14:07:55 JST基準でPostgreSQL17.6、標準履歴277件、対象4version未存在、private schema未存在を再確認。旧14本独自台帳のchange ID・payload hashは第5工程計画と一致。新4本のファイルSHA256も計画の値と一致した。creation/battle/rescueは全てtrue、Cron7件。query textやCron commandは秘密の混入を避けhashのみ保存。実行中の他DDL session、AccessExclusive/ShareRowExclusive/Exclusive relation lockは観測されなかった。直前再確認は必要。

`outputs/step6/functions-baseline.json` はRaid全関数とPvP/計算/編成の計66定義MD5/owner/ACL/security/configを含む。既存置換対象2関数のみ全文を保存。計画の既存10MD5は一致。ownerはpostgres、2置換のACLはpostgresとauthenticatedのEXECUTEのみ。`catalog-baseline.json` に73関連tableのRLS/owner/ACL、flags、Cronを保存。`data-baseline.json` は73table計5,707行の件数・整列行hashだけで、個人行の内容は保存しない。

保護対象に既存rooms/bosses、Replay、報酬台帳、Present、既存users/育成/装備/編成、canonical masterを含む。指定の既存2Roomも全Room hashに含まれる。auth session件数・KPI時系列集計を不変gateにしていない。通常Cronを停止しない。DDL transaction中に保護データの自然変動が起きれば保守的にROLLBACKし、原因を確認して新baselineで判断する。失効を無理に戻して合格させない。

指定QA3役はkpi_subjectsと現時点有効kpi_account_classification_periodsを結合し、全3件にqa/test分類があることを実SELECTで確認。資格情報は読取・記録していない。

## 親レビュー用artifact（未実行）

- `outputs/step6/build-driver.mjs`: source bytes hashを固定4値と照合。各SQL先頭BEGIN/末尾COMMITだけを除き順に連結。他のSQL本文は不変。
- `driver-rollback.sql`: 単一transaction、終端ROLLBACK。試行専用execution ID。
- `driver-commit.sql`: 管理API/direct SQL用単一transaction、終端COMMIT。保存専用execution ID。
- `driver-tool-transaction.sql`: apply_migration側transactionに委ねる外側BEGIN/COMMITなし版。保存版と同じID。これとcommit版を両方実行しない。
- `driver-manifest.json`: source hashes、payload/driver hash、実行ID。再生成でID/hashが変わるので親review後はfreezeする。
- `postflight-in-transaction.sql`: 同transactionのtemp baselineが前提。単独実行用ではない。
- `restore-two-functions-review-only.sql`: 取得済旧2関数全文・owner/ACLを復元するレビュー案、既定ROLLBACK。新private/table/daily dataは削除しない。適用後forward fix/復旧の必要性は親判断。
- `read-catalog-baseline.sql` / `read-data-baseline.sql`: 別接続で戻り状態・保存状態を調べるSELECT。新top/choicesを呼ばず日次初期化しない。

driverは旧14本台帳不変、4version/private未存在、全66既存定義MD5をpreflightでguard。postflightで非置換64定義MD5、全66owner/ACL、73tableデータ、flags/Cronのtransaction内不変、日次RLS/空table/auth直接不可、public wrapper5個auth許可/anon拒否/invoker、匿名private USAGE不可、page内部helper直接不可をassertする。

既存 `deployment_audit_raid_v1.applied_changes` 実列をSELECT確認済み。新change ID `raid-preview-step6-four-sql-v1` に4sourcehashをpostflight JSONへ記録し、payload hash/source/validation/execution/operator/approval/baselineを保存する。既存14本を再投入・偽repairしない。apply_migration保存時は追加の標準履歴1件が生じることを別記し、元4versionを個別適用済と偽記録しない。

親が選択した経路はapply_migrationの単一transaction。dryrunではdriver-tool-transaction.sqlのexecution IDを試行用へ替え、最後に固有例外 `RAID_STEP6_EXPECTED_ROLLBACK_AFTER_PASS` を発生させ、全DDL・ledger・標準履歴をROLLBACKさせる。固有例外を受けただけで復旧成功とせず、別接続で履歴277/privateなし/新ledgerなし/旧2MD5へ戻ったことを確認してから、保存版を例外なしで送る。BEGIN/COMMITの内側挿入は禁止。応答消失時はOUTCOME_UNKNOWNとして再送禁止、別接続で新ledger/関数/privateの有無を照合する。Aはどちらも実行しない。

Supabase changelog.md と database/functions.md を本工程で再取得。今回扱うcatalog/関数経路の関連breaking changeは見つからず。非公開schemaのdefinerと明示search_path/EXECUTE制御に沿って確認した。

## 未完了

HTTP3役・日次初期化・実機受入はこのDB postflightの対象外。共有変更枠は親がKPI/Character担当と確保し、通常Cronを保持する方針。

## 親適用後の別接続postflight

親報告: apply_migration dryrunは固有EXPECTED_ROLLBACK例外に到達し、別接続でprivate未存在/履歴277/試行ledgerなし/旧2MD5を確認した後、保存用driverを適用成功。Aはこの外部変更を実行していない。

Aは親の適用後に新たなREAD ONLY接続で以下を再照合（2026-09-09 14:14:55 JST）。

- 標準履歴278件。追加は `20260909051355 / raid_step6_daily_top_display_pages` の1件のみ。dryrun名の履歴なし。
- 独自ledger新ID1件、execution `c19b5615-aaed-4c29-a3cd-73a2a801729e`、source完全SHAと4sourcehashがmanifest一致。payload `cd7310f1ccc9b3a988fbd0fe8aed56e1015dbe4aa08b30ce5c3ca293e2e85298`。
- 既存非置換64関数MD5・owner・ACL一致。既存73tableの件数/内容hash、tableowner/ACL/RLS、creation/battle/rescue flags、Cron全一致。
- 新public5本はinvoker、authenticatedのみEXECUTE、search_path=pg_catalog。
- 新private関数は7本（daily/top/display/page entry/browse/rescue/enemy）。dailyとpage entryはpostgresのみ、他5実装はauthenticated EXECUTE。すべてdefiner、search_path=pg_catalog。
- private schemaはpostgres owner、authenticated USAGEのみ、anon USAGEなし。日次tableは空0件/RLS有効。authenticatedは日次table・日次関数・page entryを直接操作不可。

`outputs/step6/postflight.json`、`functions-postflight.json`、`data-postflight.json`、`catalog-postflight.json` に証跡保存。DB適用後postflightはPASS。新関数を呼び出して日次行を作る操作はしていない。
