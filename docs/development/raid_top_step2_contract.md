# 第2工程 先行API/担当契約

基準c397df2。DB migrationの編集/適用は親が排他所有。A/Bは別オブジェクトのSQL案を専有docsファイルへ出力し、親がB→Aの順で正式migrationへ統合する。

公開RPC: `get_raid_top_v1()`（引数なし・本人はauth.uid）。返値は第1工程 `parseRaidTopSnapshot` のJSON形。participating/rescues/dailyTargets は ready/data、例外はRPC errorで空にしない。カードenemyはavailable/value:{variantId}、画像/名前はクライアント現行マスター解決。dailyTargets.dataは{dateJst,targets:[{variantId},{variantId}]}。

各一覧は最大20レイド、参加者顔は最大5。全ページ取得/カード別RPCなし。本人参戦中はactiveかつHP>0/期限内、他の詳細/帰還/履歴は既存導線。救援も有効開催分のみ、既存救援閲覧/参加の公開範囲とGuild条件を同じ基準で適用。同一roomは最新の閲覧可能な救援を1件採用（時間同値時ID順）。公開範囲はrescue.valueにscopeとguildIdを追加し保持（Bが型を拡張、既存Mock互換に配慮）。サーバー型の正確な値はAが既存SQLを確認しB/親へ即共有。

日次内部関数名: `private.raid_daily_targets_v1()` returns jsonb {dateJst, targets:[{variantId},{variantId}]}。A集約はこれを呼ぶ。Bがprivate schema権限を含め提案する。日次正本はJST日キーで初回取得時に遅延確定し全ユーザー共通、7エリアから重複なしランダム2。関数にクライアント指定日を受けない。既存選択肢/新規受付とも同じ正本参照。成功要求の再送は日次判定前に既存結果を返す。参加/救援/レイド寿命は触れない。

参戦中/救援・主催者Guild/本人状態はサーバーjoinで投影し観測状態を保持。リーダー画像は正しい現行参照を使い不明はunknown（固定人物で代用しない）。認証切替は既存hookの遅延破棄を維持。Bが既定loaderを一括RPCに接続し、注入Mockを残す。画面のJST日跨ぎは再取得で対応し必要なら日次境界/復帰時のrefreshを追加するが独自抽選は禁止。

CはSQL仕様を独立検証。親が隔離PGを用意してから実行。共有ファイルの変更要求は親へ連絡する。
