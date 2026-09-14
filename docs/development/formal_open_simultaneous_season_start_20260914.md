# 正式OPEN・第1Season同時開始候補

## 確定仕様

- PvP / 個人総合力 / Guild総合力は正式OPENと同時開始。
- 終了は2026-10-01 00:00 JST（排他的境界）。
- 正式OPENの厳密な開始日時は運用時に確定した `p_open_at` を使用する。固定9/16開始・PvP休止期間は廃止。
- 売上KPI集計は公開後対応であり、本変更のGateではない。

## 実装候補（未適用）

既存未適用 `20260914112648_formal_open_pvp_scheduled_transition.sql` を改訂。
`start_formal_open_seasons_v1(p_open_at)` はservice_role専用。Migrationは関数を定義するだけで、Season終了・開始・日付予約・cron変更を一切実行しない。

操作停止を確認した正式OPEN時の運用呼出しで、旧PvP境界をp_open_atに合わせ、既存のcontinuity確認→報酬finalize→reconcile→CLOSEDを維持した後、同一トランザクションで3カテゴリをACTIVEにする。POWER/GUILD_POWERは `monthly_power_season_runs` に登録し、新報酬Authorityに接続する。既存advance RPC自体は変更しない。

途中失敗は全rollback。成功後の同一引数再送は再配布・再resetしない。報酬候補Migrationの `monthly_power_season_runs` が呼出し前に必要。

## まだ実行できない条件

PreviewのREAD ONLY監査で、旧8月POWERがACTIVE、PREOPEN Guild PowerがACTIVE（2099年末まで延長）、finalization auditなしを確認。候補関数はこれを勝手にCLOSEDにせず明示拒否する。

- 旧8月POWERの終了処理は、旧イベントの受入Authority・当時報酬の有無を確認して別工程で解消する。今回の新Season報酬を遡及転用しない。
- PREOPEN Guild Powerは既存v2 finalizer、限定Emblem、正式cutoffに基づいて1位報酬とauditを先に確定する。状態だけCLOSEDにしてもauditなしなら拒否。
- 時刻を遡って境界にする場合は、既存PvP continuity/reconcileが成立する必要がある。運用停止・既存入力の整合確認を前提とする。
- 新月次報酬の名誉報酬ID、Guild資格の未決点は報酬担当の管理対象。本候補は推測で埋めない。

## 検証

`tests/db/formal-open-pvp-schedule.test.mjs` を旧予約テストから同時開始テストへ改訂。PGliteでPASS。

確認: 必須時刻/null/未来時刻拒否、旧POWER拒否、PREOPEN auditなし拒否、報酬内部の故意失敗でSeason/登録/呼出し記録rollback、3本同時開始・同一終了、PvP呼出し順序、再送no-op、開始境界で既存advanceが新PvPを返す、無関係RAID保持、service_role専用。

時計・PvP報酬内部・旧Season終了はテストfixture。実DBでSeason切替を実行したという証拠ではない。Production反映なし、Preview DBへの恒久適用なし。

## 親側の後続適用
親側がPreviewへ関数・Master定義のみ恒久適用済み。実versionと適用後確認はformal_open_resume_progress_20260914.md参照。本文の未適用は子担当引渡し時点の記録。Season切替・配布は未実行。
