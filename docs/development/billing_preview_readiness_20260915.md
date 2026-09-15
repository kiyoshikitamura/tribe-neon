# 課金Preview実機準備（2026-09-15）

## 実施した修正

`/api/billing/config` は VERCEL_ENV=preview の場合だけ、秘密値を含まない `diagnostics.code` と条件の真偽値を返す。Production・developmentは従来レスポンスを保持。販売可否の条件、商品内容、購入・配送処理は変更しない。

従来は設定不備・DB照会失敗・商品不一致がすべて available:false だけになり、Vercel設定参照権限がなければ診断が進まなかった。次回Preview配信後は公開config APIのGETで原因分類を取得できる。

| code | 確認対象 |
|---|---|
| ENVIRONMENT_INVALID | checksでfalseとなった既存Preview設定のみ |
| CATALOG_QUERY_FAILED | 配信APIのServiceRole接続・DB照会権限 |
| CATALOG_MISMATCH | DB商品と承認済みcatalogの差分 |
| SERVICE_FAILED | 設定後の接続例外・応答異常 |
| READY | available:true。Sandbox実接続受入へ進める |

checks.return_origin_matches_request は戻り先とアクセス中Preview originの一致。falseでも販売可否を独自に変更せず、配信先照合の材料として提示する。trueでもWebhook登録先の一致は別確認。秘密キー・DB URL・戻り先URL・DBエラー本文はレスポンスへ出さない。

CLI `check_sandbox_environment.mjs` とAPIの条件診断を共通化した。CLIは従来同様、配信設定を取得しないため、ローカル実行をVercel設定の確認結果として扱わない。

## 検証

- verify_config_diagnostics: 6分岐（環境不備・照会エラー・空応答・商品不一致・接続例外・正常）、Preview限定、Productionレスポンス互換、秘密値非露出、戻り先比較 PASS。
- verify_contracts / verify_modes / verify_reconciliation PASS。
- これらはローカルテスト。Stripe実決済・Webhook実配送・iPhone復帰は未実施。

## 現在の実行環境

実.env、Stripe関連秘密値、Supabase ServiceRole、Vercel Token、CLI認証、project linkは存在しない（値を出力せず存在のみ確認）。接続済みツールにStripe操作機能はない。既知Vercel403は再試行していない。したがって現時点で available:false の具体的な不足変数は未確定。

DB変更、Migration適用、設定変更、決済、Deploy、Production接続はこの作業では未実施。

## 次の自動作業と最後のユーザー依頼

1. 親エージェントが統合してPreview配信。
2. 固定Previewのconfig APIを読み、diagnosticsを記録。アクセス可能ならユーザー作業依頼より先に実施。
3. false条件が設定不足の場合、該当Preview変数だけ管理画面で補う操作を最後に依頼する。秘密キーのチャット貼付や全キー再発行は求めない。
4. Stripe既存テスト環境のキー・Webhook登録の有無確認が必要な場合のみ、その管理操作を依頼。
5. available:true、Sandbox mode、戻り先とWebhook候補照合後、specs/billing_preview_acceptance_20260913.md の受入手順を実施。

実機受入にはカードテスト決済、外部Checkout復帰、取消、Webhook重複、Present受取と有償/無償内訳の記録が必要。実課金は行わない。

親統合追記：診断に公開Commit SHA（40桁hexのみ、それ以外null）を追加。固定URL取得後、配信SHAとPreview DB条件を同じ応答で照合可能。実環境での値確認は未実施。
