# MyPage入場・Battle START・旧NPC投稿修正 — 2026-09-14

基準: d49ee79e093475d343579a08e52fb1ab2b689f27。専用Previewのみ。ユーザー指定により次の実機確認依頼は不要。

## 変更
- MyPageでログイン報酬・Mission案内・Ranking通知の判定が未完了の間、初回描画から待機ダイアログと入力ブロックを表示。既存の各ダイアログが表示されたらその操作を優先し、案内の合間に背面操作が進むことを防ぐ。
- ログインMaster取得と冪等な報酬RPCを並列化。成功表示前の資産同期は保持。
- 認証保護案内の表示判断をlayout effectへ移し、判定完了から表示までの操作可能な描画を避ける。
- Battle START専用演出をゲーム枠内の絶対配置へ戻し、親の高さ内で内容を配分。自動演出だけが対象。準備・実戦・Resultの操作スクロールは維持。
- postNpcYajiMessageの固定NPC UUID/ランダム作者による旧board_posts直INSERTをMock環境に限定。Previewのauthenticated INSERT権限なし・SELECT RLSのみという既存契約を保持。通常投稿のsend_chat_message RPCは変更なし。
- M9 action performanceはPreviewのconsole.info計測ログ。障害として扱わない。

## 検証上の制約
作業環境exec-server接続障害によりローカル型チェック・ブラウザ・添付画像の確認は実行不能。GitHubソース／Preview DB read-onlyで根拠を確認し、子エージェントとコードレビュー。配信ビルドはGitHub経由のVercel statusで追跡する。実ブラウザPASSとは報告しない。
Vercel接続ツールは対象teamへの403で配信詳細取得不可。設定や権限は変更しない。

## 継承と対象外
欠落復旧済みRaidバナー、Quest難度、PvP Main編成、正規Battle recoveryは保持。
追加の未確認Production差分は統合しない。DB Migrationなし。Production NOT EXECUTED。

待機の永久化防止: Rankingのキャンセル済みin-flight参照による再入場拒否を解消。Prepのrequest keyは当該effect終了時に解放。両案内取得のPromise rejectもエラーを記録して判定を完了させる。
