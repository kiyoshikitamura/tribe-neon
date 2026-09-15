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
