# Raid 第11工程 検証記録

2026-09-08。担当 RAID-C-11。実DB接続・Deploy・運用設定変更なし。

## 検証対象

- SQL258: `d852c8acefa220fe4bc72210b2ff362e2b9d8ae12e82c2732e3229c7a32193de`
- useBattle: `5121fd7c330d1b565acf59289f443a2a2cb1551c619cf46ee3f52993143a6968`
- raidRoomBattleAttempt: `e343c10da275041a5ef5de094fac79b15e30b0f9d1f552a2045ba4f721a13775`

## 機械検証

|対象|結果|範囲|
|---|---|---|
|PGlite 実SQL250〜258|11/11 PASS|取消→遅い開始拒否、開始→取消はreceipt返却、本人分離、未確定ack拒否、確定後ack冪等、未ack一覧とlimit、匿名/null拒否、運用false/期限後の既存receipt、取消台帳の直接権限、非取消requestの通常再送、破損receipt拒否|
|actual useBattle|17/17 PASS|前工程13件＋local消失時server receipt復帰(start0)、空一覧と旧boot、ack失敗時local保持、取消通信失敗時の保持・再試行後started/cancelledの分岐|

SQLはPGlite 0.5.8 / PostgreSQL 18.3 WASM。既存fixtureのAuth・Main総合力・Snapshot生成・回復・旧副作用・Cronはdouble。SQL258の一覧/取消/ack/開始本体は実行。単一接続で開始と取消の両順序を確認し、多接続競合試験とは区別する。

Reactは実useBattle/実attemptを実行し、通信・マスター・音・画像等はdouble。実ブラウザ/HTTP Edge/実機での受入ではない。既存13件を含む17件であり別加算しない。意図的な通信throw/ack失敗のconsole.warnは検証条件によるもの。

一覧順序はcreated_atとrequest_id。同一transaction fixtureではcreated_atが同値になるためrequest UUID順を固定した。初回の順序期待不一致はfixture側を修正した。

## 再現コマンド

```sh
RAID_TEST_RUNTIME_DIR=/workspace/scratch/be0ce4e059a1/raid-typecheck-runtime node tests/db/raid-room-recovery-controls-run.mjs
RAID_TEST_RUNTIME_DIR=/workspace/scratch/be0ce4e059a1/raid-typecheck-runtime node tests/raid-room/run-use-battle-room-tests.mjs
```

全体型検証・build・共通回帰と親レビューの判定は親統合記録に記載する。救援・報酬・ランキング・実DB・実Cron・実機の完了を示さない。
