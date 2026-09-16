# RAID-C-14
TASK ID: RAID-C-14
OWNER: raid_c_phase14
PRIORITY: P1
STATUS: VALIDATED
SCOPE: Bの救援依頼永続化をtests/raid-room/rescue-pending.test.mjsとbrowser.test.tsxで検証。再mount同要求、成功後次回新要求、保存失敗RPC0、別user/Room隔離、古い応答の混入防止。docs/development/raid_room_phase14_validation.md。src/SQL変更禁止。
DO NOT TOUCH: 他担当・戦闘式・毒・報酬数値・実DB・Deploy・運用フラグ。Gitは親のみ。
DEPENDENCIES: bb6782c5303fedcea1570f603538811b236f03b6、第13工程VALIDATED。
ACCEPTANCE CRITERIA: 通信再送を新しい救援依頼として数えない既存確定条件を再読込へ延長。既存仕様根拠と未提示を区別。
VALIDATION: 対象単体/Reactと親全体型/build。実DB/実機は別。
EXPECTED OUTPUT: ProtocolのCompletion Report。
BRANCH: codex/raid-room-rescue-20260908
COMMIT: 親統合
BLOCKERS: 未提示ランキング/別報酬方針は独断決定しない。

PARENT REVIEW: 2026-09-08、根拠文書/限定実装をレビュー済み。共通83・React28・全体型/Mock build PASS。Aは文書レビュー。実DB/実機未検証。詳細raid_room_phase14_integration.md。
