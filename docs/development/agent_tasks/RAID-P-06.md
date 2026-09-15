# RAID-P-06 — 親統合
TASK ID: RAID-P-06
OWNER: parent
PRIORITY: P1
STATUS: VALIDATED
SCOPE: API/範囲決定、親レビュー、型/全体buildと関連テスト、PR反映。参加・戦闘接続は残す。
DO NOT TOUCH: 本番・仕様独断の報酬変更
DEPENDENCIES: 第5工程VALIDATED、基準67070ed。ユーザーは作成追加費用なしの確認に進めてくださいと回答。
ACCEPTANCE CRITERIA: 指定処理と失敗・境界を実装検証。生成成功と戦闘開始成功を分ける。
VALIDATION: 関連テストと親全体型検証/build。実DB/Human PASSは別。
EXPECTED OUTPUT: 日本語Completion Reportと未完了点。
BRANCH: codex/raid-room-rescue-20260908
COMMIT: 本契約とphase6_integrationを含むPR head
BLOCKERS: 公開運用は旧開始/終了/報酬経路の分離・新戦闘接続前には有効化しない。


親レビュー・機械検証完了。根拠: raid_room_phase6_integration.md。公開運用・実DB・実機は未完了。
