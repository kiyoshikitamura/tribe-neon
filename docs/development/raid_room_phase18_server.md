# 第18工程 旧Raid停止設定

2026-09-08 / RAID-A-18 / VALIDATED、親レビュー・機械検証完了。
基準 `f65e7c460d42bd1dcbc71411a6c0a602a49de015`。

追加: `supabase/migrations/20260908000263_raid_legacy_cutover.sql`。

## 動作

`raid_legacy_settings` のsingleton行に `enabled=true` を初期登録する。migration適用だけでは既存Raidを止めない。DB管理者がfalseにしたとき、以下4入口を停止する。設定行欠落も停止側として扱う。

|入口|停止時|継続時|
|---|---|---|
|`start_raid_battle`|認証確認後、SQLSTATE 55000。RP回復/消費、初回無料消費、Replay作成なし|SQL254と同じ|
|`get_active_raids`|認証確認後、空配列。rotate呼出しなし|SQL254と同じ|
|`rotate_daily_raids`|何もせず終了。旧日次生成/respawnなし|SQL254と同じ|
|`respawn_cleared_raid_slot`|null。Instance追加なし|SQL254と同じ|

旧 `finalize_raid_battle`、`finalize_expired_raid_instance`、既存Present・受取・報酬台帳は変更していない。開始済み旧Replayの確定は停止設定を読まない。Room用設定と別なので、旧停止によってRoomを自動で有効化しない。Raid順位報酬はSQL261による停止を維持する。

rotate停止時は同関数内の旧期限終了巡回も止まる。必要な旧期限確定は既存サービス専用 `finalize_expired_raid_instance` を用いる別の運用処理として扱い、旧生成再開で代用しない。開始済み戦闘の確定経路は維持される。

## 停止更新との競合

4入口は設定行を `FOR SHARE` で取得してから既存のuser/boss/advisory lockへ進む。先行開始/生成が設定共有lockを保持する場合、管理者の停止UPDATEはそのtransaction終了を待つ。停止commit後に設定を取得した呼出しはfalseを読み、新規開始/生成しない。既に成立した開始の取消やRP返却はしない。

設定変更はDB管理者が **この設定だけを更新する単独transaction** で実施する。users/boss/Replayを先にlockする管理transactionへ混在させない。待機timeout時は停止成立と報告せず、rollback後に確認する。アプリからの設定変更RPCは追加していない。

SQL254の現行呼出しでは、旧finalize → 旧期限確定 → 日次clear報酬であり、respawnを呼ばない。respawn_afterを設定するだけである。respawn呼出しはrotate内で、入口の設定共有lock取得後。従ってこの変更では既存確定へboss → 設定lockの逆順を持ち込まない。将来別のcallerを追加する際も設定lock先行を守る。

設定tableはRLSを有効化し、PUBLIC/anon/authenticated/service_roleのtable権限を撤去。入口RPCの認証/サービス境界はSQL254と同じ。運用停止のために公開側の権限を緩めない。

## 検証と限界

- 4関数について、追加した設定変数・guardを除くとSQL254の本体と文字列一致することをPythonで検証: 4件PASS。
- 全migrationのrotate/respawn呼出しを照合し、上記の呼出し順を確認。
- 実SQL機械検証はC担当、統合レビューは親担当の記録を参照。ここで実DB/実多接続/実機PASSとはしない。
- 実DB適用・設定falseへの変更・Deployなし。旧UI置換はB担当。Preview接続・報酬値・実機確認は別工程。
