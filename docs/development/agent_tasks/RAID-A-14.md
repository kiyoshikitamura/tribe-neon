# RAID-A-14
TASK ID: RAID-A-14
OWNER: raid_a_phase14
PRIORITY: P1
STATUS: VALIDATED
SCOPE: 既存spec/product_decisions内の新旧ランキング・主催者/通常参加者報酬の根拠だけを読み取り照合。docs/development/raid_room_phase14_policy_evidence.mdのみ作成。既存監査の再実施やSQL変更は禁止。確定と旧仕様と未提示を区別。
DO NOT TOUCH: 他担当・戦闘式・毒・報酬数値・実DB・Deploy・運用フラグ。Gitは親のみ。
DEPENDENCIES: bb6782c5303fedcea1570f603538811b236f03b6、第13工程VALIDATED。
ACCEPTANCE CRITERIA: 新Roomで承認済みの根拠と旧仕様の根拠を分離し、未提示のランキング/別報酬条件を独断で確定しない。参照パスを示す。
VALIDATION: 親が引用元と結論の対応・調査範囲をレビュー。実装テストの完了とは扱わない。
EXPECTED OUTPUT: ProtocolのCompletion Report。
BRANCH: codex/raid-room-rescue-20260908
COMMIT: 親統合
BLOCKERS: 未提示ランキング/別報酬方針は独断決定しない。

PARENT REVIEW: 2026-09-08、根拠文書/限定実装をレビュー済み。共通83・React28・全体型/Mock build PASS。Aは文書レビュー。実DB/実機未検証。詳細raid_room_phase14_integration.md。
