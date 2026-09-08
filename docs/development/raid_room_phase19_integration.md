# 第19工程 親統合記録

2026-09-08。基準 `5243b287f3e3261bd587a736cabc70af528f9dc7`。RAID-A/B/C/P-19は親レビュー・機械検証完了（VALIDATED）。実機・実Preview・全体開発完了ではない。

## 変更

SQL250〜263を同じPGlite schemaへ順次適用する統合検証を追加。旧生成/新規開始停止とレイド順位廃止の下で、Room作成→Activity/Guild Chat救援→参加→戦闘確定→救援/討伐Present→既存claimまで接続する。旧開始済み確定・既存順位Present受取、終了後確定/期限終了も確認。製品Migrationは変更していない。

開催通知がbootstrapまで古い問題を、既存Room一覧/詳細/作成応答の共有trackerへの反映で修正。account別hookで保持し、期限で通知を解除する。戦闘からRaidへ戻る既存イベントでは一覧/詳細を再取得する。全体bootstrap追加・恒常pollingなし。通信失敗は最後の成功状態を既知期限まで保持。

親レビューで「作成開始→後発空一覧→作成成功」の順序では通知が消える点を検出。作成成功を完了順で保護し、同Roomの新しい終了詳細は古い作成receiptで戻さないよう修正・再検証した。通常read同士は開始順で古い応答の上書きを抑止する。

Guild紹介/公開詳細は新Roomログを既に含むことを限定照合し、参照仕様の変更を加えていない。戦闘時所属のrawを使い、討伐報酬の開催中限定貢献とは異なる。詳細はraid_room_phase19_guild_projection.md。

## 親再検証

|対象|結果|
|---|---|
|実SQL250〜263の統合シナリオ|6件PASS|
|実通知tracker/hook/ConnectedBrowser|13件PASS|
|既存画面切替|3件PASS|
|既存Room画面|28件PASS|
|実useBattle開始/確定/復帰|17件PASS|
|全体TypeScript（build前後）|PASS|
|Room flag trueのMock全体build|PASS|
|git diff --check|PASS|

アプリ依存は既存package-lock固定。テストruntimeは `/workspace/scratch/3f215bc02a8a/raid18-test-runtime`。DB/通知の実行方法とdouble範囲はphase19_db/validation資料を参照。全体buildは `NEXT_PUBLIC_APP_ENV=preview NEXT_PUBLIC_USE_MOCK_DB=true NEXT_PUBLIC_RAID_ROOM_UI_ENABLED=true npm run build`、型は `npm run typecheck`。

tracker SHA256: `64b9f0fb751de43172dcdfa845ceb39d512c97499e4229f92fcfd3e9f28052cc`。
統合SQLテスト SHA256: `4b5f49f4cd99ba523a0662268c5c36b68d2e95c2bd2d87f95b9cc15363baba8e`。

## 境界・残件

統合fixtureで14本の実Migrationと既存validator/claimを使用したが、戦闘結果は固定JSON、周辺Snapshot/回復等はdouble。実engine→Edge→実DB→実ブラウザの一連検証ではない。実DB更新・Deploy・merge・運用設定変更は行っていない。

第18工程の「SQL255〜262と263の同時適用テスト未実施」は今回のfixture範囲で解消。Room作成・一覧更新後の通知遅延も修正。画面外で他人が作成/討伐した変化は次回参照時に反映し、常時リアルタイムではない。

独立Previewの接続先/配信SHA固定、報酬値/成功閾値投入、実Cron・多接続競合、実Auth/実機受入、運用切替は残る。数値の妥当性を承認したものではない。
