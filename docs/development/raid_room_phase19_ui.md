# 第19工程 — 開催通知の参照結果同期

基準: `5243b287f3e3261bd587a736cabc70af528f9dc7`。担当 RAID-B-19、状態 VALIDATED（親レビュー・再検証完了）。

## 変更

- 開催通知の表示用 tracker を専用 hook で GameContext に保持。初回 bootstrap と製品 Room 画面で同じ tracker を利用する。
- 既存の一覧・詳細・作成 RPC 応答を観測し、ACTIVE・HP 正・期限内の Room が一つでもあれば通知する。取得失敗は直前の成功情報を保持し、空一覧/終了詳細では解除する。
- 一覧と詳細の開始順序を記録し、古い bootstrap/画面応答で新しい終了情報を戻さない。作成成功は作成確定前の空一覧に消されないよう完了時順序で保持し、同じ Room の後発詳細が存在する場合はそちらを優先する。
- account/表示設定変更時に tracker を切り替え、旧 tracker の遅延応答は反映しない。ログアウト時も通知を解除する。
- 既知 Room の最終期限で一度だけ画面を更新する。恒常 polling は追加しない。
- 既存の戦闘から Raid へ戻る refreshRevision を受け、Room が既に mount 済みなら一覧と詳細を再取得する。新規 mount は既存の初回一覧取得で同期する。

## 検証

C 担当の `RAID_TEST_RUNTIME_DIR=/workspace/scratch/3f215bc02a8a/raid18-test-runtime node tests/raid-room/run-activity-sync-tests.mjs` を B でも実行し、12 件 PASS。
全体型検証・Mock build・親レビューは親の統合記録を参照する。

## 範囲と残件

全体 bootstrap の追加呼出し、戦闘計算/Replay/報酬正本、DB、運用設定、実 DB/Deploy は変更していない。通知はサーバー参照結果の表示であり戦闘可否の Authority ではない。

画面外で他人が作成/討伐した変化は、次回一覧/詳細等の参照時に反映する。常時同期/リアルタイム通知を提供したものではない。取得失敗時は最後の成功情報をその既知期限まで表示するため、未取得の討伐は反映できない。実機/実 DB の確認は未実施。
