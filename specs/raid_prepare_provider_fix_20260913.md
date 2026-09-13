# Raid出撃準備 Provider修正 / 2026-09-13

## 原因

`RaidTab.checkRoomEntryResource` は `get_current_raid_attempt_state` 成功後に `setRaidFirstEntryFree` を呼びます。しかし `GameContext.Provider` の公開値にそのsetterが含まれておらず、`TypeError: setRaidFirstEntryFree is not a function` が発生します。呼出元の共通catchが「出撃準備を開けませんでした。もう一度お試しください。」へ変換します。

これはEncounterのCombat Snapshot欠落とは独立した原因です。Snapshotを補完しても準備エラーが残る事象と整合します。今回、実Providerの公開キーを使ったハンドラ検証で同じTypeErrorを再現しました。Live Browserでの再確認は未実施です。

## 修正

既存の `setRaidFirstEntryFree` をGameContextの公開値に追加します。既存state・RPC・権限・消費・報酬・戦闘開始処理は変更しません。

同じ準備経路を利用する通常Raid Roomにも適用されます。Encounter固有の分岐追加ではありません。

## 検証

`scripts/raid-room/verify-ticket-recovery.mjs` は、手書きuseGame fixtureの公開キーを実GameContext ProviderのASTから得たキーで制限します。未公開setterをmockだけが供給する従来の検出漏れを防ぎます。

- 修正前：実準備ハンドラで同じTypeErrorを再現。
- 修正後：RPあり、初回無料、RPなし、チケットなし、回復二重タップ、通信失敗の6ケースPASS。
- Typecheck：PASS。変更ファイルESLint：0 errors（既存warnings 183件）。
- Server transportとReact hooksはmockです。実チケット消費はありません。

## Codex受入

Combat Snapshot生成修正を含む統合候補を専用Previewへ配信し、Encounterと通常Roomの両方で「出撃準備」→編成確認→Battle開始を確認してください。RP・初回無料状態の同期、RP不足時の回復案内、二重開始防止も維持すること。

この修正単体はDB Migration不要です。Live DB変更・Vercel配信は実施していません。
