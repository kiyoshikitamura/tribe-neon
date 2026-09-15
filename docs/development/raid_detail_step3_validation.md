# レイド戦況詳細 第3工程 C検証

基準 `4e50a455947d837df66b4ecc64f755a13b8f83ff`。CはQA/fixture/test/script/evidenceのみ、commitなし。最終SHAは親担当。

## 実装・機械検証済み

- `/qa/raid-detail`: 非Productionかつ `NEXT_PUBLIC_USE_MOCK_DB=true` のみ。既存HubPage/RaidTab.css、実RaidRoomDetail/RaidRoomDialogs/報酬Panels/PublicUserProfileを使用。
- 実Browser統合チェックで既存RaidRoomBrowser/controller/loadDisplay/参加者取得/出撃準備actionを通す。人物・戦況・報酬数量は明示Mock、敵画像/名前/エリア/報酬アイテムは現行マスターを参照。
- 17シナリオ: owner/member/rescue/not_joined/cleared/expired/loading/error/unknown/many/long-name/no-guild/reward-unconfigured/reward-planned/reward-issued/reward-error/profile-error。
- 390x844と390x600。実HubPage内容幅362px、唯一の内部スクロール。詳細12状態の上下、20参加者の長い名前、報酬18品目の予定/発行済みを撮影。
- プロフィール表示中に参加者dialogを重ねず、閉じると同じ参加者・scrollTop・focusへ戻る。実PublicUserProfileと実Browser統合の両方で確認。
- 報酬本文だけスクロール。上下で閉じるCTAがhit test成功。レイド専用header close44x44以上、通常BOXへの受け渡し後dialogが1枚であることを確認。
- 予定報酬と発行済みPresentを別sectionへ表示。未設定/未取得/失敗を予定なしや受取済みにしない。受取済み/未受取をfixtureで確認。
- フェード途中の初回画像を破棄し、画像decode終了とanimation完了状態で最終撮影した。

## テスト結果

C新規detail **16件PASS**。4roleと参加者権限、lifecycle/失敗/未知、文字なしspinner、実プロフィール往復・失敗、予定/発行済み分離、実PG display返値→実parserの縦結合（予定へのPresent混入・別room返値を拒否）。

関連既存 **189件PASS**: Browser29、clear reward4、useBattle20、Street4、activity14、ranking5、UI cutover3、domain .mjs110。C合計205件。第1/2工程topテストは親が別途実行。

既存期待追随は新表示に限る。Browser試験に実product同様currentUserIdを設定し、参加者権限のdisabled条件を維持。最低総合力表示は選択画面で引き続き確認。SSRは画像待ちspinnerの同一HTML/hydration非不一致と期限跨ぎの更新を確認。旧Room文言の変更、画像APIのJSDOM double追加も実施。

C対象eslint **0 error/0 warning**、全体 `tsc --noEmit` PASS。Mock buildと追加SQL4群は親担当。

## 画面証跡

`docs/development/evidence/raid-detail-step3-20260909/`。

優先画像:

- `integrated-member-844-top.png` / `integrated-member-844-bottom.png`: 実Browser詳細と既存準備導線。
- `integrated-member-600-bottom.png`: 短画面の下部操作。
- `integrated-participants-600.png` / `integrated-profile-600.png` / `integrated-participants-restored-600.png`: 実Browserでの一覧往復。
- `reward-planned-600-top.png` / `reward-planned-600-bottom.png`: 長い予定報酬のスクロール。
- `integrated-reward-600-top.png` / `integrated-reward-600-bottom.png`: 実Browser発行済み表示。
- `browser-report.json`: 画面幅、本文scroll、dialog数、scroll復元、close寸法とhit、Present導線の結果。

C目視: 敵の主画像と名前、主催者/本人role、HP/戦況、3入口の強弱を識別できる。短画面でも長い参加者名と貢献行がカード幅内に収まり、顔cropが識別可能。予定報酬はアイテム画像と数量が読める。常設closeで長い報酬から戻れる。A/B/親も各画面を目視レビュー。

## 再実行

```powershell
$env:RAID_TEST_RUNTIME_DIR = '<既存esbuild/jsdom/React Testing Library runtime>'
# 親の隔離SQL試験で outputs/raid-detail/actual-display.json を生成後
node tests/raid-room/detail-run-tests.mjs
node tests/raid-room/run-browser-tests.mjs
node tests/raid-room/run-clear-reward-tests.mjs
node tests/raid-room/run-use-battle-room-tests.mjs
node tests/raid-room/run-street-presentation-tests.mjs
node tests/raid-room/run-activity-sync-tests.mjs
node tests/raid-room/run-ranking-retirement-tests.mjs
node tests/raid-room/run-ui-cutover-tests.mjs
node --test tests/raid-room/*.test.mjs
# ローカルMock dev起動後。必要ならRAID_DETAIL_QA_URLでURLを指定
node scripts/raid-detail/capture.mjs
```

## 実機確認待ち・境界

人の実端末/Preview接続、実認証でのプロフィール/Guild/DM/Present往復と実戦闘帰還は未実施。機械PASSとエージェント目視をHuman受入PASSにしない。

QA部品モードの主操作はMock受け渡し。実Browserモードは既存出撃準備callbackまでを確認し実戦闘しない。MVP/Result・同Replay再読込・ack成功帰還/失敗保持・報酬資格は既存回帰で保持を確認。今回の報酬スクロール/参加者プロフィール不具合はローカル実部品と実Browserで再現条件を検証済み、実端末受入を残す。

参加者情報取得は実権限を維持。未参加者に参加者一覧を開放しない。報酬判定の厳密な比較、戦闘計算、24時間期限、日次対象、DB/Edge/Cron/運用設定はC変更なし。
