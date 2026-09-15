# 課金設定診断・売上KPIの再開条件

2026-09-14。コード監査基準: `112a213`。DB適用・決済・配信は未実施。

## 売上KPI

状態: **BLOCKED: F10–F13の正式定義をRepositoryから回収できない**。

`20260904000246_kpi_snapshot_refresh_rpcs.sql` の `refresh_kpi_revenue` は PAYMENT が CLOSED の場合のみ `not_applicable/payment_closed` を出力し、それ以外は `formal revenue KPI definitions F10-F13 are not fixed` を例外にする。後続Migrationに再定義はない。課金公開時にはこのまま売上集計できない。

回収対象: specsのKPI authority / M1・M2・M3 / production final preflight、docs・specsのMD/HTML、全MigrationとAPI。承認済み `monetization_release_20260912.md` は商品別購入UU・回数・金額等の計測要求を定めるが、F10–F13の集計定義までは定めていない。一般的なARPUの意味から正式分母を推定して実装しない。

別スレッドで回収・確認する事項:

- 売上計上時点: 決済時刻またはゲーム配送時刻。現在保存される `granted_at` は配送時刻。
- 金額: 税込額・返金/取消の扱い。現在 `payment_transactions.amount` は注文の円価格。
- PU/ARPPU/ARPU/PURの対象ユーザー、日次/月次の分母、ゼロ分母の扱い。
- QA・Sandbox除外と、ユーザー/Auth/subjectの同一性。
- 課金公開前の期間をゼロまたは対象外とする扱い。

### 再利用できる記録

| 段階 | 現存Authority | 注意点 |
| --- | --- | --- |
| 注文開始 | billing_orders.created_at / request_id | Checkout画面表示の成功時刻とは異なる |
| 配送完了 | billing_orders.granted_at / billing_grants | 注文行ロックとGRANTED復元で再送重複を防止 |
| 売上記録 | payment_transactions | billing_grant_order内で1回記録。Sandbox注文との対応を集計時に確認する必要あり |
| 有償ロット受取 | billing_asset_lots.present_id / claimed_at | 無償増量分は期限ロットを作らないため全配送品の受取記録として単独使用不可 |
| ガチャ実行 | kpi_fact_gacha_executions | 既存履歴hookで支払手段・回数を記録 |
| 天井交換 | special_gacha_exchange_receipts | request単位の重複排除済み履歴 |

timeseries APIは `revenue.pur` も表示対象とするが、旧stubはPU/GROSS/ARPPU/ARPUの4件のみ。PURも取りこぼさず定義照合する。

正式定義回収後のテスト: JST境界、同一人複数購入、重複通知、Sandbox/QA除外、返金、ゼロ売上/ゼロ分母、月次UU重複排除。定義未回収のためSQLと期待値を創作していない。

## available:false の診断

現状は原因未確定。公開config APIは環境条件不一致・ServiceRole接続失敗・catalog不一致をすべて false にまとめる。コード監査だけで特定の秘密変数の欠落とは断定できない。

既存の配信環境を読める実行環境で、秘密値を表示しない既存スクリプトを使う:

```sh
node scripts/billing/check_sandbox_environment.mjs --remote-catalog
```

NodeのTypeScript直接実行に対応するランタイムで実行する。ローカルに配信設定がなければ、ローカルの結果をVercel設定の検証と扱わない。

| 出力 | 次の限定確認 |
| --- | --- |
| checksのfalse / BILLING_CONFIG_INVALID | 該当条件のみ既存Preview設定と照合 |
| catalog_httpが2xx以外 | Preview ServiceRoleのDB接続・権限を確認 |
| catalog_httpが2xx、catalog_matches:false | catalog.tsと当該DB商品の差分を確認 |
| CATALOG_CONNECTION_FAILED | 配信環境からPreview DBへの接続を確認 |
| 全条件true | config APIのavailable:trueを確認し、既存受入手順へ |

診断スクリプトはDB商品をGETするのみで、決済・資産変更をしない。Stripeテストキーと署名secretは形式のみ検証し、Stripe実接続やWebhook登録先の正しさは証明しない。

固定Previewの `BILLING_RETURN_ORIGIN` とWebhook配信先が同じ受入候補を指すことは別途確認する。キー再発行・新規Product/Price登録は要求しない。Checkoutは既にinline price_data方式。

terms/tokushoは9/13の120日期限・期限継承・使用後保持へ更新済み。法的適合の判断ではなく、承認済み商品仕様とのコード上の一致を確認した。
