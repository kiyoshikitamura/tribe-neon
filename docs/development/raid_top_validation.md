# レイドトップ 第1工程 ローカル検証

基準: `70cb1f28263e5b23399709d1b4b3a7d0e96283e2`。実装SHAは親最終commitで報告。

## 実装・機械検証済み

- C専有の `/qa/raid-top` は `NEXT_PUBLIC_USE_MOCK_DB=true` かつ非Production QA許可時だけ利用可能。人物・戦況は確認用Mock、敵名・7エリア背景・各5体は現行マスターを参照する。日次fixtureは指定2エリアで、独自抽選ではない。
- 12シナリオ: empty/single/multiple/loading/error/unavailable/ended/long-name/no-guild/broken-image/unknown/returned。multipleの参加roleは主催/通常/救援。endedは撃破/期限終了。
- 実HubPageとRaidTab.cssを再利用。390px viewport、製品content幅362px、header/footerを除いた唯一の内部スクロールで撮影。412pxも確認。
- 全シナリオの横はみ出しなし、トップ内全button幅/高さ44px以上、最下部一覧CTAのelementFromPointヒット成功、読込ラベルなし、視覚タイトル非表示を機械確認。
- 救援カードの対象ID/救援参照が正しいこと、敵タップは選択callbackのみ、帰還MockでHP再表示を確認。実controller+RPC adapterの救援参加回帰で公開参加RPCを呼ばず `join_raid_room_rescue_v1` に元rescueIdを渡す。
- 新規top-ui 16件PASS: 素材存在、0/1/複数、未取得/失敗、role、終了状態、導線、一括境界、日次拒否、本人切替と遅延破棄、Connected帰還refresh、明示browse時だけ一覧取得。
- 関連既存回帰PASS: .mjs 110件、Browser 29件、activity sync 14件、useBattle 20件、Street presentation 4件、clear reward 4件、ranking retirement 5件、UI cutover 3件。MVP/Result、同Replay復帰、ack失敗保持、報酬/Present、power gate、救援資格を含む。既存期待文言のみ承認表示に更新し、activity初期全一覧取得期待を明示browse後に変更した。
- 型検証・Mock buildは親担当。Cはcommit/push/配布ZIP/外部更新なし。

## コマンド

```powershell
$env:RAID_TEST_RUNTIME_DIR = '<esbuild / jsdom / React / Testing Library の既存テストruntime>'
node tests/raid-room/top-run-tests.mjs
node tests/raid-room/run-browser-tests.mjs
node tests/raid-room/run-activity-sync-tests.mjs
node tests/raid-room/run-use-battle-room-tests.mjs
node tests/raid-room/run-street-presentation-tests.mjs
node tests/raid-room/run-clear-reward-tests.mjs
node tests/raid-room/run-ranking-retirement-tests.mjs
node tests/raid-room/run-ui-cutover-tests.mjs
node --test tests/raid-room/*.test.mjs
# ローカルMock dev server起動後、必要ならRAID_TOP_QA_URLを指定
node scripts/raid-top/capture.mjs
```

## 画面証跡・目視

`evidence/raid-top-step1-20260909/` の `top-single-390.png`（上部）、`top-single-lower-390.png`（2エリア/一覧）、`top-multiple-rescue-390.png`（横送り）、`top-long-name-rescue-390.png`（長い名前）、`top-broken-image-rescue-390.png`（画像欠損）を優先参照。全12シナリオの上部・下部と救援の存在するシナリオの救援位置、7エリア素材を保存。`browser-report.json` に画面幅/タップ寸法を記録。

C目視: 敵の主画像、敵名、HP、参加情報の強弱、日次2エリアの違いを識別できる。名前は長文を省略してカード幅維持。下部の一覧CTAはfooterより上へスクロールできる。親/Aも目視レビュー。初回fullPage撮影はglobal overflowで下部が空白になったため、実シェル内のスクロール位置別viewport写真へ差替済み。

## 実機確認待ち・次工程

- 人の実端末でのタップ/スクロールと承認済みモックとの最終受入は未判定。ブラウザ機械PASSをHuman PASSとしない。
- 本番の日次2エリア/本人参加/救援一覧一括read正本が未接続のため本番トップはunavailable表示。Mockデータを本番へ埋めない。取得・挑戦受付が同じ日次正本を参照するサーバー差分が必要。
- 戦闘/報酬/24時間期限/日付またぎは変更しない。実戦闘帰還は既存useBattle回帰とConnected refreshの機械試験で確認、実端末での一連の帰還は未確認。
- 報酬ダイアログのスクロール不具合、参加者プロフィール遷移不具合は残件。全体一覧/戦況詳細/敵選択/参加者/救援/報酬/Resultの全面改修は次工程。
