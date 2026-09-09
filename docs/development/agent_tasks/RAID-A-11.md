# RAID-A-11 — サーバーからの戦闘復帰・未開始要求取消
TASK ID: RAID-A-11
OWNER: raid_a_phase11
PRIORITY: P1
STATUS: VALIDATED
SCOPE: SQL258のみ。未確認開始台帳一覧list_raid_room_battle_recoveries_v1(p_limit int default20)→json配列[{requestId,roomId,payload:{p_room_id,p_character_ids,p_tactic,p_request_id},receipt}]、本人のみ/古い順/最大100。開始台帳にrecovery_acknowledged_atを追加し、acknowledge_raid_room_battle_recovery_v1(p_request_id uuid)は本人かつFINALIZEDのみ冪等ack。cancel_raid_room_battle_request_v1(p_request_id uuid)はusers行lockで開始と直列化し、既存開始があれば{status:started,receipt}、なければprivate取消台帳へtombstoneを記録し{status:cancelled}。既存start_raid_room_battle_v1はuserlock直後に取消を拒否する以外の既存挙動を維持。Snapshot/報酬変更なし。API文書phase11_server。
DO NOT TOUCH: 他担当、Battle Formula/毒/マスター、未確認救援/報酬/ranking仕様FIX、実DB/Deploy/運用設定有効化。Gitは親のみ。
DEPENDENCIES: 8947a77714f1f9ee80e955aebfe4d2e348f0c3e0、第10工程VALIDATED。
ACCEPTANCE CRITERIA: server記録から本人の同Replay復帰、未確認一覧の自動新規出撃なし。cancelは未開始requestのみ封鎖、開始済みを取消/返金/再消費しない。遅い開始でも取消済みrequestは消費不可。ackは表示確認用で戦闘/経済結果変更なし。運用false維持。
VALIDATION: 実PGlite SQL/取消順序/権限/ack、actualhook/保存消失/再送/旧回帰、全体型/build。実DB/多接続/実機と区別。
EXPECTED OUTPUT: 日本語Protocol Completion Report、変更一覧・検証・限界。
BRANCH: codex/raid-room-rescue-20260908
COMMIT: 本契約を含むPR headへ親が統合
BLOCKERS: 救援/報酬/ランキングの未確認構造条件は別途扱い、本工程の独立実装を継続する。

親レビュー・機械検証完了。範囲・限界は ../raid_room_phase11_integration.md。Human PASSではない。
