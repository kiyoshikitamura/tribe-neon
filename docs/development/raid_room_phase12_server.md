# Raid第12工程 サーバー実装

状態: IMPLEMENTED（親レビュー・Cの機械検証結果は統合記録を参照）。実DB適用・Deploy・運用有効化なし。

## 範囲

`20260908000259_raid_room_rescue.sql` を追加。救援設定は初期false。作成・戦闘開始の既存設定も変更しない。

- 作成者が1回の要求で全体Activityと依頼時Guild Chatへ投稿する。未所属はActivityのみ。
- Room×公開先の上限は各3回。Guild移籍で回数をリセットしない。片方が満了なら他方の残りのみ投稿し、両方へ投稿できなければ拒否。
- user×request UUIDに成功応答を保存。同UUID・同Roomの再送は期限後・移籍後・設定停止後も保存応答を返す。別Roomへの再利用は拒否。
- Guild投稿は`is_system=true`、`user_id=NULL`、`author_id=作成者`。既存162 human response、186 Guild EXP、222 mission、249 KPIの除外条件を満たし、186のuser_id単位chatters集計にも混入させない。通常チャットRPCのcooldown・発言としての加算は呼び出さない。
- Activity既存5種類を維持し`RAID_HELP_REQUEST`を追加。`display_payload`は`roomId`、`rescueId`。Guild投稿は`board_posts.raid_rescue_id`を持つ。

## 公開RPC

すべてauthenticated専用、auth.uid必須。private台帳はRLS・全client roleへの直接アクセス禁止。

|RPC|引数|返却|
|---|---|---|
|request_raid_room_rescue_v1|p_room_id、p_request_id UUID|roomId、requestId、publications（rescueId/channel/guildId）、activityCount、guildCount、maxPerChannel|
|get_raid_room_rescue_status_v1|p_room_id UUID|roomId、isOwner、requestEnabled、両回数、maxPerChannel、viaRescue、finalizedBattles、contributionDamage、rescueGate|
|get_raid_room_rescue_v1|p_rescue_id UUID|rescueId、roomId、channel、guildId|
|join_raid_room_rescue_v1|p_rescue_id UUID|roomId、membershipStatus（joined/already_joined）、viaRescue|

Activityリンクは認証済み全員が参照可能。Guildリンクは現在そのGuildに所属するユーザーのみ参照・加入可能。リンク参照は終了後も可能だが、新規加入は既存Room登録条件で拒否する。

## 参加と貢献

加入は既存`register_raid_room_v1`を同じuser行ロック下で呼び出す。Main Formation総合力・Lv・定員・期限の検証を維持。新規登録が成功した場合だけ救援帰属を保存する。作成者・通常参加済みユーザーは救援へ昇格しない。別の救援リンクによる再登録でも最初の帰属を保持する。

貢献は参加時刻以後に確定した本人/Instance一致の`RAID_SERVER` ReplayとDamageログから算出。Contributionは既存raw_damageを使用し、appliedや毒を再定義しない。期限後の確定も既存の個人貢献保存に合わせて集計される。

`_raid_room_rescue_gate_v1`のAND判定を再利用。閾値未設定ならunknownを返し、候補値を確定扱いしない。資格・報酬台帳の作成、Present発行、ランキング集計変更は含まない。

## ロックと原子性

writerはREAD COMMITTED必須。設定FOR SHARE→user FOR UPDATE→既存boss/Roomロックの順序。依頼は同一transaction内で台帳・Activity・Guild投稿・成功応答を作成し、途中失敗は全てロールバックする。公開先のordinalはRoom/channel単位uniqueと1〜3制約を持つ。

実接続の同時競合、実機表示、実DB上の全trigger経路は未検証。CのPGliteはこの限界と区別する。
