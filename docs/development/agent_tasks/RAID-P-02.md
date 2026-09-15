# RAID-P-02
TASK ID: RAID-P-02
OWNER: このチャット（親）
PRIORITY: P1
STATUS: VALIDATED
SCOPE: src/app/qa/raid-room/、本工程のTask Contract・Release Board、PR #27の統合管理。
DO NOT TOUCH: 既存本番Raid経路、DB/Edge/報酬/戦闘Authority、共通GameContext、環境設定。
DEPENDENCIES: A-02のcontroller、B-02の画面、C-02の対象検証。既存isQaHarnessAvailableガードを再利用。
ACCEPTANCE CRITERIA: 開発QAルートからサンプル通信で一覧/詳細/参加後の参照受渡しを確認可能。QAは実戦闘・報酬付与を行わないことを表示。実DB接続済み・実機PASSとはしない。
VALIDATION: 子成果の範囲・差分レビュー、対象TypeScript/操作テスト、QA fixture型整合。全体build・ブラウザ描画・実機は別記録。
EXPECTED OUTPUT: /qa/raid-room のコード、PRと進行表の更新。
BRANCH: codex/raid-room-rescue-20260908
COMMIT: 基準47b9213429a2611d8706cdc5cf28427d8b7ba07c、成果はPRのhead SHA参照。
BLOCKERS: この環境では本ゲーム全体checkoutと配信環境の接続がなく、QA URLは未発行。

親レビュー: 担当範囲と差分を確認。限定TypeScript・対象操作テストを確認。実API/DB・Next全体build・実機は未検証。
