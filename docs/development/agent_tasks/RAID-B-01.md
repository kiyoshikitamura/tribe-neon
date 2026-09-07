# RAID-B-01
TASK ID: RAID-B-01
OWNER: raid_b_readiness
PRIORITY: P1
STATUS: READY
SCOPE: src/domain/raidRoomPresentation.ts
Aの型から難度名・参加制限/推奨表示・参加不可理由を作る純粋な表示関数。後続Room UIが利用可能な境界を作る。
DO NOT TOUCH: 上記以外のファイル、既存戦闘/Replay/報酬/マスター、Migration、認証、GameContext、package/lock/CI、環境設定、Production。GitHub書込みは親が統合する。
DEPENDENCIES: .agents/AGENTS.md、release_board.md、codex_parallel_protocol.md、specs/raid_room_rescue_v1.mdを読む。B/CはAの型確定後に接続。Cは先行して独立の期待値を用意可。
ACCEPTANCE CRITERIA: 初級制限なし・中級16万・上級20万・超級24万を正しく区別。未知理由を参加可扱いしない。
VALIDATION: 対象TypeScript検証・対象テスト。未実施をPASSとしない。型検証不能時は具体的制約を報告する。
EXPECTED OUTPUT: 指定範囲の実ファイルとProtocol準拠Completion Report。ファイルは /workspace/scratch/be0ce4e059a1/raid-room-work/ 内のRepository相対パスに作成。親が差分レビュー後GitHubへ記録。共通ファイルは変更しない。
BRANCH: codex/raid-room-rescue-20260908（親管理、Workerは共有refを更新しない）
COMMIT: 基準 b08e396e657615afd6dfddc05bbec37d21561a25、成果SHAは親記録
BLOCKERS: 全機能の構造未確認はspec参照。今回の純粋関数/DTO/検証準備の開始を妨げない。Production/Preview環境操作は今回対象外。
