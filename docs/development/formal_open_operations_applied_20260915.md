# 正式オープン運用反映 2026-09-15

ユーザー課金実機受入: 問題なしとの報告を受領。
本番 ktpolnkyyfkowxdmijww のみ。一般MAINTENANCE維持、Preview変更なし。

## 適用済み（再実行しない）

- GVG_PREP_20260904: progress_end_at=2026-09-15 20:33:02.765894 JST、claim_deadline=2026-10-15 20:33:02.765894 JST。既存close_gvg_preparation_missions_v1を実行。get_active_mission_eventsのprogress_open/is_progress_active=false、受取可の結果を確認。これに連動してHomeの準備ミッション/ギルド総合力ランキング2バナーを取り下げ。
- プレオープンGUILD_POWER: 旧2099年境界をメンテ開始時刻へ確定。8ギルドsnapshot、1位New Aにguild_preopen_2026_rank_1を正規finalizeで1件付与。既存finalization audit、受領者snapshot、通知を作成。ROLLBACKリハーサル後にCOMMIT。既存順位ロジックを変更しない。
- 旧8月POWER: 承認済みの報酬なし終了を実行。参照なし確認、資産/総合力fingerprint保持。
- 20260915133606_formal_open_next_day_season_reservation: 旧PVPをメンテ開始境界で正規報酬確定・reconcile・CLOSED。PVP/POWER/GUILD_POWERをPREPARINGで予約。新期間は2026-09-16 00:00以上〜2026-10-01 00:00未満 JST。
- 開始前に旧PVPが復活しない分岐を追加。開始前のPVPは55000で停止。メンテナンス解除時にもこの待機を維持し、0時以降に自動開始。
- POWER/GUILD_POWER monthly runs2件登録。開始cronと月次runner cron接続済み。現在時刻ではまだ未開始。実時間境界での実行成功は未観測。
- 20260915133631_upcoming_ranking_seasons_display: 認証済み閲覧用get_upcoming_ranking_seasons_v1追加。実DBで3予約の開始終了日時返却確認。
- news id5/release_key=formal-release-update-20260915: config/formal_release_announcement_20260915.jsonの指定全文を追加。既存4記事の全列不変検査付き。上書きなし。

## 検証

- Season予約・旧PVP不復活・開始境界のROLLBACK検証PASS。
- バナー判定のイベント終了、30日受取、3予約、cron active、限定紋章1件を読み戻し確認。
- ランキングUIは次回予定を既存成績と別表示する。
- 課金実機PASSはユーザー報告。今回の作業で実購入を追加実行していない。
- PvP実競合Exactly-once検証は未確定のまま。Preview誤付与cleanupはリリースGATE外。

一般公開/メンテナンス解除は実行していない。



## 22:42 JST 追加指示による開始日時変更（この項目が優先）

ユーザーは「現段階から新シーズンにして問題ない」と明示承認。
PVP/POWER/GUILD_POWERの既存予約3行を2026-09-15 22:42:53.182277 JST開始のACTIVEに変更した。
終了は2026-10-01 00:00 JST（9月30日いっぱい）を維持。Season IDとmonthly runsは保持。
翌日開始cronを解除し、月次終了runnerの翌日までの待機条件を除去。
正式ニュースは開始日の一文のみ「9月15日から9月30日まで」に修正。他記事は保持。
一般メンテナンスは未解除。開始前PvPの待機条件は該当PREPARING行がなくなったため適用されない。
