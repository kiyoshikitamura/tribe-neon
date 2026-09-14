# 残件再開・統合記録 2026-09-14

基準SHA: ed215459dc1b895fe94b17fd28d66c991a3ba0d6
統合方式: 661dfd3 + 確認済みProduction差分の継承。今回Productionへの再反映・DB変更なし。

## 確定事項の反映
- 第1Seasonの3カテゴリは正式オープンと同時開始。終了10/1 00:00 JST維持。公開日時は運用時に明示指定。
- Season報酬の受領MD/Excelをspecsへ保存。全5シートを確認しMDと数量・資格一致。
- 売上KPI集計は公開後残件。リリース必須Gateから除外。決済・付与・返金記録の照合は課金受入で確認。

## 実装
- 承認18画像をZIPと同一bytesで格納。目元10点をcanonicalキャラの専用装備演出へ接続。
- Guild7都市＋rank1baseは配置済み、旧8紋章の意味・所持権を維持して接続保留。
- POWER/GUILD_POWER Season報酬表示、全Tier、予定報酬、在籍条件を接続。
- Guild Seasonの通常ItemをCosmetic扱いする通知parser不具合を修正。
- 報酬Master・immutable snapshot・直接Item配送の実装を追加。未解決Cosmeticを省略して配布完了としない。
- 3カテゴリ同時開始のservice関数候補。旧POWER処理・PREOPEN正規finalizeを飛ばさず、Migrationで切替は実行しない。

## 検証
- 型: PASS。
- Season報酬UI Tier境界/通知分類回帰: PASS。
- Battle presentation/full-skill-load、Character成長360ケース: PASS。
- ローカルBuild: Mockを明示したwebpack build PASS。通常Turbopackはnode_modulesの環境symlinkがroot外のため不可。実接続envなしのbuildとは区別。
- 課金既存3テストPASS、available:false原因・Stripe Sandbox実接続は未検証。実env/CLI認証なし。
- 実機受入は未完了。Guild素材接続・報酬未決点の確定後に残件をまとめて依頼。

## 判断が必要な事項
1. 都市Guild紋章は既存王冠/翼などとは別物。追加の標準紋章として登録するか、正式な既存ID対応を指定するか。
2. Seasonの称号/Badge/Emblem/Decorationの既存ID対応がない。資料の「既存IDのみ・推測作成禁止」に従い未接続。
3. Season中の7日在籍は、同Guildへの再加入前を合算するか、現在の連続在籍のみか。資料には再加入の規定なし。
4. 旧8月POWERがACTIVEで残存。新Season報酬を遡及転用せず、旧Seasonの報酬・終了扱いのAuthorityが必要。

課金の再開に必要なのは既存Preview環境でのcheck_sandbox_environment.mjs --remote-catalog診断結果。秘密値の共有は不要。

## Preview DB適用（親側）
- season_rewards_power_master_and_snapshot: 実version20260914143830 / repository20260914143144。
- formal_open_simultaneous_season_start: 実version20260914143857 / repository20260914112648（未適用だった旧予約候補を改訂）。
- 報酬9Tier、runs0、既存Season9、Season grants0、Present261で適用前後不変（新Master除く）。開始関数はservice専用、内部Item配送はserviceにも非公開。
- DB rollback検証: snapshot/6・7日境界/再送/原子性/終了後脱退/Present・CASH・DIA増0 PASS。
- 今回の恒久反映は定義のみ。Season開始・終了・確定配布・cron変更は未実行。
- complete名誉報酬の接続、定時自動finalizeと次Season運用は未完了。終了報酬全体を実装完了とはしない。

## 旧POWERの追加READ ONLY監査
20260817000154の初期化Migrationは5カテゴリを当月ACTIVEで生成し、報酬を対象外と明記。旧8月POWERは8/17作成から更新なし、参照14表と通知0件。初期データの取り残しと考えられるが、廃止の明示Authorityはない。
推奨処理は期間・行・資産・総合力を保持し、報酬なしでCLOSEDにすること。実行はまだ行わない。
