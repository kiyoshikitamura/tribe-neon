# 第13工程 親統合記録

基準SHA: `079965521caed224f664d11be51e12b92b1a0a61`。2026-09-08。状態VALIDATED。

## 承認と範囲

救援AND成功の本人へRoomごとに1回、終了前に開始した戦闘の後確定も対象、Presentへ自動送付して送付から30日を受取期限とする。

AはSQL260の報酬設定・台帳・自動発行・参照、Bは報酬情報とPresent導線、Cは実SQL/既存受取/表示検証、親は仕様とレビュー/統合。

## 設定

品目・数量・成功閾値は設定へ分離する。本番用の未提示値を推測して投入しない。fixtureの仮値は製品設定として採用しない。設定不足で戦闘を失敗させず、未発行状態として区別する。

## 親レビュー

Presentのuser参照と開始処理のusers→bossロックの競合を確認。対象Room writerのusersロック強度のみを調整し、既存の同ユーザー直列化・開始条件・消費式を維持する。create/register/cancel/start/request rescue/join rescueの6関数を元定義と比較し、usersのFOR UPDATE→FOR NO KEY UPDATE以外は一致。共通sync関数は変更しない。実複数接続での競合試験は未実施。

Present遷移は本人一覧を再取得してcontextへ反映後に開く。失敗時は元ダイアログで再試行し、全体bootstrapやmission同期は呼ばない。

## 検証

親が凍結後に再実行し、SQL9件、共通79件（新adapter3件を含む）、React24件、実useBattle17件、Mock production build、最終tsc --noEmit、git diff --checkがPASS。

SQL260 SHA256: `ea6c3eefc40f23ab75460ffddef23ed6c2751130e141fdb1887adf086d30d742`。SQLはPGlite単一接続＋依存fixture、画面はJSDOM。実claim_presentとgrant_present_payloadで受取・再送・期限拒否を確認したが、実DB/複数接続/実機/Production反映とは区別する。詳細はraid_room_phase13_validation.md。

## 残件

主催者・通常参加者の別報酬、ランキング切替、品目数量設定投入、Preview実DB・実機の一連確認は未完了。運用フラグfalseを維持。
