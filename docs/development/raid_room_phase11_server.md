# 第11工程 サーバー復帰管理

状態: IMPLEMENTED。SQL258を対象とする。実DB適用・運用設定の有効化は行っていない。

## API

全APIはauthenticatedのみ実行でき、auth.uid()の本人記録のみを扱う。運用開始フラグの無効時も取得・確認・未開始取消が可能。

|RPC|引数|返却|
|---|---|---|
|list_raid_room_battle_recoveries_v1|p_limit integer default 20（1〜100）|`[{requestId,roomId,payload:{p_room_id,p_character_ids,p_tactic,p_request_id},receipt}]`|
|acknowledge_raid_room_battle_recovery_v1|p_request_id uuid|`{status:"acknowledged",requestId}`|
|cancel_raid_room_battle_request_v1|p_request_id uuid|`{status:"started",receipt}` または `{status:"cancelled"}`|

一覧は開始台帳の未確認記録をcreated_at、request_idの昇順で返す。全行のreceiptを既存get_raid_room_battle_start_receipt_v1で検証し、別ReplayやSnapshot不一致を復帰へ渡さない。PENDINGとFINALIZEDの両方を含み、自動開始・自動確定は行わない。空一覧は`[]`。上限分の確認後に再取得すると次の未確認記録が得られる。

ACKは開始記録の行ロックを取り、本人の保存receipt整合性とReplayのFINALIZEDを検証する。recovery_acknowledged_atのみを初回更新し、再実行時の日時を維持する。未開始はP0002、未確定は23514。確認済みでも本人のreceipt取得APIから保存結果を失わない。戦闘状態・RP・HP・ログ・報酬・参加/Guild資格は変更しない。

取消はREAD COMMITTEDを要求し、startと同じusers行ロックを取得する。先に開始済みなら保存receiptを返し、取消も返金も行わない。未開始ならprivateのraid_room_battle_request_cancellationsへ(user_id,request_id)を冪等記録する。遅れて届いたstartは同じロック直後に取消台帳を確認して23514 `battle request cancelled`で拒否する。開始処理はSQL255の全文を保持し、この拒否だけを追加した。旧Raid開始・マスター・戦闘計算・運用設定を変更しない。

取消台帳はRLS有効、public/anon/authenticated/service_roleの直接権限をすべて剥奪している。取消は本人がこれから使わない要求IDを封鎖するための記録であり、別ユーザーの同じ要求IDを封鎖しない。保管期限や自動削除は設定していない（削除で遅延再送が再び開始可能になるため）。

## 導入時の限界

既存の開始台帳にも追加列はNULLとなるため、一覧の「未確認」はACKなしを意味する。第10工程以前のUIで閲覧済みかは判別できない。現在は運用無効で実Room未投入の前提であり、閲覧済みの推測やACKのBackfillは行わない。

## 検証範囲

C担当のPGlite実SQL検証と親レビューを待つ。実DBの多接続競合・実機・実Cronは本実装報告で検証済みと扱わない。
