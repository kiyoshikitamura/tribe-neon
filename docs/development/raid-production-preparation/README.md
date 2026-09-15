# Raid本番移行準備 — 完了報告

本番書込み・Deploy・公開切替なし。候補統合、固定DB Bundle、隔離DBリハーサルと本番実行/復旧手順を作成した。公開設定と実サービス接続の残件があるため、本番公開判定はHOLD。

## 1. 統合候補

完全SHAはこのフォルダーを追加した最終ローカルcommitと完了レシートを参照。親が単一の統合/配信担当。

- Character/Card基準: 64c7d388f55bc3a3294a5281b6b12d11761ebe37
- Raid受入基準: 3ec04503024211e720489a56f9bfa6ae7cb5c66f（merge親として保持）
- 命中修正: 84a1231845a5e0a82dce91c4f37267e833c1605f（対象ファイル完全一致）
- 型/Mock build PASS、関連123テストとブラウザー12件PASS、Character契約PASS。
- [保持証跡](integration/preservation.json)、[検証記録](VALIDATION.md)

## 2. Bundleと公開値

[SHA256SUMS](bundle/SHA256SUMS)と[manifest](audit-a/plan-manifest.json)でファイル名/ハッシュ固定。`node docs/development/raid-production-preparation/verify-manifest.mjs`で照合する。

| 順序 | ファイル | 役割 |
|---|---|---|
| 読取 | 00-readonly-recheck.sql | 本番実定義/稼働状態再照合 |
| 1 | 00-baseline-guard.sql | 実定義/権限/Cron/履歴/private差異で中断 |
| 2 | 01-snapshot-dependency.sql | 既存snapshotへ必要metadataを追加、既存補正保持 |
| 3 | 02-raid-delta.sql | 依存順19ソース、初期装備含む。QA値なし |
| 4 | 04-postflight.sql | KPI等対象外本文/RLS/ACL/policy/Cron保持確認 |
| 別工程 | 03-expiry-cron.sql | 毎分Room期限処理登録 |
| 復旧 | 05-stop-new-operations.sql | 新規受付停止、4flag assert、台帳維持 |
| driver | review-apply.psql | 1–4単一transaction、既定ROLLBACK |

[公開設定一覧](audit-a/public-settings.json)に7地域HP、4難度参加下限、未確定報酬/貢献閾値、stage/公開flagを分離記録。現本番のHPを保持し、QA短縮HP/テスト報酬/QAユーザーはBundleへ含めない。

## 3. リハーサル

[詳細報告](rehearsal/REPORT.md)、[固定Bundle実行結果](rehearsal/production-bundle-result.json)を正とする。

判定: **PARTIAL_PASS（DB準備PASS、実Auth/Edge/Cronを通す全工程は未PASS）**。

本番202relation/405関数等を隔離Native PostgreSQL17へ再構成し、変更なしの00/01/02/04と実psql driverのROLLBACK/COMMIT、05停止を検証。対象外379関数と旧ACL/RLS/policy保持。さらに同じ本番再構成＋固定Bundle適用DBで、合成ユーザー3人の挑戦/参加/救援/実snapshotによる戦闘開始/合成結果の確定/討伐/報酬発行/受取/再送を13群PASS。公開HPを短縮せず、制約/関数は変更しない。別業務fixture17件で期限/旧境界/復旧等、2接続で競合も確認。合成結果・今回DB検証・過去実Preview証跡を混同しない。

実Auth、resolve-battle Edge、Cron daemonを同じ隔離環境で通すリハーサルは未完了。未確定の公開設定をQA値で埋めて全体PASSにはしない。

## 4. 実行/復旧

[統一RUNBOOK](RUNBOOK.md)に担当、実行順、接続先、固定SHA/Edge、必要build値、限定alias、直前再照合、中止/復旧を記録。

DB→互換Edge→期限Cron→新規Production build→確定公開設定→ゲームwww/apexだけのalias切替→実接続smoke。KPIも同projectなので汎用promote/rollbackは使わない。commit前はROLLBACK、公開後は新規受付停止と互換DB/Edge保持。台帳や資産を消して復旧しない。

## 5. 残る判断・阻害要因（まとめ）

1. **公開報酬/閾値**: 4難度ごとの救援minimum battles・救援貢献damage・討伐貢献damage・両報酬item_id/quantity。確定資料がなく、指定sourcesも空。値確定後に操作ON SQLをhash固定し、その設定で再リハーサルする。公開HPは本番値保持が今回計画。
2. **完全な接続リハーサル環境**: Productionと区別した使い捨てSupabase project（実Auth/Edge/Cron対応）を用意する担当とref。共有Previewへ本番用Bundleを無断再適用しない。詳細手順はC報告に用意済み。
3. **統合受入の不足分**: 通常password再ログイン後の初期装備同UUID/重複なし、統合候補の実Tutorial命中→Result継続、実Cron期限終了。既存Fresh付与/本人再試行/匿名reloadと3ec実機受入は再利用し重複確認を要求しない。
4. **本番実行窓**: 公開判定が成立した時点で親一名へ実行を集約。KPI3 migration、保存集計Cron等の新しい変更・定義hash・alias/Edgeを直前再照合。今回の本番未実行指示を維持。

上記以外の準備に確認待ちは挟まず実施した。新たなレイド修正依頼やCardだけの再分岐は不要。
