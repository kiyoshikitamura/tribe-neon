# RAID-A-16
TASK ID: RAID-A-16
OWNER: raid_a_phase16
PRIORITY: P1
STATUS: VALIDATED
SCOPE: SQL262新規とphase16_server.md専有。討伐報酬のprivate設定/閾値/台帳/自動Present/本人read/確定triggerを実装。SQL260救援と同じ30日期限を実装前提として明記。既存finalization_result lateFinalization=falseの信頼済みRoom戦闘を集計し、撃破打を含める。raw累積>閾値 AND CLEAR、本人Room1回、参加経路不問。値null/無効/品目emptyを既定。APIをB/Cへ先に共有。
DO NOT TOUCH: 他担当・実DB・Deploy・運用有効化・毒/戦闘式・他機能。Gitは親のみ。
DEPENDENCIES: d63264081ca3e65bfe4f6c55eec1f5bd9d626f81 / Phase15 VALIDATED。
ACCEPTANCE CRITERIA: ACTIVE期間本人累積rawが設定値を超過＋CLEARで本人Room1回。lateFinalization除外。救援既存条件不変、未設定は発行なし。
VALIDATION: 境界/再送/権限/既存Present/画面回帰、親型/build。実DB/実機と区別。
EXPECTED OUTPUT: Protocol Completion Report、変更ファイル・検証・限界。
BRANCH: codex/raid-room-rescue-20260908
COMMIT: 親統合
BLOCKERS: 値/品目数量は未投入。自動Present30日期限は救援と共通の実装前提、承認済み数値と混同しない。

PARENT REVIEW: 2026-09-08 完了。SQL10/討伐画面4/既存Room画面28/共通86(83+adapter3)/全体型/Mock build PASS。詳細raid_room_phase16_integration.md。実DB/実機未実施。
