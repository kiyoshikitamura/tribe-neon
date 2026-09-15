# 課金Sandbox Preview受入の現状と再開手順

対象SHA `3dd18ca`。対象URL https://tribe-neon-1qhzjkpal-kiyoshi-kitamura.vercel.app 。接続DB `sufvuqdnqohpfzkwxohq`。

## 実確認

- `/api/billing/config`: HTTP200、`available:false`。
- Preview DBをREAD ONLYで取得。4pack＋DIA6商品について最新catalogの価格・生涯回数・数量・有償/無償内訳・120日期限が一致。商品不一致は原因から除外できる。
- この作業環境に実 `.env`、Vercel/Stripe CLI認証、関連秘密環境変数はない。現在接続済みのツールにはVercel/Stripeはない。Plugin Managementで検索したところ両方の接続候補はAVAILABLE、installed:false。接続・インストールは行っていない。
- `billing/config`は環境検証・ServiceRoleによる商品照会の両失敗をavailable:falseへ集約している。リモート環境設定の不足／誤設定／ServiceRole照会失敗のどれかは、配信環境を読めないため未特定。秘密値の入力をチャットへ求めない。
- 商品DBの照合に使用した管理接続は配信APIのServiceRoleではないため、APIのDB接続成功とは扱わない。
- Production、環境変数、Stripe登録、QA資産は変更していない。テスト決済未実施。

## 最小の再開操作

最初にVercelの既存Preview設定と実行ログを読める接続を用意し、どの条件が不一致かを確認する。すべての変数を新規発行・再設定することは要求しない。Stripeの既存キーやWebhook登録が使えるなら再利用する。Stripe側の不足が判明した場合に限り同サービスの接続・管理画面で設定を補う。キーのチャット貼付は不要。

## Previewの必要設定

設定先は専用Preview。Productionや共有aliasを変更しない。下記は値の仕様であり秘密値を含まない。

|変数|必要条件|
|---|---|
|BILLING_MODE|sandbox|
|BILLING_SANDBOX_ENABLED|true|
|VERCEL_ENV|preview（Vercel管理値）|
|NEXT_PUBLIC_SUPABASE_URL|https://sufvuqdnqohpfzkwxohq.supabase.co|
|SUPABASE_SERVICE_ROLE_KEY|上記Previewプロジェクトの既存サーバー専用キー|
|STRIPE_SECRET_KEY|テストアカウントのsk_test_キー|
|STRIPE_WEBHOOK_SECRET|当該Previewの署名Webhook secret|
|BILLING_RETURN_ORIGIN|使用する固定Preview HTTPS origin。path/queryなし|

Webhook: 固定Previewの `/api/billing/webhook`。
必要イベント: `checkout.session.completed` / `checkout.session.async_payment_succeeded` / `checkout.session.expired`。
決済はカードのみ。登録済みStripe endpointやキーがあれば再利用し、別テスト環境の署名secretを流用しない。
新しいimmutable URLへ配信する場合、戻り先とWebhookが同じ受入候補へ接続するよう配信担当が確認する。

配信環境で `node scripts/billing/check_sandbox_environment.mjs --remote-catalog` を実行すると、秘密値を表示せず各条件とcatalog照合結果だけ確認できる。このローカル環境で実行しても、Vercel上の環境変数は取得できない。
設定反映後 `/api/billing/config` の `available:true / mode:sandbox / catalogVersion:20260913` を確認して受入開始。

## 次の実画面・Stripeテスト

1. KPI除外Preview QAでビギナー100円のテスト決済。Checkout表示価格・商品一致→決済→戻り→Present受取→数量・購入回数・120日を確認。
2. DIA1,030をテスト購入。有償1,000／無償30の別配送と受取後の内訳を確認。受取で期限延長しない。
3. Webhookの重複送信と戻り画面再確認が競合しても注文GRANTED・配送各1回。Reload後の再配送なし。
4. 支払取消・カード拒否では付与なし。未確定注文を購入履歴から再開できる。成功後に古いexpiredイベントを受けても状態降格しない。
5. 通常ショップでCASH・回復アイテムへ交換。購入確認の期限継承文、元期限・合計数量、再送時追加消費なしを確認。
6. Special4種×DIA/チケット×1/10の16条件は既存SQL受入結果と区別して実画面の抽選→演出→取得確認を実施。CASH導線なし、10連追加保証/割引なし、Pt保持と100Pt交換を確認。
7. 購入分と無料分の混合・複数期限・失効後消費拒否はSQL検証済み。実UIでは保有内訳と期限表示を確認し、実時間120日待ちは要求しない。
8. iPhone Safariで外部Checkoutから復帰、画面遷移中の背面操作禁止、再受取不可を確認。

期待値は9/13確定経済仕様を使用。9/11旧READMEの旧ビギナー数量・無期限記述を受入正本にしない。

## 追加コード変更

今回、ゲームの課金処理は変更していない。秘密値を出さない環境preflightと、本受入手順のみ追加。
