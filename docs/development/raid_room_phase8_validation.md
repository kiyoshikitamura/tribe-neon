# 第8工程 SQL検証記録

- 担当: RAID-C-08
- 日付: 2026-09-08
- 子担当状態: IMPLEMENTED（親レビュー前。全体VALIDATED判定は親統合記録を参照）
- 対象: 実SQL 00250〜00255を本文変更なしでPGliteへ適用。
- 00255 SHA256: `6252976872faad09609c40184bf93933cf0aa9a801b3e649dd4692c1b142f710`
- 環境: PGlite 0.5.8 / PostgreSQL 18.3 WASM。外部DB接続なし。

## 実行

```sh
RAID_TEST_RUNTIME_DIR=/workspace/scratch/be0ce4e059a1/raid-typecheck-runtime node tests/db/raid-room-entry-run.mjs
```

`tests/db/raid-room-entry.test.mjs`: **22件 PASS / FAIL 0**。

|検証群|結果|
|---|---|
|開始設定false・副作用なし|PASS|
|他ユーザーの一覧・詳細・briefing参照、参加者一覧は未参加拒否|PASS|
|匿名・anon権限拒否、設定とreceiptの直接アクセス拒否|PASS|
|本人参加・同Room再送・ユーザー全行の資産不変|PASS|
|参加Main総合力16万/20万/24万の直前・一致・直後|各難度PASS|
|Lv4・プロフィール欠落拒否、Lv5許可|PASS|
|主催者含む20名定員と21人目拒否|PASS|
|期限経過・HP0で新規参加拒否|PASS|
|初回無料・以後RP1、5敵Snapshot、Room metadata保存|PASS|
|同request再送receipt一致・消費不変・別有効戦術payload拒否|PASS|
|実Snapshot総合力16万/20万/24万の直前・一致・直後|各難度PASS|
|未参加開始拒否、別人同requestは本人参加後に別Replay|PASS|
|空・重複・非所有編成、Snapshot型/欠損/負/小数/HP0/上限超過/重複ID拒否|PASS|
|RP不足と終了後新規開始で資産・Replay不変|PASS|
|期限後の同requestは保存receiptのみ返す|PASS|

## 検出・修正

初回に開始正常系が`invalid enemy formation`で失敗。00255の敵構築ループが未挿入であることをAへ報告し、既存210の構築経路を復元した版で全件再実行PASS。

## Fixtureと限界

既存read/lifecycle/creation/legacy-isolation fixtureへentry fixtureを追加。AuthはJWT claim設定値のdouble、Main総合力はテーブル値を返すdouble。実出撃Snapshot生成は所有IDを限定してテーブルJSONを返すdoubleであり、実成長・装備計算や本来の所有判定の網羅検証ではない。RP回復は呼出記録double。実SQL内の消費・receipt・参加判定・敵構築・投影を実行している。

外側rollback内で複数APIを試すため、生成直後のspawn時刻をtransaction開始の1秒前、期限をその24時間後へ調整し、実際の別transaction呼出しを模す。RP初期9は資産不変確認用の既存fixture値でゲーム設定ではない。

実DB全schema・全trigger、実Auth/JWT、実編成生成公式、複数接続同時競合、Edge確定、救援・報酬・実機確認は未検証。00254の旧経路回帰は前工程の別試験であり、本22件へ加算していない。開始設定の有効化は一時fixture transaction内のみ。実環境の作成/開始を有効化していない。
