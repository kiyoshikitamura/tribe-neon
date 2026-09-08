# Room有効化前の残接続

2026-09-08。第9工程の親が既存呼出しを確認した記録。全DB監査や切替完了の判定ではない。Room作成・開始の設定はfalseを維持する。

## 既存集計との境界

新Roomの個人貢献は既存 `raid_damage_logs` / `raid_instance_user_progress` を再利用する。次の読者は新旧の対象条件を別途接続する必要がある。

|読者|Repository根拠|残作業|
|---|---|---|
|シーズン個人・Guildランキング参照|00228 `get_raid_season_rankings`|期間内の全Instanceログを集計するため、新Roomの対象方針を適用する|
|シーズン報酬|00229 `finalize_raid_season_rewards`|順位とGuild報酬対象者の双方へ対象方針を適用する|
|日次ランキング報酬|00234 日次確定内のRAID_PERSONAL集計|旧参加記録を持つユーザーのRoomログも合算され得る。参加記録triggerのRoom除外だけではこの合算は解消しない|
|Guild紹介・詳細の直近7日貢献|00186 `get_recommended_guilds`、00204 `get_public_guild_detail`|新Room貢献と所属表示の扱いを接続する|

旧日次Instanceの `raid_day_key` に対し、新Roomは `ROOM:<Instance UUID>` を使用する。日次キーに限定した旧ランキングと、日時で全ログを集計する上表を混同しない。

第9工程では確定時に直接発火する旧日次報酬・Guild経験値・日次ランキング参加triggerを分離する。上表のランキング切替・報酬方針まで確定したという意味ではない。過去ログの再計算・遡及付与は行わない。

## 提供までの残作業

- 新Edgeは旧レイドでも `get_raid_battle_route_v1` を呼ぶため、00256までのDB適用確認を先に行ってからEdgeを反映する。DB未適用で新Edgeだけ配信すると旧レイドの確定も失敗する。PRのUI自動配信とEdge反映は別工程。
- 救援の公開先・依頼権限・帰属時点を仕様へ対応させ、Activity / Guild ChatからRoomへ接続する。
- 救援成功のAND条件と報酬資格・品目を接続し、Present発行・受取を通す。
- 開始済み旧戦闘、Room終了処理の定期実行、新旧ランキングを含む切替手順を整える。
- 独立Preview DBへの適用、実Auth・複数接続・複数ユーザーの戦闘からPresentまでを検証し、実機確認へ渡す。

バランス値は変更可能なマスターで調整する。HP導出研究をこれらの実装の開始条件にしない。
