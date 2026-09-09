# RAID-A-19

TASK ID: RAID-A-19
OWNER: raid_a_phase19
PRIORITY: P1
STATUS: VALIDATED
SCOPE: tests/db/raid-room-integrated* と docs/development/raid_room_phase19_db.md
DO NOT TOUCH: 実DB/Deploy/merge/運用設定、Battle式・正本Replay・報酬数量、担当外ファイル。
DEPENDENCIES: 基準5243b287f3e3261bd587a736cabc70af528f9dc7。A/B独立、CはB依存。
ACCEPTANCE CRITERIA: PGliteで実SQL250〜263を同一fixtureに適用。旧停止下のRoom作成→参加/救援→戦闘確定→討伐/救援Present→実claim、旧開始済み確定/新規拒否、ランキング停止との共存。fixture不足は明記、製品migration変更は親へ報告。
VALIDATION: 対象機械検証と親diffレビュー。実環境の代替としない。
EXPECTED OUTPUT: コード/日本語証跡とprotocol形式Completion Report。親確認前はIMPLEMENTED。
BRANCH: codex/raid-room-rescue-20260908
COMMIT: 本文書を含む第19工程統合commit
BLOCKERS: なし。実Preview接続/設定値未投入は別工程。


PARENT REVIEW: 2026-09-08。担当差分/保護範囲レビュー、SQL統合6/通知13/切替3/Room28/戦闘hook17、全体型・Mock build PASS。実DB/実機未実施。raid_room_phase19_integration.md参照。
