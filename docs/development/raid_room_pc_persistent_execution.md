# Preview Raid差分：永続適用結果

2026-09-08、ユーザー承認に基づきPreview `sufvuqdnqohpfzkwxohq` へ適用した。結果は **APPLIED_VERIFIED**。最終レビュー版のローカルcommitは `06b7c90e42c790133077d48d998bd6b2a0dcaf20`。

## 変更枠・対象確認

KPI担当（thread `01a07f0f-3729-7db0-9851-642099bc7264`）から18:49:30〜19:04:30 JSTの15分間、DDL・migration・手動DB変更を重ねない回答を受領。直前確認で実行中Cron・他の変更sessionは0件。管理APIでproject ref、name `tribe-neon-preview`、host `db.sufvuqdnqohpfzkwxohq.supabase.co`、ACTIVE_HEALTHY、PostgreSQL 17を確認し、SQL接続でもsession_user postgres・port 5432・台帳schema不在を確認した。

実行前baseline9項目はすべて一致。対象13テーブルの比較基準は今回18:50:04 JSTの値。前回検証後に既存KPI Cronが稼働しているため、古いKPIデータハッシュを今回のデータ比較基準としていない。

## 実行とハッシュ

| 項目 | 値 |
| --- | --- |
| 適用ID | raid-room-preview-375a0ad-delta-v1 |
| payload SHA256 | adc3bccfc6345f5fd36dfcdd1d42bbba01531882437f61f50036365ed1d77ffb |
| 承認済みROLLBACK driver SHA256 | 08896f83bff86e677626c23060fec5ebc576d134dabc123021f80907b3267d1c |
| COMMIT driver SHA256 | 40300848ad76eea4e92c8eade09c3fc337197ff2cefaeb43bc6513d62c188fad |
| 保存時の実行ID | 731ff89a-5832-4c6b-9267-4fd1317fa902 |
| ROLLBACK / COMMIT transaction ID | 47161 / 47165 |

18:50:26 JSTに新driverのpostflight成功、既定ROLLBACKで終了。18:50:39の別接続でbaseline9項目・対象13テーブル・Cron6件の一致、台帳schema不在、transaction/lock残存なしを確認した。

COMMIT版はdriver末尾の `rollback;` だけを `commit;` へ変更し、その差分とSHA256を実行前に記録した。実行metadataのsession設定を前置し、Supabase execute_sqlの単一リクエストで各driverを1回ずつ実行した。実際に送ったリクエスト全文もUTF-8・LFで保存した。ROLLBACKとCOMMITの実行IDは別にした。

18:51:30 JSTにCOMMIT版のpostflight・台帳INSERT成功、正常応答。18:51:50に別接続で台帳1行とpostflightの再実行成功、元transaction終了を確認。18:51:53に既存データ・Cron等を再取得した。再送は行っていない。

## 保存後の検証

- 新規publicテーブル22（すべてRLS）、public関数402→438、列1560→1660、trigger87→89。
- 保護対象378関数の本文・owner・ACL・config・戻り型・definer属性が不変。
- 既存1560列と87triggerが不変。対象13テーブルの件数・内容MD5が実行直前と同一。
- Cron6件・migration履歴275件が同一。KPI保存結果355件、既存users19件、Guild0件を保持。
- Room作成・戦闘・救援フラグはすべてfalse、legacyはtrue、Room0件。報酬無効条件とRLSもpostflightで確認。
- 専用台帳 `deployment_audit_raid_v1.applied_changes` に適用ID・payloadハッシュ・作業者・承認・実行ID・postflight・transaction IDが1行保存された。

永続適用により、旧baselineに対する関数・列・制約・trigger・table grant/RLS・indexの全体ハッシュは変わる。これは予定されたDDL差分であり、保存後はpostflightと保護対象比較で判定した。migration履歴・Cron・policyの旧baseline照合は一致した。

確認完了後にKPI担当へ変更枠を解放した。Cron登録・停止、Deploy、運用有効化、push、本番変更、専用ユーザー/Guild作成は実施していない。元14本・未登録8本の履歴偽装やrepairもない。

## 証跡と後続

証跡は `evidence/raid-room-persistent-20260908/`。before、ROLLBACK結果・残存確認、COMMIT適用SQL・実送信SQL、execution-manifest、台帳とpostflight、after catalog、catalog-comparison、outcomeを収録。`scripts/raid-room/verify-persistent-catalog.mjs` で保存済みcatalogの比較を再現できる。

台帳のvalidation_commitはdriver設計時の実Preview ROLLBACK実績 `391e397` を指す。今回使用したdriverのcommit `06b7c90` は外部execution-manifestに記録した。

同じ適用IDでdriverを再実行しない。今後の修正・停止は別の承認差分として記録する。Cron・Deploy・運用有効化は別工程。今回は実戦闘・UI受入を実施していない。
