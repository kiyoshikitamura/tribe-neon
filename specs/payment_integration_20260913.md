# 課金統合候補 2026-09-13

基点 `a70421643702e47a88366ef9eea952f435ef2990`。正本 `monetization_release_20260912.md`。

## 実装

- 既存Stripe Sandbox Checkout・Webhook署名検証・冪等配送を再利用。
- 配送と期限イベントの競合で、配送済を期限切れ／処理中へ戻す応答を修正。未決済状態から配送しない。
- 9/12確定4パックのDB商品・120日・購入回数を反映するmigrationを作成。旧注文snapshotを新商品に書き換えず、旧内容での決済再開を拒否。
- config／Checkoutで4パックDB値を照合。旧DB＋新UIの商品不一致では販売開始しない。
- 付与トランザクションでPresentと購入lotを生成。初回配送確定時から120日、Present受取で延長なし。配送再送は増量しない。
- CASH／user_itemsの共通減算triggerで、失効した購入分の控除、期限近い購入分から消費、その後無料分を使用。既存無料分はロット化しない。
- `billing_refresh_paid_assets()` は自己所有分だけ失効反映して、有効ロットの数量・期限・受取有無を返す。PAYMENT公開時bootstrapとShop所持期限表示から使用する契約。
- Stripe画面遷移を開始した後は元画面の操作ブロックを解除しない。

## 接続契約

`GET /api/billing/config`:
`{available:true, mode:"sandbox", catalogVersion:"20260912", disabledProductIds:[DIA6商品]}`

旧DB／鍵未設定では `{available:false}`。
DIA6商品は有償／無償内訳未FIXのためCheckoutで拒否する。

`billing_refresh_paid_assets()`:
`{lots:[{item_id,quantity,expires_at,claimed}]}`

時刻は元の発行日時＋120日、UTC timestamp。UIはJSTに変換して表示する。
内部ロット消費関数は匿名／authenticated実行不可。所有者読み取りのみRLS許可。

## 検証

- `node scripts/billing/verify_contracts.mjs`: Sandbox境界、署名、金額・所有者・session整合。
- `node scripts/billing/verify_reconciliation.mjs`: 配送／期限イベント競合、古いイベント、未決済、旧catalog。
- `PGLITE_MODULE=<隔離PGlite entry> node scripts/billing/verify_paid_lots.mjs`: PostgreSQL互換ランタイムで実SQL実行。120日起算・受取後保持・購入分優先消費・失効・無料保持・上限・再送・金額不一致・権限。
- 型検証・変更API/サーバーLint。

ローカルfixture検証であり、Preview実DB・Stripe実決済・実機PASSを意味しない。

## 未完了の公開条件

- DIA内訳未FIX。DIA→アイテム／CASH／ポイントなど派生資産期限も未FIX。未承認の有償無償配分を作っていない。
- Stripe mode契約はsandbox/live両方を実装済み。実設定は未投入で本番default disabled。本番鍵・Webhook登録・公開は未実施。
- 旧Sandboxで決済開始済み／未確定の注文が存在する場合は更新前に棚卸しする。本候補は旧注文を無条件期限切れにしない。
- Previewで実カードテスト、Webhook再送、同時購入、Present一括受取、各育成・ガチャ・回復の期限消費、所持期限表示の実画面受入が必要。
- 既存データresetなど管理処理のuser_items削除は本候補のプレイヤー消費経路に含めない。
- 商品・規約・販売表示の整合と公開承認。

DB／環境変数／Production／共有aliasの変更なし。migrationは未適用。


## 追加差分：本番modeのコード準備

従来は設定不足だけではなく、APIとDBのtest専用条件が本番を拒否していた。追加migration `20260913111028_billing_checkout_mode_contract.sql` とAPI契約で解消する。

| 項目 | Sandbox | Live |
| --- | --- | --- |
| `BILLING_MODE` | `sandbox`、未指定時の既定値 | `live` を明示 |
| 有効化 | `BILLING_SANDBOX_ENABLED=true` | `BILLING_LIVE_ENABLED=true` |
| Vercel | production以外 | productionのみ |
| DB | Preview ref固定 | Production refまたは既存独自APIドメイン |
| Stripe鍵 | test key | live key |
| 戻り先 | HTTPS、Productionドメイン不可 | `https://www.tribe-neon.com` またはapexのみ |

同一注文のmodeは予約時に固定。再送時のmode変更を拒否する。Webhookのlivemode、sessionのprefix、注文modeを照合し、DB側のsession attach／付与／期限処理も一致を要求する。旧3引数の予約はSandbox互換として保持し、新APIは4引数でmodeを明示する。

テストはfixture key／sessionのみで行い、Stripeへ通信していない。既存Sandbox署名・復旧試験、mode境界試験、PGliteでlive注文の付与再送・test/live混在拒否をPASS。

**実装不足と設定不足の区分**：本番modeのコードは準備済み。残りは環境ごとのmigration適用・鍵と署名secret設定・Webhook登録・実接続受入・公開承認。DIA内訳／派生資産期限は別の仕様未FIXであり、本変更では解消していない。既存Sandboxの環境変数だけでLiveが有効になることはない。
