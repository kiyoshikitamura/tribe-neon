# RAID-C-15
TASK ID: RAID-C-15
OWNER: raid_c_phase15
PRIORITY: P1
STATUS: VALIDATED
SCOPE: testsのSQL261停止検証・Reactレイドカテゴリ撤去回帰とphase15_validation.md専有。A/Bと契約調整。旧Raid順位報酬なし、他カテゴリ保持、既存Present維持を検証。src/SQL製品変更禁止。
DO NOT TOUCH: 他担当・戦闘式・毒・報酬数量・実DB・Deploy・Room運用有効化。Gitは親のみ。
DEPENDENCIES: 52e2de76e1810cdf39ffa77f71d558fbee40cffb / 第14工程VALIDATED / 今回のランキング廃止承認。
ACCEPTANCE CRITERIA: レイド順位と順位報酬の新規生成を停止、製品導線撤去。Room貢献/参加者・他ランキング・発行済みPresentを保持。
VALIDATION: 限定SQL/画面回帰、親全体型/build。実DB/実機と区別。
EXPECTED OUTPUT: ProtocolのCompletion Report・変更ファイル・検証・限界。
BRANCH: codex/raid-room-rescue-20260908
COMMIT: 親統合
BLOCKERS: 討伐報酬実装・数値投入は別工程。

PARENT REVIEW: 2026-09-08 完了。SQL8/順位画面5/Room画面28/共通83/全体型/Mock build PASS。詳細 raid_room_phase15_integration.md。実DB/実機未実施。
