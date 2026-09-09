# Raid 第19工程 C 検証記録

2026-09-08。基準 `5243b287f3e3261bd587a736cabc70af528f9dc7` に B-19 の作業差分を重ねて検証。親レビュー・再実行完了、状態 VALIDATED。

## 実行環境と結果

Node v24、独立した scratch 依存ディレクトリの React / JSDOM / esbuild を使用。各 runner の `RAID_TEST_RUNTIME_DIR` に依存ディレクトリを指定する。製品の tracker・hook・ConnectedBrowser をそのまま bundle し、RPC 応答と GameContext の SE 関数のみ test double とした。

|実行コマンド（`node`）|結果|確認範囲|
|---|---:|---|
|`tests/raid-room/run-activity-sync-tests.mjs`|13 PASS|一覧・作成・詳細同期、遅延順序、失敗維持、account / OFF / logout、期限 timer、実 ConnectedBrowser 更新接続|
|`tests/raid-room/run-ui-cutover-tests.mjs`|3 PASS|Room 有効時の旧取得停止、無効・未設定時の既存表示|
|`tests/raid-room/run-browser-tests.mjs`|28 PASS|既存 Room 操作・救援再送・account 境界|
|`tests/raid-room/run-use-battle-room-tests.mjs`|17 PASS|実 useBattle の開始・確定・再試行・復帰・取消|

通知同期の 13 件は、後発の終了詳細より古い一覧、後発空一覧より古い詳細が遅れて到着しても通知を復活させないことを含む。作成待ち中の空一覧より作成成功を優先し、同じ Room の新しい終了詳細があれば古い作成 receipt で戻さない境界も確認した。実 ConnectedBrowser では初回取得・更新操作・戦闘終了時の refreshRevision 変更が、追加の旧 RPC を呼ばず通知へ反映することを確認した。

## 初回失敗と修正

新規テスト初回は 9 PASS / 1 FAIL。作成 fixture の難度 intermediate に対しテスト要求が beginner となっており、実装の応答難度チェックにより正しく通知反映されなかった。要求を fixture と一致させた。製品コードをテストに合わせて変更していない。その後、競合 2 件と実 ConnectedBrowser 1 件を追加し、最終 13 PASS。

## 限界・未実施

SQL 統合検証は A-19 担当。C は実 DB、Edge 配置、Cron、複数接続競合、実機や実 Preview を実行していない。GameContext 全体 mount や実端末 Header の視認性をこの結果で検証済みとしない。実機確認待ち・全体開発完了・Production 切替完了ではない。運用設定・報酬数量・戦闘式・正本 Replay は変更していない。
