# RAID-P-03
TASK ID: RAID-P-03
OWNER: このチャット（親）
PRIORITY: P1
STATUS: VALIDATED
SCOPE: package.json/package-lock.jsonの不足devDependency修正、scripts/verify_raid_room_local_qa.mjs、親統合記録、Task Contract/Release Board/PRの更新、完了通知設定。
DO NOT TOUCH: 既存戦闘/報酬/認証Authority、Production/Preview設定・データ。
DEPENDENCIES: A/B/C-03成果と各Validation。親のgit checkout上で全体検証する。
ACCEPTANCE CRITERIA: 全体型検証・Mock buildとQA SSRが成立。結果と未実施範囲を区別し、PR更新後の完了通知を設定する。
VALIDATION: docs/development/raid_room_phase3_integration.md参照。
EXPECTED OUTPUT: 親レビューした同一差分をPR #27へ記録。
BRANCH: codex/raid-room-rescue-20260908
COMMIT: 基準5c441cd3eb4277fd37bcc2f739650c499965985b、成果SHAはPR head参照。
BLOCKERS: 本範囲なし。ブラウザ描画、実DB適用、生成/参加確定は後続工程。
