# Preview実機確認へ向けた並走対応

基準Commit: e7b45e56cc611127c908c384389f87cd3ebfbf09。Production接続・変更なし。最終配信SHAは親の完了報告を参照。

## 実施済み

|担当|成果|確認|
|---|---|---|
|課金|Preview config APIに秘密値なしの診断code/bool、CLIと共通化|6分岐・Production互換・秘密値非露出、既存3課金検証PASS|
|Season|既存月次runnerと次月継続の実DB試験、定義適用・inactive cron接続、公開時preflight/運用手順|POWER/GUILD_POWER、故意失敗時全rollback、再送・範囲外除外PASS|
|実機準備|最新機能の初回8項目＋実データ15項目の手順|旧URL・旧SHA・既完了機能の除外を持ち越さない|
|PvP競合|独立3接続とDB lock待ち観測の再現script、QA cleanup|構文/接続未設定時無変更終了のみ。実競合は未実施|
|親統合|旧9/16開始告知を正式OPEN同時開始へ修正、型・build・育成/専用演出回帰|すべてPASS。mock buildは実機代替ではない|

新規恒久DB変更はPreviewのinactive cron登録と次月継続関数の定義。Quest/Raid/PvP適用済み6Migrationを再適用していない。Cronは5分周期、active=false。実Season開始/終了/付与・運営告知は実施していない。

## 接続条件が整えば進める作業

- 最新固定Preview URL/SHA/DB照合 → `/api/billing/config`診断 → 必要設定の修正 → Stripe Sandbox実接続。
- `formal_open_preview_acceptance_20260915.md`の操作をPreview QAで確認。
- Previewの独立PostgreSQL接続を使い `pvp_finalize_concurrent_preview.py` を実行。Promise.all送信だけを競合証明にしない。
- 実切替時刻を確定後にSeason・準備Missionの公開運用、月次jobの有効化。

## 最後にまとめるユーザー対応

1. Vercelプラグインをkiyoshi-kitamura teamへ再接続、または最新Deploymentの固定Preview URLを提示。前者が可能なら環境照合と設定診断までこちらで進める。
2. config診断後、実際に不足と判明したPreview/Stripe設定だけ対応。秘密値はチャットへ貼らない。現時点では不足変数を断定しない。
3. Preview QAへのログイン可否と、最終URLでの本人実機確認。
4. 技術競合試験用のPreview直接DB接続を、実行環境へ安全に設定できるか。接続文字列をチャットへ貼らない。
5. 正式OPEN・操作停止・Mission Claim起算日時。Production反映判断は別途。

## 未完了を維持

固定URL/実配信DB照合、Stripe Sandbox、ブラウザ/本人実機、実競合、Season実切替と公開運用。次Season継続接続は定義・inactive job接続まで完了。売上KPI集計は公開後対応。

Vercel管理の正式呼出しは403。独立したローカル表示確認も正規BrowserのgotoがERR_BLOCKED_BY_CLIENTで阻害された。制限を迂回しておらず、アプリの画面不具合とは判定しない。

追加Migration: Repository20260915000741_monthly_power_rollover_definition.sql → Preview実version20260915000930。再適用禁止。型/build最終PASS。新buildの一度目は生成一時dirのENOTEMPTYで失敗し、当該一時dirを削除して再実行PASS。

## 最新運用方針：GitHub連携を主経路（2026-09-15ユーザー指示）

- 実装・Preview配信はGitHub→Vercelの既存Git連携を主経路とする。対象branchはcodex/formal-open-integration-preview-20260914。
- リモート保存後、対象CommitのVercel – tribe-neon statusを確認。別Project chat-fix-previewの結果と混同しない。
- Vercelプラグインは補助確認のみ。403解消は並行課題とし、実装・Preview配信を止めない。再接続を毎回の再開条件にしない。
- 固定URL・実配信DB・実機受入は独立の確認項目。Git連携成功だけでこれらをPASSにはしない。確認できない項目だけ残件へ記録し、進められる作業を継続する。
- Production反映は引き続き別承認。適用済みMigration再適用禁止・既存受入成果保持も継続。

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

確認範囲：preview_database=trueは配信サーバーのDB URL設定一致を示す。今回は環境検証で停止しており、config経由のDB照会成功・ServiceRoleの有効性までは証明していない。バッグの修正もbootstrap内部で握りつぶされる取得失敗は検出範囲外。
