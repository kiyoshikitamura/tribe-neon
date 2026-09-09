# RAID-C-08 — 公開参加と戦闘開始準備
TASK ID: RAID-C-08
OWNER: raid_c_phase8
PRIORITY: P1
STATUS: VALIDATED
SCOPE: tests/db/raid-room-entry-* とphase8_validation.md。00250〜255実SQLに最小依存fixtureを接続。公開参照/匿名拒否/Lv5/参加Main下限/満員/冪等/終了/消費0、開始flagfalse無変更/実Snapshot下限/初回無料RP1/同request再送/別payload拒否/本人/実編成invalid等を検証。全実DB/Auth/多接続と区別。
DO NOT TOUCH: 担当外、既存マスター、実DB適用、Deploy、運用有効化、独断仕様FIX。Git操作は親のみ。
DEPENDENCIES: b9a59714ac90ef4ef5e6304bf5e683f4a7c7e285、第7工程VALIDATED、今回3条件承認。
ACCEPTANCE CRITERIA: 参照/参加と戦闘開始のAuthority分離。旧非Roomを維持し再送二重消費なし。確定/報酬未接続を成功扱いしない。
VALIDATION: 実SQLと関連domain/Reactテスト、親レビュー/全体build。実機とは別。
EXPECTED OUTPUT: 日本語Completion Reportと未完了点。
BRANCH: codex/raid-room-rescue-20260908
COMMIT: 本契約とphase8 integrationを含むPR head
BLOCKERS: 新Room確定と旧日次trigger集計分離前は開始設定falseを維持。救援/報酬は未実装。

親レビュー・機械検証完了。根拠raid_room_phase8_integration.md。実DB・実機・新Room確定/報酬は未完了。
