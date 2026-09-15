> **2026-09-12：この文書は9/11時点のSandbox実装・受入記録です。** 最新の商品・期限・ガチャ仕様は[統合設計書](../../specs/monetization_release_20260912.md)を参照してください。以下の旧商品のPASSを、最新仕様の受入完了と扱わないでください。

# Lane C 課金基盤 Preview 候補

## STATUS

ローカル実装と基本DB Preview受入完了。Stripe実テスト決済・配信・実機Acceptanceは未実施。
基準コードは `a744f9879320310bf72d66b955e401bf0eda048e`。既存ガチャ正常化成果は親が別途統合する。

## IMPLEMENTATION READY

- Checkout作成、Authユーザー照合、サーバー商品選択、注文予約、署名Webhook、配送、購入履歴、再確認、通常ショップDIA消費を実装。
- 購入アイテムはPresent配送。新たな受取期限は設けず、既存 `claim_present` へ接続。
- Secret、Stripe通信、配送RPCはサーバーのみ。旧Client疑似Stripe購入ハンドラを置換。
- 既存Present表示のNULL期限を「期限なし」に補正。

## STRIPE

実接続用鍵・Webhook登録・固定Preview配信が未取得。現在は接続不能。
この候補は `BILLING_SANDBOX_ENABLED=true`、Preview Supabase固定ref、`sk_test_`、Webhook Secret、戻り先HTTPSが全て一致した場合だけ有効。
`VERCEL_ENV=production` またはProduction Supabaseでは拒否する。

必要環境変数（秘密値はサーバー環境へ設定）:

- `BILLING_SANDBOX_ENABLED`
- `STRIPE_SECRET_KEY`（test）
- `STRIPE_WEBHOOK_SECRET`
- `SUPABASE_SERVICE_ROLE_KEY`（Preview）
- `NEXT_PUBLIC_SUPABASE_URL=https://sufvuqdnqohpfzkwxohq.supabase.co`
- `BILLING_RETURN_ORIGIN`（固定PreviewのHTTPS origin）

Webhook endpoint: `/api/billing/webhook`。
イベントは `checkout.session.completed` / `checkout.session.async_payment_succeeded` / `checkout.session.expired`。
Checkoutはカードのみ。失敗時は配送せず、同じ注文を再開する。

## PRODUCTS

親コンテキストの2026-09-10ユーザー確定値をAuthorityとして採用。

| 商品 | 価格 | 内容 |
|---|---:|---|
| ビギナーパック | 100円、1回限り | CASH5,000、SP3種券各3、Energy Drink5 |
| DIA | 300/500/1,000/2,000/5,000/10,000円 | 300/500/1,030/2,080/5,240/10,680 |
| Energy/BP/RP回復アイテム | 50/500DIA | 1/11個 |
| CASH | 300/500/1,000/3,000DIA | 3,000/5,200/10,500/32,000 |

回復アイテムの効果は既存CanonicalのEnergy50、BP/RP1。商品購入時に直接Pointを回復しない。
新確定商品に旧VIPや旧DIA商品を混ぜない。
ビギナーパックの旧24h/72h表記は現在の確定「1回限り」に合わせて削除。

## SHOP

既存通常ショップRPCのstubを使わず、サーバー商品masterによる原子的DIA消費＋Present配送へ接続。
同request再送は消費と配送を追加しない。結果不明の通信失敗ではrequest IDを保持。
購入履歴は最新50件。未確定注文は再確認可能。

## SPECIAL GACHA

UIにDIA/専用Ticketの1連/10連導線を追加。CASH/無料導線なし。
別候補 `preview_special_gacha.sql` は公開RPCの抽選履歴作成時にDIA/ticket以外をDBで拒否し、DIA単価をCharacter300、Skill/Equipment200へ更新。
確率、Pool、Feature Flagは変更しない。親レビュー時点ではこのSQLは基本billing schemaと分離。
Preview live確認: 公開5引数RPC2種はhistoryを作成し、旧4引数/coreのauthenticated/anon実行権限は閉鎖済み。
親が `billing_special_payment_boundary`（version `20260911133203`）をPreviewへ適用済み。3カテゴリ×DIA/Ticket×1/10連の12条件、同request再送、CASH/FREE/NULL拒否の実RPC受入PASS。全ROLLBACK、受入中のFlag OPENも永続変更なし。

## PAYMENT FLOW / IDEMPOTENCY

1. 検証済みAuth UIDと商品IDからサーバーで注文を予約。
2. DB注文IDをStripe Idempotency-Keyとして固定。商品内容・価格・戻り先は再送でも同一。
3. Stripe状態を再取得し、test mode、注文ID、UID、商品、JPY金額、sessionを照合。
4. 支払済みだけ、注文lock→Grant一意制約→Present→購入履歴を単一トランザクションで実行。
5. 再送は既存結果を返す。途中失敗は全ROLLBACK。

ブラウザの成功URLだけでは配送しない。中断URLだけでは注文を取消し済みにしない。
Stripeが実際にexpiredと確認できた場合だけ予約を解放する。付与済み注文は期限イベントで降格しない。
未確定注文が23時間以上経過した場合はStripeの冪等性保存期限に備えて再作成を拒否する。運営確認後の解消手順は実接続受入時に整備する。

## PREVIEW / ACCEPTANCE

対象: `sufvuqdnqohpfzkwxohq`。
親が `billing_sandbox_foundation`（version `20260911132848`）を適用済み。products17、orders/grants/receipts0を確認。
基本DB受入: 予約再送、商品/金額不一致、重複配送、Beginner購入制限/期限後再注文、DIA消費再送/残高不足、未認証権限拒否PASS、テスト全ROLLBACK。
NULL Present実受取/二重受取拒否、配送途中失敗ROLLBACKも親が実PreviewでPASSを確認、全ROLLBACK。
`node scripts/billing/verify_contracts.mjs`: sandbox境界・署名改ざん/時間・注文照合テストPASS。
`npx tsc --noEmit --pretty false`: PASS。
結合buildは親が実施。戻り画面はGameProviderを起動せず、共通Card/Headerと共通ボタンCSSを利用する。Stripe実test、カード失敗/取消/ブラウザ復帰、同時リクエスト実接続、実機Acceptanceは未実施。

## ECONOMY DEPENDENCIES

無料専用確率/Pool、Special相対価値、SSR供給速度はLane B待ち。
有償/無償DIA内訳・失効を含む本番運用契約は未完成。このSandbox実装をそのまま本番課金公開可能とは扱わない。
既存Feature Flagを開けていないため、閉鎖中のSpecial実RPCは別途Preview受入工程が必要。

## PRODUCTION

未実施。Production DB、Deploy、alias、Feature Flagは変更していない。

## 参照

- [Stripe Webhook署名検証](https://docs.stripe.com/webhooks/signature)
- [Stripe Checkout fulfillment](https://docs.stripe.com/checkout/fulfillment)
- [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)
