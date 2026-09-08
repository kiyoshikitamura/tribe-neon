# RAID-A-15
TASK ID: RAID-A-15
OWNER: raid_a_phase15
PRIORITY: P1
STATUS: VALIDATED
SCOPE: SQL261新規とphase15_server.mdのみ。既存Raid日次/Season個人Guildランキング集計・順位報酬の新規生成を停止。API互換の空/retired応答で旧clientを安全に扱う。共有日次/Season処理はRaid分だけ停止、他カテゴリの経路を保持。既存data/Present/権利削除なし。関数一覧と影響をC親へ早期通知。
DO NOT TOUCH: 他担当・戦闘式・毒・報酬数量・実DB・Deploy・Room運用有効化。Gitは親のみ。
DEPENDENCIES: 52e2de76e1810cdf39ffa77f71d558fbee40cffb / 第14工程VALIDATED / 今回のランキング廃止承認。
ACCEPTANCE CRITERIA: レイド順位と順位報酬の新規生成を停止、製品導線撤去。Room貢献/参加者・他ランキング・発行済みPresentを保持。
VALIDATION: 限定SQL/画面回帰、親全体型/build。実DB/実機と区別。
EXPECTED OUTPUT: ProtocolのCompletion Report・変更ファイル・検証・限界。
BRANCH: codex/raid-room-rescue-20260908
COMMIT: 親統合
BLOCKERS: 討伐報酬実装・数値投入は別工程。

PARENT REVIEW: 2026-09-08 完了。SQL8/順位画面5/Room画面28/共通83/全体型/Mock build PASS。詳細 raid_room_phase15_integration.md。実DB/実機未実施。
