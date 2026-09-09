# Raid第10工程 C検証記録

2026-09-08。基準PR head `23ce8cf7ee165196851443f4831759d4ac77b11a` へ第10工程差分を加えた作業treeを検証。C自己検証は以下PASS。親レビュー・全体型/buildの結果は親統合記録を参照し、自己検証だけでVALIDATED/Human PASSとしない。

## 実行と結果

|対象|結果|実体と境界|
|---|---|---|
|`tests/db/raid-room-recovery-run.mjs`|13件PASS|PGlite 0.5.8 / PostgreSQL18.3 WASMで実migration250〜257、既存実validateと3triggerを実行|
|`node --experimental-strip-types --test tests/raid-room/*.test.mjs`|71件PASS|第9工程63件＋pending/recovery8件。以下hook13件とは別|
|`tests/raid-room/run-use-battle-room-tests.mjs`|13件PASS|実useBattle/attempt/pendingをbundleしReact renderHook実行。通信・表示ステータス・マスターはdouble|

DB runnerとhook runnerは `RAID_TEST_RUNTIME_DIR=/workspace/scratch/be0ce4e059a1/raid-typecheck-runtime` を付けて実行。外部DB URL/資格情報は使用していない。Mock全体build・型・既存画面操作の最終結果は親が記録する。

## SQLの確認範囲

- 本人requestの未開始null、null引数拒否、保存receipt一致、参照副作用なし。別userへ漏らさず匿名拒否。
- 開始運用flag false・期限後でも既存receipt取得。Replay Room metadata不一致と保存player snapshot改変を23514で拒否。
- 期限前batch0、期限到達でTIMEOUT_FAILUREのみ、HP保持。再送時は終了時刻・台帳不変。
- 撃破済みRoomと非Roomはbatch対象外。limit2で3件を2＋1件に分割、無効limit拒否、公開ロール実行拒否。
- batchで先に期限終了した開始済みReplayはrawを保存しapplied0。
- Cron schema/functionsは登録契約用double。毎分100件のjobが1件登録され、登録DO再実行でも重複しないことだけを検証。pg_cron workerの実稼働ではない。

依存Auth/Main編成/Snapshot生成/既存報酬関数等には第9工程と同じfixtureを使用。戦闘公式全体や現行マスターの妥当性をこのfixtureで判定しない。多接続のFOR UPDATE SKIP LOCKED競合は未検証。

## 保存と実hookの確認範囲

pending domain8件はuser別キー・固定入力・同requestだけの削除・別入力上書き防止・破損拒否・write/readback失敗時start0・receipt優先・nullだけ同payload再送・参照エラー時再送なしを確認。

実hook13件は旧5件の回帰に加え、unmount/remount後に本人receiptから同Replay確定（追加start0）、開始通信不明時の元request/編成再送、保存失敗時start/resolve/互換session0、別user隔離、同時復帰呼出し一本化、receipt待機中user変更時の旧応答破棄、互換session既存再利用を確認。既存reloadケースで保存receiptの古いRPを適用せず現在RPC値を同期することと復帰成功後の別クエスト復帰による表示上書き抑止も確認。現在RP参照エラーとthrowでは表示値を保持し、確定Replayを再開始しないことも確認。jsdom localStorageを使用する。物理端末の再起動・ブラウザStorage制限・実Auth切替のE2Eではない。

開始throw/quotaのconsole warningは意図した異常系。Node MODULE_TYPELESS_PACKAGE_JSON警告は失敗ではない。

## 検証対象SHA256

|ファイル|SHA256|
|---|---|
|SQL257|`e3d7564a67642daafd60e8fa042d72eb882b6b095f8e2b2addd50871cd65338c`|
|raidRoomBattlePending.ts|`f55995a4419e4b80e398ccfe5e3dfeddbbed12445cd15262724553b35a40cab9`|
|raidRoomBattleAttempt.ts|`60af29c109d6c78c74bd415a85825efc91b3d53b80eb76b220dcf9fb9382edb4`|
|useBattle.ts|`3732b2b6940ccc10af6de24542722387d0a20251b42950d8ca3f272f5a4f074a`|

## 未完了

実DB・実Cron・多接続競合・実Edge HTTP・実機の復帰操作、救援/報酬/ランキング切替、全体開発完了は未確認。本工程では実DB適用、運用flag有効化、Deploy、Git操作を行っていない。
