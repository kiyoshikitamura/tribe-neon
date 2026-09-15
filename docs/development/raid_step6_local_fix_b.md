# RAID STEP6 LOCAL FIX B

基準: 648a513038284cfbcb65d3cf3a74ce02872cc9c4。子commitなし。外部操作なし。

## 原因と実装
通常開始の表示overrideは現在のbriefing由来だった一方、再読込復帰ではoverrideがなく、presenterの既定背景へ戻っていた。両経路とも確定済みReplayの保存情報から背景を確定する。

- useBattle.ts: resolve-battleの取得済み結果を優先。mode/roomId/raidInstanceIdを照合し、保存raidVariantId/baseIdから背景を解決する。追加取得不要の既存payloadを再利用。
- raidReplayBackground.ts: receiptに保存contextがある場合はそれを使用。既知payloadがない場合のみ本人とReplay IDで4列を単件取得し、id/mode/source_reference_id/roomIdを照合。7エリアは現canonicalへ対応。未知variant、別Room、不正identity、失敗は中立背景。現在のoverrideや日次対象へfallbackしない。読取期限1.5秒を過ぎても中立で継続。
- Supabase全体の巨大構造型比較を避け必要read callbackを明示adapterとして渡す。背景以外の戦闘計算、開始資格、消費、Result、ack、帰還処理は変更しない。

## 今回実行した検証

`RAID_TEST_RUNTIME_DIR=<既存raid-test-runtime> node tests/raid-room/run-use-battle-room-tests.mjs`: 27 / 27 PASS。通常保存背景、再読込同Replay、既存receipt再利用、resolve結果再利用、未知/不一致/失敗中立、1.5秒期限、開始重複防止、ack失敗保持/成功同Room帰還、既存非Roomを含む。最終log: outputs/b-local-replay-tests-final.log。

`node scripts/raid-step6-local-fixes/b-background-visual.mjs`: PASS。親が読み取った実保存official_contextを使う。通常経路用resolve応答は同metadataのローカル写像、再読込用は保存row fixture。実BattleMatchupPresentationをrenderし、通常/再読込backgroundImage一致、渋谷画像、未知中立、390x600横はみ出しなしを確認。人物画像は背景切分のため省略した局所fixtureであり、実配信全体操作とは区別する。

## 画面証跡

保存先 docs/development/evidence/raid-step6-local-fixes/:
- b-replay-normal-390x600.png
- b-replay-reload-390x600.png
- b-replay-unknown-390x600.png
- b-background-visual.json
- saved-replay-metadata.json（親read-only取得）

通常と未知を目視。通常は渋谷看板・街路の画像と既存gradientを確認し、未知では特定エリアを描かない。これは背景の局所確認であり画面全体のビジュアル受入完了ではない。

## 未完了/範囲

実配信変更は行っていない。実機上の同Replay通常/再読込再確認は親の後続判断。GameContext等共有部品の変更不要。ローカルserver/browserは終了済み。
