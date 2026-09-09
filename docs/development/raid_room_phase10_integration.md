# 第10工程 親統合記録

基準SHA: `23ce8cf7ee165196851443f4831759d4ac77b11a`。2026-09-08。状態: VALIDATED（定義した実装範囲の親レビュー・機械検証完了。Human PASSではない）。

## 範囲

- A: 本人の開始receipt読取、期限到達Roomの有限件数処理、毎分Cron登録用Migration。
- B: 同一ユーザー・同一開始要求の再読込復帰。端末保存を戦闘結果やSnapshotの正本にしない。
- C: SQLの期限/権限/再実行と、実フックの再読込/保存失敗/既存戦闘回帰。
- P: 子の差分と実行結果をレビューし、全体検証後に判定する。

## 仕様と残件

24時間または撃破、期限前開始の期限後確定は既存確定仕様を適用。毎分の保守処理は受付期限を延長しない。参加/開始時には既存のサーバー期限判定が働く。

`specs/product_decisions.md`、`specs/spec_guild_gvg_raid.md`と新Room仕様を照合した。既存文書の旧シーズン累積/撃破/ランキング報酬を、そのまま新Roomの救援報酬資格へ流用しない。救援公開先・帰属時点・報酬資格とランキング接続の未確認事項は `specs/raid_room_rescue_v1.md` に残す。バランス値の研究を本工程の開始条件にしていない。

## 検証

親がSQL257、pending/attempt、useBattle変更、GameContextの復帰順、実テストを確認し再実行した。

|検証|結果|
|---|---|
|PGlite実SQL250〜257・期限/本人receipt/権限/再送|13件PASS|
|共通domain/controller/adapter/Edge route|71件PASS（pending8件を含む）|
|既存Room React操作|20件PASS|
|実useBattle・再読込・旧非Room回帰|13件PASS|
|全体Mock build|PASS、静的生成13ページ|
|最終全体TypeScript `tsc --noEmit`|PASS|
|`git diff --check`|PASS|

親レビューで、復帰済みRoomへの旧復帰の上書き、互換セッション再利用、アカウント切替後の遅い応答、保存receipt内の過去RPを現在表示へ流用する問題を修正・検証した。復帰後は既存 `get_current_raid_attempt_state` で現在値を同期し、参照失敗でも確定済みReplayを再開始しない。

SQL257 SHA256: `e3d7564a67642daafd60e8fa042d72eb882b6b095f8e2b2addd50871cd65338c`。
最終useBattle SHA256: `3732b2b6940ccc10af6de24542722387d0a20251b42950d8ca3f272f5a4f074a`。

実行コマンドと対象・fixture限界は [C検証記録](raid_room_phase10_validation.md)。PGliteのCron登録doubleは実Cronの稼働確認ではない。実hookは通信をdoubleにしたjsdomでのunmount/remount検証であり、実機E2Eではない。全体buildはMock設定で実行した。既知のnpm/Node警告と意図した通信失敗ログは失敗判定ではない。

## 運用

実DBへのMigration適用、実Cron稼働、Edge反映、運用設定の有効化、実機確認は行っていない。DB256が新Edgeの必須前提、DB257が今回の再読込復帰RPCの必須前提となる。既存PRのUI自動配信と手動のDB/Edge反映は別工程。

## 残る復帰条件

端末保存の消失・破損・別端末からのサーバー要求探索、receiptが未取得で開始を拒否された要求の安全な取消導線は未実装。保存を勝手に捨てて別要求へ切り替えず停止する。複数タブの互換セッションinsert一意性は未保証。詳細は [UI接続記録](raid_room_phase10_ui.md)。この限定を含め、再読込の全状況が解決したとは扱わない。

救援/報酬/ランキング切替・独立Previewの実DB/Edge接続・複数接続・実機は未完了。全体開発完了や実機確認可能な縦通しPreview到達ではない。
