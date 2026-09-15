# RAID-C-20

TASK ID: RAID-C-20
OWNER: raid_c_phase20
PRIORITY: P1
STATUS: VALIDATED
SCOPE: src/utils/mock/mockRpc.ts のget_my_raid_contribution_v1ハンドラ追加、tests/raid-room/mock-contribution.test.mjs、docs/development/raid_room_phase20_mock.md
DO NOT TOUCH: 他mock処理・製品SQL・Authority・マスター・DB操作・Deploy・Git操作
DEPENDENCIES: SQL261本人貢献RPC、B20が旧順位期待を本人貢献へ変更
ACCEPTANCE CRITERIA: SQL261の返却形式/本人認証/Instance絞込み/raw合算を再現。順位を復活させない。他ユーザー混入/未認証を検証。
VALIDATION: 既存Mock検証の実装方法に従う対象テスト、親の型検証。
EXPECTED OUTPUT: 実装・対象テスト・Protocol形式報告
BRANCH: codex/raid-room-rescue-20260908
COMMIT: 親統合時に確定
BLOCKERS: 実ブラウザ実行環境は確認中

親レビュー: SQL261との対応確認、本人貢献Mock6件・既存順位撤去React5件・全体型検証PASS。実ブラウザ合格ではない。
