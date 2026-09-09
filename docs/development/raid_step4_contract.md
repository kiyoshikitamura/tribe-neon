# レイドUI 第4工程 担当・表示契約

基準: 8665d29c113374e0f704832d8c9448a1d7f2336a。branch codex/raid-pages-step4-20260909。後続別系統の差分なし。第1〜3工程とCharacter/Setup/Gachaを保持。

親: RaidRoomBrowser.tsx/.css、ConnectedBrowser、domain DTO/APIとSQL、GameContext/CardBattleView/BattleResultSummary/Activity・Guild共通接続、最終型/lint/build/commit。共有ファイルは子が変更せず必要な接続を親へ連絡。

A: 新RaidEnemySelection.tsx/.css、RaidRoomListCard.tsx/.css、既存RaidEnemyRoster.tsx/.cssと必要な表示専用helper。既存bossChoices/RaidRoomDto/raidTopAssets/current masterを再利用。表示propsを先に親へ提示。選択確定/新規受付は親の既存controller。参加条件はRAID_DIFFICULTIES正本、閲覧をブロックしない。報酬予定を捏造しない。不足は明示して親の最小APIへ。

B: RaidRoomRescuePanel.tsx、RaidRescueLink.tsxと対応CSS、新RaidResultDetails.tsx/.css等表示専用部品。既存rescue RPC/公開先別3回/依頼時Guild/リンクIDを保持。既存Result MVPとack導線は親接続。まず必要propsを親へ提示。戦闘/報酬確定処理は変更しない。

C: 第4工程QA/harness/scripts/tests/evidence、既知post-loadout fixture FAILの原因確定と修正、Setup計測の契約監査。Setup計測修正は親へ最小案を先に提示（共有Setup/utilsは親排他）。既存計測event定義を増改築しない。A/B各部品の最終統合画面を375/390/430/低高で撮影し目視。旧PASS転記不可。

原則現在API優先、カードN+1/全ページ自動取得なし。SQLが必要なら親のみ新migration作成・隔離DB検証。親が共通dev3016管理。子build/commitなし。外部DB/push/Deploy/Edge/Cron/運用フラグ/alias変更禁止。

情報不足と0件、終了と個人敗北、予定とPresentを区別。新画像生成前提なし。承認済み構成はユーザー指定とリポジトリ仕様を照合し、外部モックが見つからない部分を架空の承認内容として扱わない。
