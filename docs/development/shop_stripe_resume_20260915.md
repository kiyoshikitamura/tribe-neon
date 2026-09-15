# ショップ公開・Stripe接続再開（2026-09-15）

対象はPreview `sufvuqdnqohpfzkwxohq`、Gitブランチ `codex/formal-open-integration-preview-20260914`。Production公開・実課金禁止。

## 今回の対応

- フッターの固定「準備中」をSHOP運営状態に接続し、メイン画面へShopTabを接続。
- PreviewのみSHOPをOPENへ変更。PAYMENTはCLOSEDを維持。`supabase/operations/preview_open_shop_20260915.sql` は適用済み。
- 商品設定取得のtimeout・再確認、購入履歴のスクロールと連打防止。
- 決済通信のtimeoutでも購入番号を保持し、同じ注文で再確認可能にする。
- Checkoutの購入元と戻り先originが異なる場合は予約前に拒否し、セッションを失う導線を防ぐ。
- 最新catalogの4パック・DIA6商品・通常交換10商品を維持。DB20商品を確認。価格・数量・回数・有償無償内訳・120日期限の変更なし。

## Stripe実接続に必要な設定（PC Codex向け）

Vercel team `kiyoshi-kitamura` / project `tribe-neon` の対象Previewブランチだけに設定する。既存値・Webhookが使える場合は再利用する。秘密値をチャット・ログ・Gitへ出さない。Production用キーは禁止。

| 変数 | 値 |
|---|---|
| BILLING_MODE | sandbox |
| BILLING_SANDBOX_ENABLED | true |
| STRIPE_SECRET_KEY | 同じStripeテスト環境の既存sk_test_キー |
| STRIPE_WEBHOOK_SECRET | 下記endpointの署名secret（whsec_） |
| BILLING_RETURN_ORIGIN | https://tribe-neon-git-codex-formal-open-integr-800ed5-kiyoshi-kitamura.vercel.app |

`SUPABASE_SERVICE_ROLE_KEY` とPreview URLは既存設定を保持する。`BILLING_LIVE_ENABLED` は変更しない。上記5変数のうちmodeは未指定時sandboxだが、設定時は明示する。

Stripeのテスト環境に登録するWebhook:

```text
https://tribe-neon-git-codex-formal-open-integr-800ed5-kiyoshi-kitamura.vercel.app/api/billing/webhook
```

イベント:
- checkout.session.completed
- checkout.session.async_payment_succeeded
- checkout.session.expired

Stripe接続・CLI認証がなければ公式ログインで本人操作が必要な箇所だけ案内する。新しいStripe契約・本番アカウント作成は今回の範囲外。別endpointの署名secretは使わない。

設定後はGitHub既存連携でPreviewを再配信する。Vercel管理のVERCEL_ENVを手動作成しない。固定deployment URLではなく上記更新URLでログイン・購入する。

## 設定後の確認順

1. `/api/billing/config` がavailable:true / mode:sandbox / catalogVersion:20260913、Preview DB一致、戻り先一致。
2. Stripe配送先へ保護画面なしで到達できること。署名検証を解除しない。
3. Preview PAYMENT運営状態をOPENへ揃え、テスト専用ユーザーで100円パック・DIA1,030のテスト購入。
4. Webhook配送、Present受取、回数・有償1,000/無償30・期限を確認。
5. 重複通知、戻り画面再確認、取消、カード拒否、期限イベント競合を確認。
6. iPhoneで外部Checkoutから同一ユーザーへ戻れることを確認。

現在のクラウド実行環境にStripe/Vercel CLI認証・Stripe秘密値はなく、接続済みツールにStripe操作・Vercel環境変数変更機能もない。設定・実Stripe決済・Webhook実配送は未実施であり、ローカル試験を実決済PASSにしない。

既存の受入仕様: `specs/billing_preview_acceptance_20260913.md`。古い文書のDIA内訳未FIX記述より後続の20260913確定catalogを優先する。

## 実装検証

型検査、Next.js webpack build、運営状態による画面露出検査、確定商品catalog検査、billing契約・mode・reconciliation・config診断・API fixture検査はPASS。API fixtureは署名付き通知、二重通知、未決済、遅延・不一致通知、所有者チェック、timeout後の購入番号保持を確認。実Stripe決済、実Webhook配送、iPhoneでの購入往復は未完了。

既存の運営露出検査には、ホームの現行「ギルド」導線を旧「ギルドバトル準備中」と判定する古いassertionがあったため、現行ギルド導線とGvG非露出の検査へ修正。
