# Mission 実装候補・監査結果（2026-09-12）

状態：承認モックに基づくUI候補実装。Production/Preview DB適用なし。実機は全ページ統合後の一括確認。

## 実装

- デイリーの達成数、JST更新時刻、3件・5件報酬を上部にまとめ、個別一覧と重複させない。
- 同文説明削除、Quest完了条件の表記、各対象コンテンツへのCTA（patrol/pvp等の既存route）。
- 通常の現在目標を分類表示し、次段階の実マスター条件・報酬を展開。
- 受取済みを保持して折り畳み。直接付与、現在タブのみの一括受取、既存結果ダイアログ維持。
- Specialの実イベント名・開催期間・受取期限・全体進捗・全達成報酬を上部へ。期限切れの個別受取を無効化し、一括対象からも除外。
- GameContext変更はmission projection内のみ。eventTitle/StartAt/ProgressEndAt/ClaimEndAtを既存RPC結果から付加。未公開GvG戦闘条件は既存featureUiExposureで除外。準備イベントは除外しない。

## 初回目標マスター差分（ローカル候補、未適用）

|対象|旧 prerequisite|新 prerequisite|
|---|---|---|
|MIS_N_P004 Quest初回|MIS_N_P003 装備装着|null|
|MIS_N_P006 Battle初回|MIS_N_P005 Quest上級|null|
|MIS_N_P008 Raid初回|MIS_N_P007 Battle勝利|null|
|MIS_N_P010 Guild加入|MIS_N_P009 Raid撃破|null|

対応する旧親のnextMissionIdも削除。同系統の段階条件、報酬量・回数・公開設定は維持。
SQLは `20260912064420_mission_content_entry_dependencies.sql`。適用時に既存前提値のドリフトを検査。ユーザー進捗、受取履歴、資産を直接変更しない。既存syncにより次回取得時に新規行が生成される。

## 正本に対する監査

- Customer Journey：Quest上級・Battle勝利を別コンテンツの初回目標入口の必須条件にしない候補を用意。
- Game Cycle：日次目標→対象画面→達成・直接受取→次目標が接続。
- Motivation Cycle：現在値、報酬、次段階、受取履歴を確認可能。仮の進捗・報酬を転記していない。

## 確認と残件

PASS：Mission追加前typecheck。`verify_mission_product_entries.mjs`（初回独立解放・同系統条件維持・既存受取維持）、`verify_tn10_mission_direct_grant.mjs`（個別・一括・二重受取拒否）。実DB検証ではなくローカルruntime検証。

未完了：実画面ブラウザ受入、Preview実接続、日付更新・前日救済、既存ユーザー影響件数と追加報酬量、実機デザイン監査。

機能残件：
- 現行claim/syncは次段階を0で生成。今回の依存解除だけで累積・到達判定は正常化しない。実績源が確認できない過去行動を推測で補完していない。
- Guild在籍30/90日の連続/通算定義と加算経路は未確定。
- RPC get_active_mission_events は期限後でもCLEARが残るとイベントを返すため、UIは受取期限終了を明示。最終的な受取拒否は既存サーバー権限に従う。
- GvG非公開時の表示除外と日次3/5達成のサーバー集計整合はPreviewで確認が必要（表示で架空達成を加算しない）。
