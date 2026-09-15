# Raid第6工程 親統合記録

2026-09-08 JST。基準 `67070ed6b9eb25d7c02caf32bf596e79e98f415d`。RAID-A/B/C/P-06は親レビュー・機械検証完了（VALIDATED）。本記録を含むPR headが対象成果。

## 到達内容
- A-06: 認証付き `create_raid_room_v1` と `list_raid_room_boss_choices_v1`。本人・Lv5・生成時Main Formation総合力をサーバーで確認し、新Instance、24時間期限、Room、所有者参加、request台帳を同一トランザクションで作成。追加消費なし。
- B-06: 生成機能をadapterへ明示opt-inで接続。ボス候補選択→生成→Room詳細→一覧復帰。通信失敗再送は同じrequest ID、payload変更は新ID。連打・参加競合・古い作成応答を抑止。
- C-06: 実SQL00250〜253をPGlite最小fixtureへ無改変適用し条件・冪等性・副作用を検証。
- P-06: APIキー整合、親レビュー、修正指示、関連テスト再実行、全体型検証・Mock build、PR統合。

## 親検証
|対象|結果|
|---|---|
|生成SQL|20 PASS、0 FAIL|
|domain/controller/adapter|45 PASS、0 FAIL（前工程43＋生成adapter2）|
|React操作|19 PASS、0 FAIL（前工程16＋生成操作3）|
|全体TypeScript・Mock Next build|PASS、実GameContextを含む全体コンパイル、13ページ生成|

```bash
RAID_TEST_RUNTIME_DIR=/workspace/scratch/be0ce4e059a1/raid-typecheck-runtime node tests/db/raid-room-creation-run.mjs
node --experimental-strip-types --test tests/raid-room/*.test.mjs
RAID_TEST_RUNTIME_DIR=/workspace/scratch/be0ce4e059a1/raid-typecheck-runtime node tests/raid-room/run-browser-tests.mjs
NEXT_PUBLIC_APP_ENV=development NEXT_PUBLIC_USE_MOCK_DB=true npm run build
```

00253 SHA-256: `f440e79518fe5fa33dc45ab6554ef814ac21e41b8767f470efc0b928388411b6`。第5工程のSQL33件を今回の新規再実行件数に加算しない。

## 親レビューで確認・修正した点
設定停止と生成の境界は設定行FOR SHAREで直列化。ユーザー→難度→新Instanceの順でロック。request台帳はユーザー単位、別payload再利用を拒否。追加費用と戦闘RPを分離し、作成では資産を変更しない。
画面の作成後一覧復帰を再取得へ修正。生成中の参加も抑止する。QAの生成Roomは所有者・参加者表示が一致し、serverEligibilityはunknownを維持、Replayを作成しない。

## 公開運用のゲート
`raid_room_creation_settings.enabled` は初期false。停止時の生成呼出しは副作用なく拒否する。共有環境では現段階で有効化しない。

既存00210の `rotate_daily_raids` は全ACTIVE Instanceを終了判定へ渡し、`finalize_expired_raid_instance` は旧日次報酬とrespawn設定を行う。00211の `finalize_raid_battle` は既存HP適用・progress・ミッション・撃破時報酬へ接続する。Room専用day keyだけではこれらを隔離できない。次工程で `start_raid_battle`、確定/終了/報酬/respawnのRoom判別と公開参加を接続するまで、生成を実運用しない。本工程でこれらの既存関数を書き換えていない。

## 未完了
全体開発は未完了。公開参加/戦闘/救援/報酬/Present/ランキング切替、実DB適用・多接続競合・実機は未完了。QAはメモリfixtureの作成操作用であり、複数ユーザーの実戦闘からPresent受取までのPreviewには未到達。

PGliteのAuth UID・総合力関数はfixture double。実Auth/JWT/PostgREST、実Main Formationの計算公式と同時編集、全Migration/trigger、多接続競合は検証していない。実DB変更、手動Deploy、配信設定変更なし。PR更新に伴う既存Vercel自動配信はDB適用とは別。今回変更後の配信ブラウザ確認もこの記録時点では未実施。

