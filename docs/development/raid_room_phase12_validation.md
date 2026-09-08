# Raid第12工程 検証記録

2026-09-08。RAID-C-12の機械検証。親レビュー・統合の最終判定は別記録。

## 対象と方法

- SQL250〜259を一時PGliteへ適用。保存Replayの実validate関数と第9工程の3確定triggerもロード。
- social_activity_feedは161のDDL/権限、board_postsはinitial/66の必要列をfixtureへ再現。Auth、編成総合力、敵Snapshot等は既存fixture doubleで、実サービス全体の複製ではない。
- 外部DB接続・実データ変更・Deployなし。各SQLケースはtransaction rollback。
- Reactは実コンポーネント＋JSDOM。GameContextのみdouble、CSS描画・端末操作のHuman確認ではない。

## 実行

```sh
RAID_TEST_RUNTIME_DIR=/workspace/scratch/be0ce4e059a1/raid-typecheck-runtime node tests/db/raid-room-rescue-run.mjs
node --experimental-strip-types --test tests/raid-room/rescue.test.mjs tests/raid-room/client.test.mjs
RAID_TEST_RUNTIME_DIR=/workspace/scratch/be0ce4e059a1/raid-typecheck-runtime node tests/raid-room/run-browser-tests.mjs
```

## 検証範囲

- 両公開先へ各3回、4回目拒否、再送時の投稿/回数重複なし。
- 未所属Activityのみ、加入後Guild残枠、移籍しても回数保持・依頼時のGuildへ投稿。
- 作成者以外/匿名/運用false/期限終了を拒否。
- 救援リンク初参加のみ帰属。作成者と通常参加済みは昇格しない。
- Guildリンクの現所属確認、総合力159999拒否/160000許可と期限拒否。
- 実戦闘確定から戦数/Damageを取得、再確定で二重加算なし、Present未発行。
- 救援ANDの未設定と設定済み/CLEARの区別。
- adapter4件: RPC引数、応答Room/requestの整合、上限、エラー、Activityリンク抽出。
- controller新1件: 救援source選択時は救援登録へID保持、通常Roomへ切替後は通常登録へ戻る。
- React新2件: 失敗後同UUID再試行・ブロック解除、上限到達不可・サーバー貢献表示。既存20件と合わせ22件PASS。

## 制限

PGlite単一接続であり、実複数接続競合・実Auth/RLS全構成・実Chat副作用trigger・実Cron・実機は未検証。報酬発行、ランキング切替、運用有効化は対象外。全体型/ビルドと最終SQL結果は親統合記録を参照。

## 最終結果

SQL12件PASS（SQL259 SHA256 `4088d5f8c869ff8db3bd26faf95e3dfdf0250cd404ea2588e639b79397e7691f`）。adapter4件とcontroller既存13＋新1件PASS、React22件PASS。親から全体共通76件・React22件・useBattle17件・Mock build PASSの連絡あり（重複計上しない）。

検出事項: ACTIVEの未設定outcomeが救援gateへNULLで渡り、設定済みでもunknownとなる点をA/親へ報告。未撃破falseとして渡す修正を再検証。閾値未設定はunknown、設定済み未CLEARはnot_succeeded、CLEAR＋条件一致はsucceeded、ownerはnot_succeededを確認した。初回fixture不足avatar_urlとテストのSQLSTATE/status期待違いはテスト側修正。
