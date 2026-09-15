# Raid第5工程 親統合記録

2026-09-08 JST。実装基準 `94ed7cc7bcc4a093a0395d2f027c6c9b06ba0ed1`。RAID-A/B/C/P-05は親レビュー・機械検証完了（VALIDATED）。本記録を含むPR headが対象成果。

## 実装内容
- A-05: 開催数10/10/10/5・定員20・24時間をDB設定へ分離。非公開Room登録と参加台帳更新。所有者を含む人数、再送、終了後の新規登録拒否、ロック待機後の時刻判定。
- B-05: 残り時間・期限表示。期限通過、HP0、状態/期限不明の参加抑止。要求直前と画面復帰時にも期限を確認。端末時計でDTOの正式状態や報酬を確定しない。
- C-05: 00250/251/252を無改変で使うPGlite検証。
- P-05: 割当と範囲分離、SQL/画面diffの親レビュー、再実行、全体型検証・Mock build、仕様根拠の追記、PR統合。

## 親の検証結果
|検証|結果|
|---|---|
|新規lifecycle SQL|19 PASS、0 FAIL|
|既存総合力・救援条件SQL|14 PASS、0 FAIL|
|React操作|16 PASS、0 FAIL（既存10＋今回6）|
|既存共通domain/controller/adapter|43 PASS、0 FAIL|
|全体TypeScript・Mock Next build|PASS。実GameContextを含む全体コンパイルと13ページ生成|
|SSRからhydration|React操作テスト内で期限を跨ぐケースを実行、recoverable error 0|

再現コマンド:
```bash
RAID_TEST_RUNTIME_DIR=/workspace/scratch/be0ce4e059a1/raid-typecheck-runtime node tests/db/raid-room-lifecycle-run.mjs
RAID_TEST_RUNTIME_DIR=/workspace/scratch/be0ce4e059a1/raid-typecheck-runtime node tests/db/raid-room-condition-rules-run.mjs
RAID_TEST_RUNTIME_DIR=/workspace/scratch/be0ce4e059a1/raid-typecheck-runtime node tests/raid-room/run-browser-tests.mjs
node --experimental-strip-types --test tests/raid-room/*.test.mjs
NEXT_PUBLIC_APP_ENV=development NEXT_PUBLIC_USE_MOCK_DB=true npm run build
```

00252 SHA-256: `8e1d91f1255c52f3cc0fd60be743c7983b1bcab3b0ece497869afb2da87470f9`。

## 親レビュー
非公開更新関数は資格・経済処理を代替しない。公開ロールに実行権限を与えず、既存Instanceや報酬を更新しない。参照RPCと同じowner/member/finalized progress集合で人数を数える。登録は難度行、参加はInstance行で直列化し、READ COMMITTED以外は拒否する。再送の登録済み返却は戦闘許可ではない。期限表示は予定期限を「期限」と表記し、撃破時刻と混同しない。

## 既存仕様の照合
`spec_progression.md`と00210の戦闘開始処理でLv5解放を確認。8/22のAction Resource Freezeと00210でRP1・初回0・上限5・2時間回復を確認。Main Formation総合力は`product_decisions.md`に定義あり。新仕様書へ出典と引継ぎ範囲を記録した。Room作成自体の追加費用とは区別する。

## 未完了と次工程
全体開発は未完了。公開生成/参加RPC、実Instance生成、戦闘/救援/報酬/Present/ランキング切替を接続していない。現時点の画面はサンプルQA用で、複数ユーザーの実戦闘からPresent受取までのPreviewには未到達。

PGliteは単一セッション。多接続での最後の1枠の競合、ロック待機後の可視性、deadlock、既存戦闘との競合は実PostgreSQLで別途確認が必要。実DB適用、PostgREST/Auth、今回改修後の配信ブラウザ、iOS/Android Human PASSは未検証。既存VercelのPR自動配信とDB適用は別工程。

次は既存の本人認証・Lv5・Raid Point・戦闘Snapshotと公開writerを接続する。Room生成資格/追加費用、総合力の実出撃編成との差異・時点、救援公開範囲/帰属、報酬対象と新旧切替の残る構造条件を実装前に揃える。バランス研究を再開せず、数値はマスターで調整可能にする。

