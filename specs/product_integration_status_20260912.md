> 最新状態：前候補80bd05cの専用Preview配信は完了（oenzyoqr2）。その後の監査指摘は specs/product_audit_fixes_20260912.md を参照。今回追加2 migrationはPreview適用・ROLLBACK検証済み。以下は前候補時点の記録を含む。

# GAME03 Product統合候補・受入状況

## 状態

3レーンのコード差分を統合。Preview DBへ下記3件適用済み。Production変更・Preview配信は未実施。
ユーザー実機確認は全ページの統合Preview準備後に一括実施。追加デザイン変更もその監査後。
コード候補完成をProduct全体PASSとは扱わない。

## 正本との照合

|対象|Customer Journey|Game Cycle|Motivation Cycle|
|---|---|---|---|
|Quest|Tutorial後の派遣入口を維持|担当・派遣先・状態・受取・再派遣を表示|報酬と獲得候補を区別、進行が分かる|
|MyPage|既存Open Community入口を維持|現行構造を維持、初回案内の停止を解消する接続|キャラクターと活動表示を維持|
|Mission|コンテンツ間の初回目標依存を緩和する候補|日次目標・対象画面・受取・次段階|達成数・節目報酬・履歴・次目標|
|Ranking|初期プレイから個人・他者を確認|カテゴリ別に育成・Guild・Battleへ接続|自己順位・直上との差・周辺・報酬帯|
|Navigation|Gacha→Character→Quest→Battle→Raid→Mission|未開催時は既存ackを経てMissionへ|未参加状態を保持し開催後に再案内|

これは要件と実装構造の照合結果。実接続・実機での達成は別ゲート。

## 検証証拠

- 各レーンTypeScript検証PASS。
- Quest状態境界、戦闘・結果導線契約PASS。実コンポーネントReact SSRの空き／派遣中／戦闘待ち／受取可能PASS。
- Mission初回独立解放・同系統段階・既存受取維持のローカル検証PASS。
- Mission直接付与・個別／一括・二重受取拒否のローカル検証PASS。
- Navigation未開催→Mission、Mission後の開催→Raid案内を含む検証PASS。
- Rankingプロフィール100件分割・重複除外・エラー伝播検証PASS。既存プレオープンGuild UI契約PASS。
- git diff --check PASS。
- 通常npm buildは環境外node_modulesシンボリックリンクによるTurbopack制約で失敗。webpack方式は統合ビルド成功（最終再検証結果は最終報告参照）。ソースのbuild設定は変更していない。
- 既存ranking_reward_regressionは廃止済Raid週次報酬を期待してFAIL。該当報酬domainは今回未変更。別管理。
- Chromium実行バイナリなし、既存QA簡易Questは実コンポーネントを描画しないため実ブラウザ確認未実施。

## Preview READ ONLY確認

接続先：sufvuqdnqohpfzkwxohq。BEGIN / READ ONLY / timeout / ROLLBACKで必要関数とMission4境界の定義を確認。

- Ranking既存3読取RPCの順位基準は追加自己・周辺候補と一致。
- get_ranking_self_contextを追加済み。12ユーザー×3カテゴリ×日次/シーズンの72ケースで既存一覧との順位一致、周辺最大5件、日次期間、実行権限を検証済み。実データの100位外は未検証。
- Missionの変更対象4境界は候補migrationの事前条件と一致。
- complete_activation_mission_handoffは既にfirst_raidまたはinitial_raid_unavailable_ackを要求する。
- acknowledge_initial_raid_guideが既存実装。不要なhandoff置換SQLを撤回し、UIを既存ackへ接続。
- 既存ackはlegacy Raid判定を使用するため、UI側は成功したRoom一覧で未開催確認した時だけ呼ぶ。Roomとの原子的な開催判定整合は実接続ゲートで確認する。

## 未完了・保留

1. Quest推奨総合力の根拠と地元一致報酬補正の整合。仮値は実装せず既存推奨レベル・一致事実だけを表示。
2. Mission累積条件の実績源、Guild在籍30／90日の定義。レベル・覚醒等4種の所有到達条件は正常化済み。
3. Mission依存解除をPreview適用済み。4入口各68ユーザーに新たに利用可能となる条件変更。自動付与なし。所有到達条件は44件の追加CLEAR見込み（CHAR_EXP_L計44、CASH0）。
4. Ranking追加API適用済み。100位外の実接続受入は残件。
5. 通常シーズンの期間取得を各カテゴリへ接続済み。期限切れACTIVEが既存APIから返らない場合は期間情報なし。2099年の仮期限を表示しない。
6. Navigationの未開催ack→Mission→開催後再案内の実接続確認。
7. 統合Preview配信、ブラウザ回帰、最後のユーザー実機一括確認。

## Preview DB適用・検証（2026-09-12）

- 20260912064420_mission_content_entry_dependencies.sql：適用成功。対象4件の依存解放確認済み。
- 20260912073246_ranking_self_context.sql：適用成功、上記72ケースPASS。
- 20260912073913_mission_owned_state_progress.sql：適用成功。加算誤判定防止、個別・一括受取後の次段階再計算、自動付与なし、既存CLAIMED維持、所有減少後CLEAR維持のSQL検証PASS。検証変更と付与はすべてROLLBACK。
- 到達修正は既存4関数の定義ハッシュ照合と影響ガードを通過。Productionへ同じSQLを無検証で流用しない。

## 配信の不足

利用可能環境にVercel CLI、既存CLI認証、Vercelトークン、.vercel/project.jsonなし。Vercel接続ツールもなし。
手元.env.localのSupabase接続先はPreview。秘密値は出力していない。
配信済みURL/SHA/Readyは報告できない。Windows Codexの認証済み報告あり（CLI59.16.0 / kiyoshikitamura / tribe-neon）。追加認証は不要。取得可能なコードを渡して同環境でPreview配信する。
Declined pluginの再提案や別ホスティングへの勝手な切替は行わない。

## 次工程

残るDB候補・期間・実績判定を解消して専用Previewへ統合。上記機能確認を終えてから全ページを一括でユーザーに渡す。
現在の時点でユーザー実機確認やProduction承認を求めない。

## 最終ローカル検証

ランキング期間のnullable formatter修正後、TypeScriptを含むnext build --webpack PASS。Quest/Mission/Navigation/Rankingの限定契約検証PASS。Windows転送は浅いGit履歴のbundle取得失敗を検出したため、git archiveによる追跡ソースZIPを使用する。環境ファイル・node_modules・認証情報は含めない。
