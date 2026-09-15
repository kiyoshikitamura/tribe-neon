# Raid第8工程 親統合記録

2026-09-08 JST。基準b9a59714ac90ef4ef5e6304bf5e683f4a7c7e285。RAID-A/B/C/P-08は親レビュー・機械検証完了（VALIDATED）。本記録を含むPR headが対象。

## 実装
- A-08: 全認証者向けRoom一覧・詳細、参加登録、事前情報、開始API。参加はMain Formation、開始は実Snapshotで下限判定。参加者戦績/Guildの参照は元の参加者限定を維持。
- B-08: optional参加/briefing adapter・controller・画面・QA fixture。登録と既存combined joinを分離し、参加登録をReplay成功と扱わない。未参加時に参加者RPCを呼ばず、作成/登録後に再取得。救援ID付き登録は未接続として拒否。
- C-08: 実SQL00250〜255をPGliteで検証。登録副作用0、定員、Main/実Snapshot各境界、再送、匿名/非所有/不正Snapshot等。
- P-08: SQL/DTO/画面差分レビューと再実行。Snapshot二重IDによる総合力水増しを拒否、最終開始時刻と期限判定の時刻を一つに固定する修正を指示・確認。

## 親検証
|対象|結果|
|---|---|
|参加・開始SQL|22 PASS、0 FAIL|
|domain/controller/adapter|52 PASS、0 FAIL|
|React操作|20 PASS、0 FAIL|
|全体TypeScript・Mock Next build|PASS、13ページ生成|

```bash
RAID_TEST_RUNTIME_DIR=/workspace/scratch/be0ce4e059a1/raid-typecheck-runtime node tests/db/raid-room-entry-run.mjs
node --experimental-strip-types --test tests/raid-room/*.test.mjs
RAID_TEST_RUNTIME_DIR=/workspace/scratch/be0ce4e059a1/raid-typecheck-runtime node tests/raid-room/run-browser-tests.mjs
NEXT_PUBLIC_APP_ENV=development NEXT_PUBLIC_USE_MOCK_DB=true npm run build
```

SQL00255 SHA256: `6252976872faad09609c40184bf93933cf0aa9a801b3e649dd4692c1b142f710`。前工程のSQL14件を今回再実行件数に加算しない。

## 開始と再送
開始設定はprivateなraid_room_battle_settings.enabled=false。設定share→本人user→bossをロックし、成功receiptを本人+requestで保存。同payload再送は同じ開始時Snapshot/Replay/RP応答を返す。失敗は消費を含めrollback。既存生成設定もfalseを維持。

実戦闘へ接続する親callbackはまだ製品GameContext/useBattleに搭載していない。画面は登録後の参加済み表示まで。APIが存在することを、配信DBで参加/戦闘が可能という意味にしない。

## 未完了
新Roomの戦闘確定・共有HP・期限終了・承認済み期限後結果/貢献保存・resolve-battle分岐・製品戦闘導線・救援/報酬/Present/ランキング切替が残る。開始フラグはこの接続完了前に有効化しない。既存resolve-battleは旧finalizeへ向かうため新Roomは拒否される。

PGliteのAuth/総合力/所有Snapshot/回復はdouble。実計算公式、実Auth/JWT/PostgREST、全schema/全trigger、多接続は未検証。実DB適用・手動Deploy・配信設定変更・実機確認なし。PR更新による既存Vercel自動配信はDB適用と別。QAはメモリfixtureで、実戦闘からPresent受取までのPreviewに未到達。

ユーザー承認3条件はspecs/raid_room_rescue_v1.mdへ記録済み。バランス再研究やマスター値変更を行っていない。全体開発は未完了。
