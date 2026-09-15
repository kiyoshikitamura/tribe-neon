# レイドトップ 第1工程 統合報告

状態: IMPLEMENTED / VALIDATED。HUMAN_ACCEPTANCE は実機確認待ち。

- 基準SHA: `70cb1f28263e5b23399709d1b4b3a7d0e96283e2`
- 実装ブランチ: `codex/raid-top-polish-step1-20260909`
- 基準ブランチ: `codex/raid-room-pc-step2-20260908`
- 元checkoutは基準SHAのまま。後続commitなし、未追跡outputs/は取り込まず、基準から専用worktreeを作成した。実装SHAは本報告を含むcommitを参照。

## 担当別成果・変更ファイル

A: `src/app/components/raid/RaidTop.tsx`, `RaidTop.css`。参戦中、横送り救援、2エリア入口、全体一覧入口を既存共通UIと素材で実装。0件は省略、未取得/失敗/読込を区別。HP率・期限・登録人数を使用し、戦況を推測する文言は追加していない。画像欠損は中立fallback。顔アイコンは既存表示メタデータで調整。

B: `src/domain/raidTopAssets.ts`, `raidTopData.ts`, `src/app/components/raid/useRaidTop.ts`。現行7エリア・各5体を照合。最大20件の一括表示契約、未知/未所属の区別、本人切替・遅延応答破棄、帰還refreshを実装。API対応は [データ契約](raid_top_data_contract.md) を参照。

C: `src/app/qa/raid-top/`, `scripts/raid-top/capture.mjs`, `tests/raid-room/top-ui.test.tsx`, `top-run-tests.mjs`。12シナリオ・7エリアのMockと画像証跡。既存 `browser.test.tsx`, `activity-sync.test.tsx`, `presentation.test.mjs` は承認文言と一覧の明示取得に期待値を追随。

親: `src/domain/raidTop.ts`, `RaidRoomBrowser.tsx`, `RaidRoomConnectedBrowser.tsx`, `RaidRoomBrowser.css`, `src/app/components/RaidTab.css`, `src/domain/raidRoomPresentation.ts`。契約の先行固定、既存選択/確認・詳細・救援導線への統合、全一覧の初期無条件取得の解消、帰還詳細の重複取得防止、視覚タイトル抑制、初級文言を総合力制限なしへ変更。担当契約・release_board・本報告を整備。

## 接続状況

既存RPCにつながる一覧/詳細、救援参照を保持した参加、敵選択後の確認、戦闘・報酬導線を保持。トップのタップだけでは挑戦を確定しない。

**トップの参戦中/救援カードと本日の2エリアはMockのみ。** 既存RPCには本人参加・救援対象・主催者Guild等の集約参照がなく、直接テーブル参照も許可されていない。製品の既定loaderはunavailableを返し、人物/所属/参加状態を仮データで埋めない。既存の全体一覧入口は利用可能。

新レイドの対象取得と挑戦受付に共通の日次2エリア正本が存在しない。旧ローテーションを流用せず、クライアント抽選もしていない。次工程で日次正本、受付時検証、認証済み一括readを実装してloaderへ接続する必要がある。素材不足なし。

## 検証

- 全体型検証 `npm run typecheck`: PASS。
- ローカルMock `npm run build`: PASS（NEXT_PUBLIC_APP_ENV=development, NEXT_PUBLIC_USE_MOCK_DB=true, NEXT_PUBLIC_RAID_ROOM_UI_ENABLED=true, NEXT_PUBLIC_ENABLE_QA_TOOLS=false）。プロセス内環境のみ、設定ファイル・運用設定は変更なし。
- 新規トップ16件、関連既存189件: PASS。親がトップ16/Browser29/Activity14を最終統合後に再実行。トップテスト実行時にReact act警告が1件あるがFAILなし。
- 変更対象eslint: エラーなし。既存方式のimgに関するNext警告は許容。
- 390px/412pxのレイアウト・タップ領域・内部スクロール・一覧入口のフッター非重なりを機械確認。親が最終画像の情報の強弱、画像、文字量を目視確認。
- MVP/Result、同Replay復帰、ack成功帰還/失敗保持、救援資格、報酬/Present、順位廃止、難易度制限は関連既存回帰で確認。戦闘計算・報酬条件・24時間期限・日付またぎの処理は変更していない。

詳細は [検証記録](raid_top_validation.md)。画像は [上部](evidence/raid-top-step1-20260909/top-single-390.png)、[下部](evidence/raid-top-step1-20260909/top-single-lower-390.png)、[横送り](evidence/raid-top-step1-20260909/top-multiple-rescue-390.png)。Mock操作ヘッダー/帰還ボタンはQA専用。

## 未完了・次工程

- 日次正本と本人参加/救援の一括データ接続。実データでのトップ表示は未完了。
- 人による実端末操作、承認モックとの最終受入、実戦闘からの縦通し帰還確認は未完了。機械PASSをHuman PASSとしない。
- 報酬ダイアログのスクロール、参加者プロフィール遷移不具合を残件として保持。
- 全体一覧、戦況詳細、敵選択、参加者、救援、報酬、Resultの全面改修は次工程。
- push、Deploy、DB適用、Edge更新、Cron、運用フラグ、共有alias、本番変更は未実施。追加ZIPなし。
