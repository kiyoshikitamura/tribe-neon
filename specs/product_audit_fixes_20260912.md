# Product監査指摘の修正・検証

## 状態
前候補80bd05c6500d39b66f6d2b550ece2b70a42c8545への差分。監査対象はMission、MyPageバッジ、Ranking。Production変更なし。修正候補のPreview再配信・実ブラウザ受入は別工程。

## 修正
|指摘|対応|
|---|---|
|Mission受取期限のサーバー検証不足|個別は期限以降を拒否、一括は期限切れを除外し有効分だけ付与。NULL期限は維持|
|MyPageバッジと一覧の期限判定差|共通の受取可能判定へ統一。期限到達・画面復帰で表示更新|
|通信応答欠落で受取可能表示が残る|成功・失敗どちらもサーバー状態を再取得。別ユーザーへ切替時に古い結果を反映しない。再同期後にCLAIMEDへ強制上書きしない|
|終了イベントの履歴が消える|自身のCLAIMEDを持つイベントを取得対象に保持。イベント単位で表示・達成数・一括対象を分離|
|未加入・未開催・終了・失敗の混同|状態を短い文言と有効な導線で区別。Raid取得失敗を未開催とみなさない|
|同順位Guildで自分が周辺から外れる|順位番号ではなくサーバーの絶対行位置で周辺を取得。順位算式・報酬は維持|
|Rankingの期間取得失敗・対象外等の混同|期間取得失敗は再試行可能にし、順位は保持。対象外・未登録等はサーバーが確認できる事実で表示|

## Preview DB
接続先 sufvuqdnqohpfzkwxohq。以下2件適用済み。配信時の再適用不要。
- 20260912153009_mission_claim_deadline_and_event_history.sql
- 20260912153017_ranking_context_audit_fixes.sql
適用前に現行関数定義のハッシュ照合。実行権限は5関数とも適用前後一致（authenticated/service_role/postgres）、search_path設定保持。既存別署名の旧関数への警告を今回の変更で解消したとは扱わない。

適用前影響：期限切れCLEAR 0件、対象イベント0件、無期限CLEAR29件、将来有限期限CLEAR0件。期限切れ被害が発生済みとは断定していない。資産没収・補填配布なし。

## 検証証拠
- tests/db/mission-claim-deadline.sql：Preview実RPC PASS。期限前・後・NULL、個別重複、期限混在一括、再送、台帳、終了イベント履歴、2件目の失敗による一括原子性。すべてROLLBACK。
- tests/db/ranking-context-audit.sql：Preview実RPC PASS。現行データの自己行位置と周辺、CLOSEDシーズンに同率1位6件・自身6行目のfixture。表示順位1を保持し周辺に自身が存在。すべてROLLBACK。
- scripts/verify_mission_ui_recovery.mjs：期限境界、無期限、不正期限、付与後応答欠落、ユーザー切替、0件付与、再同期失敗 PASS。
- scripts/verify_ranking_context_audit.mjs：6同率末尾、100位外、行位置欠損、状態理由、期間取得失敗と未設定の区別 PASS。
- scripts/verify_tn10_mission_direct_grant.mjs：既存直接付与回帰 PASS。
- Rankingプロフィール分割・preopen UI契約・TypeScript：レーン検証PASS。
- 最終統合next build --webpack：PASS（TypeScript、全21ページ生成含む）。Preview接続設定で検証。実ブラウザ受入とは別。

## 実操作の残件
上記を実ブラウザ全ページ受入と同一視しない。修正後の固定Preview配信後、テストアカウントで受取・イベント切替・ランキング・Navigationを回帰し、ユーザーは全ページ一括で実機確認。デザインの追加調整はその後。
Quest推奨総合力・地元補正、Mission累積・Guild在籍定義は従前の別残件。今回の監査指摘修正でFIXしたとは扱わない。
