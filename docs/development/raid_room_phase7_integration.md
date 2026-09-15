# Raid第7工程 親統合記録

2026-09-08 JST。基準24fca1d58bf8ffab2687da8a70959b2f5670f34f。RAID-A/C/P-07は親レビュー・機械検証完了（VALIDATED）。B-07は接続契約文書の親レビュー完了（VALIDATED）で、機能実装や機械テストの完了ではない。

## 到達内容
- A-07: 旧開始・確定・終了・respawn・報酬3入口・日次rotation・旧一覧の9関数へRoom除外を追加。
- B-07: Room参加登録と既存戦闘の事前確認・開始・Replay回復を分離する接続契約。文書のみで、公開参加/戦闘のコード実装ではない。
- C-07: 実SQLの分離/既存回帰検証。
- P-07: 最新の元関数を抽出し9関数の差分を比較。Room判別と必要なロック/除外以外の本体を維持していること、既存実行権限を確認。B文書も参照実装と照合。

## 検証範囲
生成設定falseを維持。実DB適用、手動Deploy、配信設定変更なし。SQLと文書のみの変更のためUI build/Reactテストは今回再実行しない。前工程の検証件数を今回のPASS件数へ加算しない。

## 残る構造判断
既存根拠の照合先は specs/product_decisions.md の代表Main Formation/Total Powerと specs/spec_guild_gvg_raid.md の24時間/撃破条件、および specs/raid_room_rescue_v1.md の未確認条件。
24時間または撃破、総合力下限16/20/24万、開催数10/10/10/5は確定済みとして維持する。以下は対応本文が未確認であり、未決定だったと断定しない。

|判断|必要な理由|
|---|---|
|Room一覧の公開対象|所有者・参加済み限定の暫定参照から、初参加者へ読取権限を広げる範囲が必要|
|参加/開始時の総合力対象|代表Main Formationと実出撃キャラを選択できる既存開始処理をどの対象で判定するか必要|
|期限前開始・期限後確定の戦闘|24時間で新規開始禁止とは別に、支払済み戦闘の貢献・HP・報酬資格をどう扱うか必要|

公開参加/戦闘・救援・報酬/Present・ランキング切替・実DB・多接続・実機は未完了。全体開発完了、実機確認可能な縦通しPreview到達とは扱わない。

## 親検証結果

`RAID_TEST_RUNTIME_DIR=/workspace/scratch/be0ce4e059a1/raid-typecheck-runtime node tests/db/raid-room-legacy-isolation-run.mjs` を親が再実行し14件PASS、0FAIL。PGlite 0.5.8 / PostgreSQL18.3。一時fixtureへ00250〜254を無改変適用し、旧日次triggerの実本文も接続。

Roomの旧開始・確定拒否と台帳副作用なし、3種旧報酬0、旧一覧除外、旧非Roomの初回無料/RP1・HP/ログ/確定・日次3戦/RP5・clipping・終了/respawn・再送を確認。SQL00254 SHA256: `62e224d0b09862978ff8ce7ad93c3559a577d70ade623c0230102dc38115c4e1`。

Auth/回復/Snapshot/結果検証/ミッション等の依存はdouble、全schema・全triggerではない。権限はメタデータの確認。単一接続の試験であり実DB・多接続・実機PASSではない。詳細はraid_room_phase7_validation.md。
