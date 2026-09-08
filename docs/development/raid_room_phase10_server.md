# Raid第10工程 サーバー契約

RAID-A-10。基準は第9工程 `23ce8cf7ee165196851443f4831759d4ac77b11a`。
Migration `20260908000257_raid_room_recovery_and_expiry.sql` を追加する。実DB適用、Cron稼働確認、Deployは実施していない。

## 本人の開始receipt再取得

`get_raid_room_battle_start_receipt_v1(p_request_id uuid) returns jsonb`

- `authenticated` のみ実行可能。`auth.uid()` と `request_id` で開始台帳を参照する。他人の同じrequest IDは参照できない。
- 本人の記録がなければ `null`。未認証は `42501`、null request IDは `22023`。
- 本人のReplay、Room正本route、Room ID、tactic、responseのRoom/Replay IDとplayer/enemy Snapshotの一致を検証する。不整合はエラーとして扱い、別の戦闘へフォールバックしない。
- 成功時は保存したresponseをそのまま返す。キーは `room_id`, `replay_session_id`, `player_snapshot`, `enemy_snapshot`, `cost_type`, `cost`, `remaining_raid_points`, `guild_id_snapshot`。
- 開始・確定済みのどちらも参照でき、Roomの終了状態や作成／戦闘開始設定には依存しない。読取専用でRP回復・消費、戦闘開始、再確定、報酬発行を行わない。
- `remaining_raid_points` は開始当時の保存値。現在値としての再計算は行わない。
- `null` は参照時点で本人のcommitted receiptが見えない意味であり、直前の開始要求が失敗した証明ではない。クライアントの再送は同じrequest IDとpayloadを使用する。
- service_roleへの直接execute付与はしない。SECURITY DEFINER内部で既存service用route検証を呼ぶ。

## 期限終了batch

`finalize_expired_raid_rooms_v1(p_limit integer default 100) returns integer`

- service_roleのみ実行可能。null・0以下・1000超のlimitは `22023`。
- 入口の時刻を一度取得。Room台帳に紐付くBossのうち、`ACTIVE`、`outcome_finalized_at IS NULL`、期限が入口時刻以前の行のみを期限・Boss ID順に最大limit件選ぶ。
- Boss行を `FOR UPDATE SKIP LOCKED` で取得し、第9工程の `finalize_expired_raid_room_v1` を再利用。戦闘確定中の行は待たずに次回へ送り、既に討伐／期限確定した行は対象にしない。
- 返却整数は今回選択し単体finalizerを呼んだ件数。正常終了時に期限を確定し、HP・既確定討伐・ログ・RP・報酬は変更しない。繰り返し後は0件となる。
- batch中の例外は呼出し全体をロールバックする。異常を隠して次へ進める処理は入れない。
- 選択件数の上限を設ける実装であり、実DBの処理時間や複数接続競合の検証済みという意味ではない。

## Cron登録

既存Migration 229・234と同じ `cron.job` の名前照合 → 同名jobのunschedule → schedule方式を採用。

|項目|値|
|---|---|
|job名|`raid-room-expiry-minute`|
|周期|`* * * * *`（毎分）|
|command|`select public.finalize_expired_raid_rooms_v1(100);`|

周期とbatch件数は定期処理の実装値であり、24時間のゲーム仕様を変更しない。期限判定は既に一覧・参加・戦闘開始・確定でも行うため、Cronまでの待ち時間で参加可能時間は延長しない。100件超やロック中の行は次の実行で処理する。

既存pg_cron拡張がある前提で、未導入環境を黙ってスキップしない。Migrationを実DBへ適用するRelease工程でjob登録と稼働を確認する。PGliteにおけるCron登録APIの模擬検証は実Cron稼働の証明ではない。

関数は `create function` で追加する通常の一度適用するMigrationであり、Migration全体の繰り返し適用は想定しない。Cron登録ブロック単独は同名jobを置換し、重複登録を避ける。

## 未変更・残件

作成／戦闘開始設定falseを維持。Battle Formula、毒のraw集計、マスター、救援・報酬・ランキング方針は変更しない。第9工程のDB256-before-Edge順序は継続し、このreceipt参照を利用するクライアントにはDB257が必要。実DB適用・実Cron稼働・実機確認は別途必要。
