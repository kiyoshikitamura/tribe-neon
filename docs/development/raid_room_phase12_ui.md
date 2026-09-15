# 第12工程 — 救援UI・製品接続

STATUS: IMPLEMENTED（親レビュー・統合検証待ち）

- Room詳細の救援表示は `get_raid_room_rescue_status_v1` の権限・回数・運用・戦数・貢献を表示する。ブラウザで救援成功や報酬資格を決定しない。
- 作成者の依頼ボタンは一つ。Activityと依頼時Guildへ両投稿するサーバーRPCを呼び、各公開先3回を表示。公開先選択UIは設けない。
- 送信失敗時は同じUUIDを保持して再送。確定receipt取得後は送信済みと表示し、次の操作は新しい依頼。送信成功後の参照失敗では送信済み表示を保持する。
- HomeのActivity履歴およびモバイル／PC Guild Chatに救援リンクを追加。Guild system投稿でもリンクを表示し、author_idで所属メンバーの表示を補完する。
- GameContextで救援リンク対象を持ち、RaidTabで認証ユーザーと遷移revisionをkeyに接続画面を生成。リンク参照RPCのRoom IDを使いcontrollerへ救援IDを渡す。Room詳細表示だけでは参加登録せず、参加操作で救援専用登録RPCを呼ぶ。
- 通常参加登録済みをクライアントで救援へ変更しない。参加台帳・帰属はサーバー正本。Room終了・参加条件は既存controller/briefingの扱いを維持。
- 製品フラグ `NEXT_PUBLIC_RAID_ROOM_UI_ENABLED` はfalseのまま。救援リンクCTA・製品Room接続とも有効化しない。
- 再読込を跨ぐ救援依頼UUIDの保存は本工程では追加していない。通信失敗から同一画面での再試行は同一UUID。参照失敗時は更新可能。

## 検証
子Cによるadapter 4件・React追加2件を含む22件PASS報告あり。最終型・build・統合判定は親が記録する。実DB・ブラウザ実機・外部投稿は実施していない。
