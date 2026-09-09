# RAID-P-07 — 旧経路分離・接続契約
TASK ID: RAID-P-07
OWNER: parent
PRIORITY: P1
STATUS: VALIDATED
SCOPE: 親レビュー、関連検証、PR統合、構造条件の出典照合。
DO NOT TOUCH: 担当外ファイル、既存マスター、実DB適用、Deploy、運用フラグ有効化、独断の仕様FIX。Git操作は親のみ。
DEPENDENCIES: 第6工程VALIDATED、24fca1d58bf8ffab2687da8a70959b2f5670f34f。親がSQL変更をAへ排他的に割当。
ACCEPTANCE CRITERIA: Roomが旧処理へ流れないことと既存非Room経路維持。Bは接続設計の確認のみで参加/戦闘実装と扱わない。
VALIDATION: 実SQLの関連機械検証と親レビュー。実DB・多接続・実機とは区別。
EXPECTED OUTPUT: ProtocolのCompletion Report、日本語根拠、未完了点。
BRANCH: codex/raid-room-rescue-20260908
COMMIT: 本契約とphase7 integrationを含むPR head
BLOCKERS: 公開範囲、Mainと出撃総合力の判定、期限後確定は既存根拠照合後に必要な判断を残す。分離自体の阻害にはしない。

親レビュー完了。A/C/Pは実SQL14件PASSを確認。Bは接続設計文書のレビューであり機能実装・機械テスト完了ではない。詳細はraid_room_phase7_integration.md。
