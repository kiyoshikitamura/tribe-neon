# レイドトップ 第2工程 統合報告

基準SHA: `c397df2ef489916192109120e4303d05f2da8b0c`。
専用ローカルbranch: `codex/raid-top-data-step2-20260909`。基準から独立worktreeを作成し、後続差分は混入していない。実装SHAは本報告を含むcommitを参照。

## 変更内容

- A: `get_raid_top_v1()` で本人の参戦中/閲覧可能救援/日次対象を一括投影。参戦中と救援各20件、顔は5人。主催者名・現リーダー・現在Guild、敵variant、難度・HP・期限・登録人数・本人role、救援ID/scope/公開先Guildを保持する。正常0件と例外を区別し、カード別RPC/全ページ取得をしない。
- B: `private.raid_daily_targets` をJST日キーの正本とし、現行7エリアから重複なしランダム2エリアを初回要求時に固定。日キーのadvisory transaction lockと再読取で同時初期化を直列化。選択肢/新規受付/トップが同じ正本を参照する。成功済み同requestは日次判定より前に既存Roomを返す。
- B画面: 既定loaderを一括RPCへ接続。リーダーIDは既存マスター画像へ解決。認証切替時の遅延破棄、JST境界/ブラウザ表示復帰/戦闘帰還の更新、Mock注入を保持。端末時計は再取得の契機にのみ使用する。
- C: 専用PostgreSQL17の実SQL検証と、その返値を画面のloader/parserへ通す検証を追加。
- 親: migrationを排他的に統合。最新SQL260 createとの比較で日次gate以外の受付/寿命/報酬処理が変わらないことを確認。日次ロック待機後の期限判定時刻を補正。既存Activityテストを新しい初回集約RPCへ追随。

正式migrationは次の2本のみ。

1. `supabase/migrations/20260908175140_raid_top_daily_authority.sql`
2. `supabase/migrations/20260908175143_raid_top_aggregate_api.sql`

クライアント変更は `src/domain/raidTop.ts`, `raidTopData.ts`, `raidTopRpc.ts`, `src/app/components/raid/useRaidTop.ts`。テスト・runner・fixture・担当契約・検証文書を追加。SQL案の重複ファイルは正式成果物に含めない。

[API契約・権限・Preview適用順](raid_top_step2_api.md)、[独立検証](raid_top_step2_validation.md) を参照。

## ローカル接続の意味

隔離localhost PostgreSQL17に、既存レイド依存schema fixtureと実migration250〜260、新migration2本を適用し、認証ロールでRPC SQLを実行する。周辺Auth/戦力計算などはfixtureであり、全migrationを適用したSupabase環境ではない。実SQL返値を製品のloader/parser/表示へ通して接続境界を検証する。

PostgREST/GoTrueを伴うHTTP認証の縦通し、Preview DB/Preview画面の接続、実機受入は未実施。この差を残したままPreview接続完了とは報告しない。

## 検証結果

親: 全体Mock build・型検証・変更対象eslint PASS。第1工程top16件と関連既存189件（共通110、Browser29、Activity14、useBattle20、Street4、clear reward4、ranking retirement5、UI cutover3）PASS。

第2工程: 実PostgreSQL10群、実advisory待ちを使う日次境界/同要求8同時再送2群、実SQL出力→loader/parser/実RaidTopを含む追加フロント6件を検証。詳細は独立検証記録を参照。

CLI 2.117.0のsecurity advisorsを明示localhost接続で実行。新規オブジェクトの指摘なし。既存周辺fixtureのbuild_server_battle_snapshot/resolve_canonical_reward_itemにsearch_path WARNが2件あり、fixture外の本番評価ではない。結果JSONはevidence/raid-top-step2-20260909/へ保存。

## Preview適用時の順序（未実施）

1. 既存レイドSQL250〜263の適用状況、現行7エリアmaster、users.favorite_character_idを確認する。既存migration全体や旧生成設定の整合は別の適用前チェック対象。
2. 日次正本migration、続いて集約API migrationを適用する。private schemaをData APIへ公開しない。
3. 認証ユーザーで取得/救援scope/新規受付と再送の確認後、対応frontendを反映して画面を確認する。

新規Cron登録や運用フラグ変更は不要。既存の作成無効フラグによる再送拒否はSQL260から維持しており、日次変更が既存の停止制御を迂回しない。

## 未完了・保持する残タスク

- Preview/本番適用、HTTP認証を含む実環境接続、実機受入。実運用データ規模での応答性能確認。
- 報酬ダイアログのスクロール不具合、参加者プロフィール遷移不具合、残る承認済みページ改修。
- バランス再設計、戦闘/報酬/Replay/ack/既存24時間・撃破終了/日跨ぎ参加の変更は行っていない。
- push、Deploy、Preview/本番DB適用、Edge更新、Cron登録、運用フラグ・共有alias変更は行っていない。ローカルfixtureの設定有効化は専用DB内のみ。
