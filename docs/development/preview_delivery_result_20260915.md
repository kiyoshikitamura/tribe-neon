# Preview追加対応の配信結果（2026-09-15）

実機確認対象（コードCommit）: `31b1ccc7fd287d0f1cb9baa9875cc497ce24c46c`

固定URL: https://tribe-neon-7mo29wwyp-kiyoshi-kitamura.vercel.app/

Deployment: `dpl_H9c44HbRmm7or2ijoMXcntg3icbt`

GitHub `Vercel – tribe-neon` はsuccess。固定URLとブランチURL双方の `/api/billing/config` が上記SHA、deploymentUrl、preview_database=trueを返した。固定URLのCloud Browserは起動完了しTAP TO START表示。別Project chat-fix-previewのfailureと区別する。後続の記録だけのCommitは、この固定URLのコード確認対象を変えない。

## 完了

- バッグのBP/Raid Ticket使用確定後、表示同期失敗を使用失敗として再試行案内する問題を修正。古いユーザーの応答も抑止。
- 両Ticket・同期例外・無効receipt・連打・ユーザー切替のhandler回帰PASS。既存Inventory projection / Raid ticket回帰PASS。
- Preview診断6分岐、Production互換、公開SHA/URLの入力検証PASS。
- 型検査・mock mode webpack build PASS（実データE2Eを意味しない）。
- GitHub→Vercelの既存Git連携で配信成功。固定URL/SHA/Preview DB URL設定照合まで完了。
- 直前db20428の公開タイトル遷移とHome fixture描画を確認。実戦やiPhone受入の代わりにはしない。

## 残件・ユーザー対応

1. Preview課金設定：BILLING_SANDBOX_ENABLED=true、STRIPE_SECRET_KEY（sk_test_）、STRIPE_WEBHOOK_SECRET（whsec_）、BILLING_RETURN_ORIGIN（利用するPreview origin）。現在の診断はこの4条件がfalse。未設定と形式不正の区別はできない。秘密値はチャットに貼らずPreview対象へ設定する。設定後の新配信で再診断し、戻り先・Webhook・Auth許可URLの整合とStripe Sandbox受入を行う。
2. 既存QAログインと本人端末のD01–D08/E01–E15受入。固定URLを上記へ更新して記録する。
3. 独立接続によるPvP初回finalize実競合試験：Preview PostgreSQL接続を実行環境へ安全に設定。接続文字列はチャットに貼らない。
4. 正式OPEN・操作停止・Mission Claim起算日時の確定。月次jobはinactiveのまま。Production反映は別承認。

Vercelプラグイン403は補助確認の並行課題。再接続を実装/Preview配信の停止条件にしない。今回はDB更新・Migration再適用・Production反映なし。

`preview_database=true`は配信サーバーのDB URL設定の一致。課金環境検証で停止しているため、config経由のDB照会成功・ServiceRoleの有効性・商品一致はまだ未確認。
