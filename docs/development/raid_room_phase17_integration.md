# 第17工程 親統合記録

2026-09-08。基準SHA `45dcaba09ac0872c976b5fdcbf773beb096813f2`。RAID-A/C/P-17は設定・切替準備の範囲でVALIDATED。

## 成果

- A: 固定SHAの旧一覧・生成・開始、Room設定、Edge分岐、期限Cron、復旧方針を照合した切替手順。
- C: オフライン設定生成のNodeテスト11件と検証記録。
- 親: 4難度の未入力JSON template、確認用SQL生成、設定投入手順、レビュー・再実行。

前回のローカル作業環境と検証runtimeが消失していたため、必要なファイルのみGitHub固定SHAから復元した。全体checkout/依存runtimeを復元したという意味ではない。PRの第16工程成果物へ指定ファイルのみ追加する。

## 親検証

`node --test tests/raid-room/preview-config.test.mjs`: 11 PASS。未入力templateのCLI実行はexit 1で生成拒否・SQL出力なし。4難度・整数・重複・本番指定拒否・SQL文字列escape・ROLLBACK・報酬enabled=falseを検証した。

SQL251/260/262の列名と生成先を照合。生成コードSHA256 `b4469b0fbe2bd07804b0cce94453741897761cb18b86f5b4166ea31dea7712d7`。製品src/migration未変更のため全体build/typeは再実行していない。生成SQLのPostgreSQL実行は未検証。

親がGitHub固定SHAのSQL254 `get_active_raids`→`rotate_daily_raids` とGameContextの起動呼出し、RaidTabのRoom追加表示を照合。Room有効化・Cron停止だけで旧生成を停止できるとは扱わない。

## 次工程

旧生成/respawnと旧新規開始へ独立停止guardを追加し、Room公開時の旧UIを置換する。旧開始済みReplayの確定・復帰、発行済みPresent受取は維持する。停止前後・旧確定/新Roomの回帰検証が必要。

実機用閾値/品目数量と独立Previewの実接続を固定し、DB→Edge→UIを接続する。Vercel管理接続と独立Preview DBの実接続は本工程で確認できていない。Supabase pluginの追加は求めず、接続可能な担当/環境へ手順を引き渡せる状態にした。

全体開発、実機確認可能Preview、実DB適用、実Cron・複数接続・実機受入は未完了。DB操作・Deploy・運用有効化を実施していない。
