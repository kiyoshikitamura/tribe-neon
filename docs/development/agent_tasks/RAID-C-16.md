# RAID-C-16
TASK ID: RAID-C-16
OWNER: raid_c_phase16
PRIORITY: P1
STATUS: VALIDATED
SCOPE: tests/db/raid-clear-reward*、tests/raid-room/clear-reward* とrunner、phase16_validation.md専有。実SQL262のstrict閾値/撃破打/期限/後確定除外/重複/他人/未設定/既存claim/救援共存を検証。製品src SQL変更禁止。
DO NOT TOUCH: 他担当・実DB・Deploy・運用有効化・毒/戦闘式・他機能。Gitは親のみ。
DEPENDENCIES: d63264081ca3e65bfe4f6c55eec1f5bd9d626f81 / Phase15 VALIDATED。
ACCEPTANCE CRITERIA: ACTIVE期間本人累積rawが設定値を超過＋CLEARで本人Room1回。lateFinalization除外。救援既存条件不変、未設定は発行なし。
VALIDATION: 境界/再送/権限/既存Present/画面回帰、親型/build。実DB/実機と区別。
EXPECTED OUTPUT: Protocol Completion Report、変更ファイル・検証・限界。
BRANCH: codex/raid-room-rescue-20260908
COMMIT: 親統合
BLOCKERS: 値/品目数量は未投入。自動Present30日期限は救援と共通の実装前提、承認済み数値と混同しない。

PARENT REVIEW: 2026-09-08 完了。SQL10/討伐画面4/既存Room画面28/共通86(83+adapter3)/全体型/Mock build PASS。詳細raid_room_phase16_integration.md。実DB/実機未実施。
