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

## 2026-09-15 追加対応：Git連携経由の実配信確認

- GitHub check-runsのVercel Preview CommentsからブランチURLを取得： https://tribe-neon-git-codex-formal-open-integr-800ed5-kiyoshi-kitamura.vercel.app/
- 00:38 UTCのconfig GETでHTTP 200、配信SHA db20428a09c99a252ddc8060813fb88803951705、preview_database=trueを確認。GitHub tribe-neon statusもsuccess。ブランチURLは更新されるため、以降の実機受入は最新SHAを再照合する。
- 課金はENVIRONMENT_INVALID。sandbox_enabled / stripe_test_key_present / webhook_signing_secret_present / return_origin_valid がfalse。mode_sandbox / non_production_runtime / preview_database / service_role_present はtrue。キー未設定と形式不正の区別はこの診断だけではできない。
- 現時点でユーザーに必要な課金設定はPreview対象のBILLING_SANDBOX_ENABLED=true、STRIPE_SECRET_KEY（sk_test_）、STRIPE_WEBHOOK_SECRET（whsec_）、BILLING_RETURN_ORIGIN（利用するPreview origin）。秘密値はチャットへ貼らない。戻り先・Webhook登録URL・Auth許可URLはQAで使うoriginと整合させる。設定後はGit連携で新配信し再診断する。
- Cloud Browserで公開タイトル→TAP TO START→開始選択の遷移PASS。Home表示fixtureは読み込み後に描画、画像欠落0、desktop viewport 1363で横overflowなしを確認。HomeのBattleボタンはfixtureのno-opで、実データのD/E受入PASSにはしない。ブラウザ拡張由来のmetadataエラー1件はアプリ不具合と分類しない。
- 今回は公開PreviewでBrowser動作可能。以前のローカルERR_BLOCKED_BY_CLIENTを現在の公開Previewの阻害条件として扱わない。QAログイン・実戦・iPhone Safari・Stripe接続は引き続き未実施。
- バッグのBP/Raid Ticket使用成功後にbootstrap再読込が失敗すると誤って使用再試行を促す問題を修正。成功receiptを維持して再読込案内を表示し、別ユーザーへの遅延通知を抑止。両Ticket・刷新失敗・不正receipt・連打・ユーザー切替のhandler回帰PASS。既存Inventory projection検証もPASS。
- Preview診断へ検証済みVERCEL_URL由来のdeploymentUrlを追加。公開hostのみ返し、秘密値/任意URLは返さない。固定Deployment URLの取得をVercelプラグイン403に依存させない。Production応答の互換性を保持。
- DB変更・Migration再適用・Production反映なし。Vercel403再接続は実装/配信の前提条件から除外済み。

最新の依頼残件：上記4項目のPreview課金設定、QAログインと本人実機受入、技術競合試験用Preview PostgreSQL接続の安全な設定、正式OPEN/操作停止/Mission Claim起算日時。Production反映は別承認。

参照: https://vercel.com/docs/environment-variables/system-environment-variables 、 https://vercel.com/docs/environment-variables/managing-environment-variables （設定変更は新Deploymentへ適用）。

確認範囲：preview_database=trueは配信サーバーのDB URL設定一致を示す。今回は環境検証で停止しており、config経由のDB照会成功・ServiceRoleの有効性までは証明していない。バッグの修正もbootstrap内部で握りつぶされる取得失敗は検出範囲外。
