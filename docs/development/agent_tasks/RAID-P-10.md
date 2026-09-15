# RAID-P-10 — 期限定期処理・未確定戦闘復帰
TASK ID: RAID-P-10
OWNER: parent
PRIORITY: P1
STATUS: VALIDATED
SCOPE: 契約、release_board、親レビュー、統合検証、残仕様資料照合、PR更新。
DO NOT TOUCH: 他担当ファイル、既存Battle Formula/毒/マスター、報酬・ランキング方針、新規Gameplay FIX、実DB/Deploy/運用有効化。Gitは親のみ。
DEPENDENCIES: 23ce8cf7ee165196851443f4831759d4ac77b11a、第9工程VALIDATED、specs/raid_room_rescue_v1.md。
ACCEPTANCE CRITERIA: 期限到達のみTIMEOUT、終了HP/撃破不変。既存確定関数を再利用。再読込で同request/Replayを使用し追加消費なし。保存データはユーザー別に分離しサーバーが正本。作成/開始flagfalse維持。実DB/実機未検証と明記。
VALIDATION: PGlite実SQL、実hook/保存/境界/権限、共通回帰、全体型/build。Cron登録の模擬検証と実Cron稼働を区別。
EXPECTED OUTPUT: Protocol準拠日本語Completion Report、変更ファイル、検証結果、残件。
BRANCH: codex/raid-room-rescue-20260908
COMMIT: 本契約を含むPR headへ親が統合
BLOCKERS: 救援/報酬/ランキング方針/実DB・実機は別残件。独立範囲を継続する。

親レビュー・機械検証完了。判定範囲と限界は ../raid_room_phase10_integration.md。子自己報告は実施時点の記録として残す。
