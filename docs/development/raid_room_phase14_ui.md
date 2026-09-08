# 第14工程 UI: 救援依頼の再読込復帰

TASK: RAID-B-14
STATUS: IMPLEMENTED（親レビュー・C検証待ち）

## 変更

- `raidRoomRescuePending.ts` にユーザー・Roomごとの未確認request ID保存を追加。保存内容はversion、userId、roomId、requestIdのみ。送付結果の正本は既存RPC receipt。
- 新規依頼はlocalStorageへの保存と同一内容の読戻しが成功してから送信する。保存不可・不正データは送信せずエラーを表示する。
- 通信不明、画面を閉じる、再読込の後も同じrequest IDを利用する。成功receiptが得られ、保存削除を確認できた後にだけ新規依頼へ戻す。
- 未確認依頼には「救援依頼の送信結果を確認」を表示する。Room終了・上限・運用無効でも同request IDの再送が可能。既存receiptはSQL259で条件判定前に返され、未記録要求は通常のサーバー条件で拒否される。
- Account/RoomごとにPanelを再マウントし、旧画面の遅延応答を新画面へ反映しない。終了時に操作blockを解放する。旧要求の保存は保持され、元Account/Roomで結果確認できる。
- RaidTabから認証user IDをConnectedBrowser経由で受け渡す。IDがない場合は依頼送信不可。

## API

- `readRaidRoomRescuePending(userId, roomId, storage?)`: 保存記録またはnull。不正な記録は例外。
- `saveRaidRoomRescuePending(userId, roomId, requestId, storage?)`: 別要求の上書きを拒否。保存・読戻しの不一致は例外。
- `clearRaidRoomRescuePending(userId, roomId, requestId, storage?)`: 同要求のみ削除。別要求・削除失敗は例外。
- `raidRoomRescuePendingKey(userId, roomId)`: 各IDをencodeURIComponentした専用キー。

## 検証・限界

対象単体・React検証はC、統合型検証・Mock buildは親が実施して記録する。

- localStorageのみで複数タブの同時新規要求を完全排他する保証はない。
- 端末保存を手動削除した場合の過去request ID探索、別端末での未確認要求発見は含まない。
- サーバーが未記録の要求を確定拒否した場合も成功receiptがない限りIDを保持する。取消や新要求への自動置換は追加していない。
- 実DB・実機未検証。SQL・戦闘・報酬値・運用フラグ変更なし。
