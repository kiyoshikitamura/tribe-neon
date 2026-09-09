# 第18工程 UI切替

状態: VALIDATED。親レビュー・機械検証の確定記録は統合資料を参照する。

## 変更

- `NEXT_PUBLIC_RAID_ROOM_UI_ENABLED=true` のRaid画面は既存のRoom画面を表示し、旧共有Raidの一覧・挑戦・個人貢献・おすすめGuild表示を同時表示しない。
- Roomモードでは旧画面の初期取得・再取得を停止する。`get_active_raids`、旧選択Instanceの貢献取得、旧画面用おすすめGuild取得を呼ばない。旧画面用のRP・チケット取得も行わず、既存の全体RP同期・Room戦闘導線を維持する。
- bootstrapの開催確認は`loadRaidActivity`を経由する。Roomモードは既存の厳密なRPC adapterで`list_raid_rooms_v1`を全ページ参照し、active・HP正数・期限未来のRoomがある間を開催通知へ投影する。取得失敗時に旧一覧RPCへフォールバックしない。
- Roomの開催通知は旧戦闘用HP状態と分離する。取得済みRoomの最終期限で通知を消す。撃破などの変化は次のbootstrap同期で反映する。リアルタイム配信を追加したものではない。
- Room作成・一覧再読込そのものは全体bootstrapを呼ばないため、画面内Room表示とヘッダー通知の反映には差があり得る。他ユーザー撃破の通知反映も次回bootstrapまで遅れる。通知を参加資格や討伐判定に使用しない。新しい通知投影は取得完了時に現在の認証ユーザーを照合し、アカウント切替前の応答を破棄する。
- 旧一覧取得中と出撃準備中の表示を文字なしスピナーへ修正する。
- flagがfalseまたは未設定の場合は旧Raid画面と旧一覧RPC経路を維持する。
- Room救援リンク・出撃準備・Present遷移の既存callbackと未確定戦闘復帰を変更しない。既存Replay確定を変更しない。

## 境界

UIのflagは表示・参照先の切替であり、DBの旧生成・新規開始を停止するAuthorityではない。古いクライアントの防止には第18工程Aのサーバー側制御と適用手順が必要。実DB適用、運用flag変更、Deploy、実機確認は行っていない。

## 検証

子Bのdiffレビューでは変更範囲をRaidTab・GameContext・専用helperに限定し、戦闘式・useBattle・既存報酬台帳を変更していない。機械検証は子Cと親の担当。検証完了前にVALIDATEDや実機確認完了とは扱わない。
