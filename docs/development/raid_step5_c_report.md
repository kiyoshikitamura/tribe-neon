# 第5工程 C検証

統合候補SHA: 86853c6241085fc3fc2a8e46fcf25973b4e1e77e。親freeze通知後、このworktreeの候補で再実行した。実行中のテスト期待追随はC担当、製品共有sourceは親担当。

## 機械回帰

Node 255件PASS。内訳: Raid domain110 / Browser29 / detail16 / top16 / top-data6 / activity16 / clear4 / useBattle20 / Street Result5 / ranking5 / cutover3 / pages UI5 / 救援hook3 / pages adapter4 / shared UI5 / 初期装備8。別枠Setup計測契約4群PASS。scripts/raid-step5/run-regressions.mjs、outputs/raid-step5/regression-report.jsonと個別ログに記録。

Browserは初回15PASS/14FAIL。最終カードの『戦況を見る』に旧『レイドを開く』期待が残り、新しい敵カードに旧combobox操作、空表示の旧文言、JSDOM ResizeObserver欠如があった。さらに文字なしスピナー中のボタンを旧ラベルで再検索していたため、取得済み同ボタンに連打して抑止を検証する形へ変更。最終29PASS。以前の工程のPASSを本候補へ転記せず、今回の失敗と修正後実行を採用した。製品の参加/再送/報酬条件を弱める変更はしていない。

## 初期装備

統合されたCharacter完成版の既存 scripts/verify_initial_equipment_state.mjs を再実行し8ケースPASS。実GameContext TypeScriptの装備bootstrapブロックを実行する検証であり、複製実装のテストではない。全拒否、null応答、data+error、部分成功、全成功、キャラなし、反復失敗、保存済み再読込を確認。保存失敗時に仮ID所持行を表示せず、空なら選択と表示値をクリアする。実GameProvider全体/HTTP403/実Fresh保存成功とは区別。

## Setup計測契約の更新理由

第4工程の基準にはなかった、今回固定本番由来SQL250 landingとSQL251 WORLD_INTRO_VIEWED/SKIPPED、shared token実装が統合された。旧『未定義イベントのため表示呼出なし』期待を維持すると正しい本番契約を否定するため更新した。kpiInstrumentationとacquisitionAttributionを同bundleで実行し、landing初期化1回、STARTED/COMPLETEDの再送key、VIEWED/SKIPPEDがSQL251に存在して呼び出されること、全経路token一致を確認。計測定義や製品sourceの改変はCではしていない。実HTTP persistenceは未検証。

## 固定DB fixture

親承認により第4工程PG出力のtop snapshot/detail display/list/enemy/rescueの5JSONを固定fixtureとして利用し、候補の実parser/adapter/UIへ再投入した。SHA-256はoutputs/fixture-sha256.json。これは候補TSのadapter回帰であり、今回PG22群再実行やPreview/HTTP検証ではない。

## ブラウザ

Fresh Journey1、post-loadout2、CharacterHome8の計11件PASS。Freshは1.9分で通常のガチャ→自動編成→クエスト派遣→遭遇→戦闘→Result→アカウント連携→Home→Characterまで完走。専用 scripts/raid-step5/playwright.config.ts は既存configを継承し、親起動済みlocalhost:3017のみ利用する。最初の127.0.0.1ではNext dev originがブロックされ、boot preloader effectすら開始しなかった。localhostで正常起動を確認し再実行。製品不具合の修正や状態強制で迂回していない。

Freshは既存raid-character-fresh.spec.tsを使用し、canonical gacha/quest master初期投入と新規ユーザーの空Raid recovery読取fixtureのみ。進行やガチャ成功結果を強制しない。影響画面の画像はFreshおよびCharacter検証分を利用、181枚全面再撮影なし。

## 境界

実HTTP認証、Preview DB適用、実Fresh付与権限、物理端末、人による受入はC未実施。Cは外部変更とcommitなし。全体type/build/lintおよび最終commitは親担当。

影響画面17枚を docs/development/evidence/raid-step5/ に保存。C目視はCharacter375/低高長名、Fresh終了後Character390、Quest Result/MVP。立ち絵の全身、長名折返し、育成/Equipment/PARTYとfooter分離、MVPと報酬/次へ表示を確認。物理端末受入とは区別。E2Eでページ例外・画像取得失敗も0を確認。


## 今回の重点項目と検証層

| 項目 | 本候補で実行した検証 | 今回のブラウザ実測 |
| --- | --- | --- |
| 参加者→プロフィール→一覧復帰 | detail-ui.test.tsxの実プロフィール非重畳/scroll復元・取得失敗復帰（JSDOM） | build後next startの実RaidRoomBrowser/既存PublicUserProfileを390×600で往復。modal1枚、元scroll一致、44pxヘッダー閉じるを確認 |
| 多数報酬の本文スクロール | detail-ui.test.tsxの予定/発行済み区別、browser.test.tsxの発行明細/Present失敗再試行（JSDOM） | 同390×600で本文client433px/scroll7258px、幅364pxで横はみ出しなし、本文末尾と固定閉じるヒットを確認 |
| 救援リンク | pages-ui.test.tsxの終了後rescueID保持/別ref混入拒否、pages-rescue-hook.test.tsxの50件バッチ/認証切替/取得失敗、browser.test.tsxの同request再送/別user遅延遮断（JSDOM） | 今回は救援カードのブラウザ再撮影なし。第4工程181枚を参考とし、新候補のbrowser受入とは呼ばない |
| 同Replay・ack | use-battle-room.test.tsxのreload同Replay/同request、server履歴復帰、ack失敗保持、RESULT後ack成功と失敗の結果保持等20件。browser.test.tsxの遷移失敗後同Replay（JSDOM） | 今回の実ブラウザFreshはQuest導線。Raidの実HTTP start/resolve/ackは未実行 |

追加スクリプト: scripts/raid-step5/capture-raid-focus.mjs。build後のlocalhost:3017/qa/raid-detail、明示Mockデータ注入で実部品を操作。3枚とbrowser-report.jsonはevidence/raid-step5/raid-focus。C目視でプロフィール復帰後の長名行、報酬末尾のPresent/更新/閉じるの分離を確認。全画面再撮影やHTTP接続検証はしていない。今回PNGは合計20枚。
