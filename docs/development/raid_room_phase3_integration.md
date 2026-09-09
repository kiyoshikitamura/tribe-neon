# Raid 第3工程 親統合記録

2026-09-08。基準commit: `5c441cd3eb4277fd37bcc2f739650c499965985b`。
この記録はRoom参照経路の完了であり、新レイド全体の完了・実環境への適用を意味しない。

## 成果

- A: Room/参加台帳、認証付き一覧・詳細・参加者RPC。現行HP・確定ログ・所属の正本を参照。
- B: 実RPC呼出しadapterと既存Room画面への接続コンポーネント。参加/報酬Authority未接続を成功扱いしない。
- C: Migration本体をローカルPGliteで実行し、SQL返却値をadapterへ通す検証。
- 親: 全体ソースをgit checkoutし、部分検証では漏れていたTesting LibraryのdevDependency登録を修正。package-lockも同期。

## 最終検証

|確認|結果|範囲|
|---|---|---|
|`node --experimental-strip-types --test tests/raid-room/*.test.mjs`|43 PASS|既存共通34＋新adapter9|
|`RAID_TEST_RUNTIME_DIR=... node tests/db/raid-room-read-projection-run.mjs`|18 PASS|SQL/SQL応答接続9＋adapter9。上行とadapter9は重複|
|`npm run typecheck`|PASS|実GameContextを含むRepository全体。stubなし|
|`NEXT_PUBLIC_APP_ENV=development NEXT_PUBLIC_USE_MOCK_DB=true npm run build`|PASS|Next全体build、型検証、全ページ生成。実DB接続なし|
|`node scripts/verify_raid_room_local_qa.mjs`|PASS|上記buildの `/qa/raid-room` HTTP200・実RoomコンポーネントSSR|
|ブラウザ描画・実機|未検証|Chromium取得がtimeout。HTTP/SSRやJSDOMの成功で代替しない|
|Preview/Production適用|未実施|DB・Edge・配信設定の変更なし|

接続情報を設定しない初回buildは認証callbackのprerenderで停止した。既存の開発用Mock設定を明示して再実行したものであり、本番接続設定の検証ではない。

## 完了通知

PR #27のコミット更新を契機とする完了通知を有効化。親がTask ContractとRelease Boardへ検証済み状態を記録してからpushする。通知にはタスクID・完了内容・検証結果・未完了点を含める。既報タスクと同じ状態の重複通知を避ける。端末へのプッシュ配送は未検証。

## 次工程

Room生成/参加確定/戦闘・救援・報酬/既存ランキング切替は残る。今回追加した参照可能範囲は公開準備段階の制限であり、最終公開仕様のFIXではない。
生成処理に入る前に、確定資料で未確認のRoom上限10/10/10/5の集計単位を親が確認する。バランスの網羅的な再検討や監査の再開は行わない。
