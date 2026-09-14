# 追加承認の実装記録 — 2026-09-14

基準: 9eb5083839ec71bcabc2e7eaed0a613faa56d1a8
対象: Preview DB sufvuqdnqohpfzkwxohq。Production変更なし。

## ユーザー確定
- 対応する既存IDがない紋章・Season装飾は新規登録可。
- Season中7日在籍は、現在の連続在籍のみ。再加入前を合算しない。
- 旧8月POWERは資産・総合力を保持して報酬なしで終了。

## 旧8月POWER終了（実行済み）
- 対象: ad20a338-970e-417f-b0c0-131844d7a6bb / POWER / 2026-08-01〜09-01 JST。
- ACTIVE→CLOSED。対象行・期間は保持。
- 実行直前にpublicのseason_id参照表とSeason通知を検査し、対象参照0を確認。
- users/user_items/user_characters/user_equipments/user_power_rankingsの前後hash一致を同一トランザクションで確認。
- 報酬付与・資産補正・総合力resetなし。
- 再実行はCLOSEDを保持。運用SQL: supabase/operations/20260914_close_unused_august_power_preview.sql。
- 初回は別機能のinteger型season_idとの型不一致で全rollbackし、文字列表現で対象UUIDとの一致だけ検査するよう修正後に成功。

## 後続
紋章・Season装飾の登録、正式配送・表示、連続在籍7日の接続を実装・Preview検証する。
実Season開始・プレOPEN報酬確定は正式cutoff未指定のためこの記録では実行しない。

## Preview適用・検証完了
- 都市7紋章追加＋未発行Preopen1位placeholder正規化: 実version20260914154355 / repo20260914154152。
- Season16名誉ID・9Tier binding・連続7日default・正式付与・通知・公開表示: 実version20260914154725 / repo20260914154052。
- 標準紋章15（既存8保持）。Preopen1位は非標準で未所持選択不可。
- Season Title3種は既存title_master/user_titlesへ接続。装備中の称号を上書きしない。
- 名誉報酬は名称・枠による表示。Champion紋章は承認rank1base、TOP3は中立の既存王冠SVGを使用。専用の新規描き下ろし画像があるとは扱わない。
- 検証: 全Tier、部分binding欠落拒否、所有書込み失敗の全rollback、snapshot固定、両カテゴリ正式finalize、retry、終了後脱退の受領権、Title選択Authority、TOP3正式紋章RPC＋logo同期＋公開読取 PASS。
- 恒久適用後: honor IDs16/bindings16/titles3、runs0/Item grants0/Honor grants0。
- 型/Mock明示ローカルwebpack Build、Season報酬UI境界、preopen addendum、diff check PASS。
- UI実機受入は残る。新規所有を実ユーザーにテスト付与していない。

## 残る運営工程
正式OPENの実cutoff指定、PREOPEN正規finalize、第1Season3本開始は未実行。月次終了runnerは実装済みだがcronの接続・次Season運用は未実行。
Stripe Sandboxの実接続診断は引き続き環境アクセス待ち。売上KPI集計は公開後残件。
