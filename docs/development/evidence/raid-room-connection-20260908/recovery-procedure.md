# Preview接続後の停止・復旧

対象は `sufvuqdnqohpfzkwxohq` のみ。この手順は未実行。

1. KPI・演出側と変更枠を再確保し、接続先、配信SHA、適用台帳、Cron一覧を保存する。
2. 新規受付停止が必要なら、単一トランザクションで `raid_room_creation_settings`・`raid_room_battle_settings`・`raid_room_rescue_settings` の `enabled=false` と、別の一意な変更ID・SQLハッシュを適用台帳に記録する。既存14本、適用済み設定SQLは再投入しない。
3. 開始済みRoom ReplayはEdge v7で確定する。応答不明はReplay・要求台帳を別接続で読み、同一要求の状態を確定してから扱う。新しい要求IDで代替送信しない。
4. 未確定Replayが0件と確認できた後に、必要なら別トランザクションで `raid_legacy_settings.enabled=true` と復旧台帳を記録する。旧Raidと新Raidの新規開始を同時に有効にしない。
5. 既存Roomの失効と報酬の確定を継続するため、期限Cron job13と報酬設定は当面保持する。全Room終端・未確定0件を確認してから停止の要否を判断する。既存6Cronは変更しない。
6. UIを戻す場合も専用の固定URLを使い、共有aliasは変更しない。`99c534b` には復帰時に再生が始まらない不具合があるため復旧先にしない。Room履歴が存在する間、Edge v6へ戻さない。

作成済みQAユーザー・Guild・Room・Present・適用台帳は証跡として保持する。行削除、HP変更、正式バランスマスター変更はこの停止手順に含めない。

24時間確認Room: `3972a461-b45f-4b02-8142-75f294461ae3`、期限 2026-09-09 19:40:55 JST。監視 `raid-preview-24` が19:45に読み取り確認する。正常失効後に監視を停止する。
