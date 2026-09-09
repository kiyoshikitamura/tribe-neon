# 第4工程 C検証報告

基準 `8665d29c113374e0f704832d8c9448a1d7f2336a`。検証は今回の専用worktreeで再実行し、旧PASSを今回の証拠へ転記しない。

## Setup計測監査

| 分類 | 確認内容 | 対応 |
| --- | --- | --- |
| 未実装 | `acquisitionAttribution.ts` が呼ぶ `record_kpi_acquisition_landing_v1` は固定migration群に定義なし | 本工程で新RPCを作らず、未実装として保持 |
| 未接続 | 追加 `WORLD_INTRO_VIEWED/SKIPPED` はSQL249の許可5event外。別session tokenを持つ経路で、既存KPIと結合されない | 親がSetupの追加呼出/importのみ除去 |
| 接続実装あり | 既存 `WORLD_INTRO_STARTED/COMPLETED` は `kpiInstrumentation` → `begin_kpi_acquisition_journey_v1` → `record_kpi_acquisition_observation_v1` | 定義・token・再送keyを保持。SKIPをCOMPLETEDへ読み替えない |
| 未検証 | 実HTTP/anon認証・DB永続化・本番KPI集計 | Mock UIは計測early return。表示PASSを計測実接続PASSにしない |

`scripts/raid-step4/verify-setup-measurement.mjs` 4群PASS。実 `kpiInstrumentation` をRPC test doubleへ接続し、同時要求で初期化1回/共有token、同eventの再送key不変、SQL許可event整合、Setupが既存経路だけを呼ぶことを確認。Supabase自体やHTTPの検証ではない。追加の未使用計測モジュールは削除していない。

## 既知post-loadout失敗

原因は旧boss fixtureと新Room活動参照契約の不一致。Room UI有効時、GameContextのHome案内は `useRaidRoomActivity` のtrackerを参照し、同期時に `list_raid_rooms_v1` のDTOを観測する。旧 `mock_db_raid_bosses` はこの経路で読まれず、未実装Mock RPCは有効Roomを返せなかった。

テストの期待するRaid→Guild→Mission順を保持し、旧boss rowを現在のRoom DTOの明示read fixtureへ置換。本人の参加資格や報酬、進行状態、運用フラグは製品都合で変えない。`post-tutorial-loadout-guide.spec.ts` は3016で2件ともPASS（6.5秒/7.0秒）。親のMock opt-inは一覧readのみを返す。実APIの参加や報酬の代替ではない。

## 画面・回帰

Nodeテスト242件PASS（domain110 / Browser29 / detail16 / top16 / top-data6 / activity16 / clear4 / useBattle20 / Street Result5 / ranking5 / cutover3 / 新pages表示5 / 新救援hook3 / 新実PG adapter・receipt4）。別枠はSetup契約4群、post-loadout Playwright2件。ログは `outputs/raid-step4/`。新機能追加後のuseBattle20件も最終再実行した。

新一覧導線で活動通知が更新されない回帰を発見。親が `observePage` を実装し、部分ページの観測を既存通知へ接続した。新しいページAPI fixtureでConnected実接続を検証し、ページ欠落だけでは終了判定せず、詳細の終了観測で解除する。別難易度/別ページの維持、新詳細/全一覧より古いページ破棄、認証切替後の旧応答破棄を追加検証してPASS。

救援hookは可視IDを重複除去して最大50件1RPC、disabled無取得、user/token/Guild切替で前データを即隠す、遅延応答破棄、取得失敗を成功0件へ変換しないことを3件で確認。

今回の隔離PGで出力された `actual-list.json` / `actual-enemy.json` / `actual-rescue.json` を実adapterへ通して検証した。敵技能はSQLと同じ現行HARD pool優先→専用→通常という選択をQAにも適用し、実SQL出力との一致を確認。未知参照、cursor不正、予定へのPresent混入を拒否。Resultは欠損から共有状態を推測せず、異なるRoom receiptを表示しない。MVPと既存continueControlの保持も実Resultで確認。

## 画面証跡

`docs/development/evidence/raid-step4/` にPNG181枚と各report.json。

- `pages/` 54枚: 375/390/430×844、390×600で選択/敵情報/一覧/救援/Result。主催・通常・救援、撃破・期限・取得失敗・長名・Guildなし。最後に先頭実技能表示を反映して再撮影。
- `integrated/` 28枚: 実RaidRoomBrowserで一覧20件→次ページ1件、選択タップだけでは作成しない、敵modalの実技能、明示確定→作成詳細の帰還を4viewportで確認。
- `result/` 32枚: 実BattleResultSummaryにMVP・receipt・既存continueControlを接続。個人敗北と確定時の共有開催中、撃破、期限後確定と共有HP非反映を4viewportで確認。Mockの復帰callbackは実ackを実行せず、ack成功/失敗・復帰保持はuseBattle等の回帰で別検証。
- `detail/` 59枚: 第3工程実部品を再撮影。390×844/600の参加者→既存PublicUserProfile→一覧へのscroll/focus復帰、モーダル1枚、44px閉じる、長名、多報酬スクロール、Present導線、下端hitを再確認。

C目視対象: `pages/selection-375x844-top.png`、`pages/enemy-390x600-bottom.png`、`pages/list-390x600-top.png`、`pages/rescue-390x600-top.png`、`integrated/enemy-375x844-top.png`、`integrated/selection-390x600-bottom.png`、`result/member-390x600-top.png`、`result/expired-390x600-bottom.png`。敵と主催者の識別、5体の顔と技能名、MVP/貢献の強弱、短高のscroll、固定footerとCTA分離を確認。横はみ出し・ページ例外なし。これはChromiumのエミュレーションで、物理端末受入ではない。

## 残件・担当境界

実HTTP認証/本番DB・Preview・物理端末は未検証。Setupの未実装landing metadata moduleは残し、SQL定義や計測定義を増やしていない。CのQA単体型検証PASS、IntegratedPages lint 0 errors/0 warnings。全体build/type/lint/最終commitは親担当。Cによる外部操作・commitはなし。

最終補足: hosts/8枚で実HomeTab/TribeChatModal CSSと同DOMクラスを使い、375/390/430×844と390×600の救援カード横幅を確認。実TribeChatModal統合ではなく明示Mockホストである。Home活動row全幅化、Tribe吹き出し内のCTAを目視。Result32枚は注意文UIフォント修正後、integrated28枚は初級制限文重複修正後に再撮影。最大50件外のstatusFor=idleも追加assertしてhook3件PASS。
