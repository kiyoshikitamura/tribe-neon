# RAID-B-15
TASK ID: RAID-B-15
OWNER: raid_b_phase15
PRIORITY: P1
STATUS: VALIDATED
SCOPE: srcのRankingTab/RaidTabと関連レイド順位導線だけ撤去。RaidTabの本人貢献は順位RPC依存を外して既存progress/適切なreadで維持。Room参加者貢献は維持。旧ranking=raid遷移はレイド画面へ案内。共有GameContextが必要なら親へ排他相談。phase15_ui.md。SQL/tests禁止。
DO NOT TOUCH: 他担当・戦闘式・毒・報酬数量・実DB・Deploy・Room運用有効化。Gitは親のみ。
DEPENDENCIES: 52e2de76e1810cdf39ffa77f71d558fbee40cffb / 第14工程VALIDATED / 今回のランキング廃止承認。
ACCEPTANCE CRITERIA: レイド順位と順位報酬の新規生成を停止、製品導線撤去。Room貢献/参加者・他ランキング・発行済みPresentを保持。
VALIDATION: 限定SQL/画面回帰、親全体型/build。実DB/実機と区別。
EXPECTED OUTPUT: ProtocolのCompletion Report・変更ファイル・検証・限界。
BRANCH: codex/raid-room-rescue-20260908
COMMIT: 親統合
BLOCKERS: 討伐報酬実装・数値投入は別工程。

SCOPE追加（親承認）: GameContextのbootstrap Raid順位取得・旧ranking/raid遷移・関連管理導線のみB排他。rankingRewardPresentationの製品Raid順位報酬表示も必要最小で整理。既存canonical JSON master履歴は削除しない。

PARENT REVIEW: 2026-09-08 完了。SQL8/順位画面5/Room画面28/共通83/全体型/Mock build PASS。詳細 raid_room_phase15_integration.md。実DB/実機未実施。
