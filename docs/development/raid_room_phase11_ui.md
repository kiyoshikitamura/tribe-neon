# 第11工程 — 保存消失時のRoom戦闘復帰と未開始要求取消

状態: IMPLEMENTED。親レビュー・機械検証は親統合記録を参照。実DB・実機未確認。

## 復帰経路

- 通常の起動は、有効な本人local pendingがあれば第10工程のreceipt再取得を継続する。receiptがない場合だけ、保存済みの同じ要求ID・編成・戦術を再送する。
- localがない場合、製品Room UIが有効な起動時、またはRoom出撃準備操作時に `list_raid_room_battle_recoveries_v1(p_limit:1)` を読む。古い未確認記録1件のpayloadとreceiptで同じReplayを復帰する。この経路からstart RPCは呼ばない。
- local破損時もserver一覧にある記録のみ復帰可能。一覧が空なら破損を通知し、新規出撃を開始しない。未知の要求IDを安全に捨てたと見なさない。
- 運用フラグが無効でlocalもない通常起動は追加RPCなしで旧session復帰を継続する。新RPC未配置により無関係な旧ユーザーの起動を止めない。
- 同時復帰を1回に束ね、アカウント変更後の遅延応答は表示・確定・取消・local変更へ流さない。

## ACKとローカル保存

戦闘確定済みかつ互換 `battle_sessions` 保存成功後、`acknowledge_raid_room_battle_recovery_v1` を呼ぶ。statusとrequestId一致を確認してからlocal pendingを削除する。ACK失敗でも確定結果は表示でき、local/server未確認記録を保持する。ACKは表示確認用メタデータであり、報酬やHPを変更しない。

## 取消導線

本人の有効なlocal pendingの復帰でreceiptを取得できない場合、共通ConfirmDialogを表示する。「未開始の出撃を取消」で `cancel_raid_room_battle_request_v1` を呼ぶ。

- `started`: 取消・返金・別出撃を行わず、返された同じreceiptから復帰する。
- `cancelled`: 同じlocal要求のみ削除し、次の操作へ戻る。
- 通信失敗・未知応答: localを保持してエラー表示、再試行可能。
- 戻る操作: 保存要求を維持する。

取消中は共通GlobalInteractionBlockerと処理中guardを使う。ダイアログに待機文字を加えない。

## 限界

- 破損localの未知要求を自動削除しない。server保存済み戦闘を表示しても、その破損記録の恒久解除まで完了扱いにしない。
- 複数の未確認戦闘は1件ずつ復帰する。新しい出撃操作の前にも一覧を確認する。
- Room UI無効・local消失の通常起動では一覧を読まない（運用無効時の旧起動互換を優先）。運用有効化・DB配置後がserver復帰経路の実運用対象。
- 多端末・実ブラウザの保存制約、実DB・実機は未検証。
