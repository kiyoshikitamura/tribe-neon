# RAID-A-10 — 期限定期処理・未確定戦闘復帰
TASK ID: RAID-A-10
OWNER: raid_a_phase10
PRIORITY: P1
STATUS: VALIDATED
SCOPE: 00257 migrationのみ: 期限終了のbounded batchと既存Cron方式に沿う定期登録、本人request_idから開始receiptを再取得する読取RPC get_raid_room_battle_start_receipt_v1(p_request_id uuid)。RPCはauthenticated本人のみ、service台帳を検証し保存response返却、未存在null、運用flag/期限とは独立。新規開始/再確定しない。API契約文書raid_room_phase10_server.md。
DO NOT TOUCH: 他担当ファイル、既存Battle Formula/毒/マスター、報酬・ランキング方針、新規Gameplay FIX、実DB/Deploy/運用有効化。Gitは親のみ。
DEPENDENCIES: 23ce8cf7ee165196851443f4831759d4ac77b11a、第9工程VALIDATED、specs/raid_room_rescue_v1.md。
ACCEPTANCE CRITERIA: 期限到達のみTIMEOUT、終了HP/撃破不変。既存確定関数を再利用。再読込で同request/Replayを使用し追加消費なし。保存データはユーザー別に分離しサーバーが正本。作成/開始flagfalse維持。実DB/実機未検証と明記。
VALIDATION: PGlite実SQL、実hook/保存/境界/権限、共通回帰、全体型/build。Cron登録の模擬検証と実Cron稼働を区別。
EXPECTED OUTPUT: Protocol準拠日本語Completion Report、変更ファイル、検証結果、残件。
BRANCH: codex/raid-room-rescue-20260908
COMMIT: 本契約を含むPR headへ親が統合
BLOCKERS: 救援/報酬/ランキング方針/実DB・実機は別残件。独立範囲を継続する。

親レビュー・機械検証完了。判定範囲と限界は ../raid_room_phase10_integration.md。子自己報告は実施時点の記録として残す。
