# 2026-09-08 Preview 討伐受取の証跡

本文は `../../raid_room_preview_acceptance_report_20260908.md`。このディレクトリのSQLは自動適用用ではない。`qa-hp-apply.sql` は適用済み原文で、再実行しない。`environment-audit.sql` は読み取り専用。

| 証跡 | 内容 |
|---|---|
| coordination.json | 変更枠・解放連絡 |
| deployment.json / edge-and-functions.json / shared-alias-check.json | 配信SHA・URL・Edge v7・共用関数・共有alias |
| live-before-and-apply.json / qa-hp-* | HP変更前後、実行SQL、台帳・ファイルハッシュ |
| battles.json | 追加8戦の開始要求・Edge確定応答 |
| ui-rescue-success-claim.json | 救援PresentのUI受取成功。同期待ち中に自動操作がtimeoutした履歴を含む |
| ui-rescue-clear-claim.json / ui-rescue-clear-receipt.png | 救援ユーザーの討伐Present受取・獲得画面 |
| ui-rescue-presents.json / ui-rescue-presents-after.png | 両Present受取後の再読込。対象行なし |
| ui-host-presents.json / ui-normal-presents.json | 主催者・通常参加者の討伐Present受取 |
| ui-rescue-recovery-first.json / ui-*-result-*.png | 復帰表示。初回の自動操作の応答待ち不足による重複表示を含む。件数はfinal-rewards.jsonの台帳が正本 |
| final-rewards.json / duplicate-claims.json | 全4件CLAIMED、復帰全11件ack、救援両Present再受取拒否・所持数不変 |
| cleared-replay-* | 討伐後の同Replay再送、DB行不変 |
| positive-boundary-fixture.json / positive-boundary-results.json | 実定義・実QA戦闘データを複製したローカルの正閾値3ケース |
| environment-audit.json / preservation-checks.json | Cron・既存19ユーザー・失効Room保持、SQL UTF-8/LF、復帰修正保持 |
| validation/ | 型/build/Room110/UI74/既存戦闘5スクリプトの出力 |
| changed-files.txt | 前報告9ebb1ee以降の変更ファイル一覧 |

正閾値検証の再現は、Repository rootで `npm install --prefix outputs/raid-test-runtime --no-save @electric-sql/pglite@0.5.8` の後、`node scripts/raid-room/verify-positive-clear-boundary.mjs`。ローカルのみで実DBへ接続しない。実UIの受取・戦闘・適用SQLは完了済みであり、再現目的で再実行しない。

スクリーンショットには専用QAの表示名等を含む。認証セッション・秘密鍵は含めない。SWRダミーPresentの表示は既存共通UI課題として本文に記録済み。
