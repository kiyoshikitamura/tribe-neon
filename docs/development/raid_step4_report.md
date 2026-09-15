# レイドUI 第4工程 — ローカル実装・統合検証

## 固定基準と到達点

基準SHA `8665d29c113374e0f704832d8c9448a1d7f2336a`。専用branch `codex/raid-pages-step4-20260909`、worktree `game03-tribe-neon-raid-pages-step4`。本報告を含むcommitが実装候補（完全SHAは最終チャットと `git rev-parse HEAD`）。別系統の後続commitを取り込まず、第1〜3工程・Character/Setup/ガチャの統合成果を保持した。最新本番同期済みとは扱わない。

実装、隔離ローカルPGでのSQL検証、実parser検証、Mock画面検証を実施。実HTTP認証・Preview接続・物理端末Safari・人による最終ビジュアル受入は未完了。コード・SQL・ローカルcommitまでの工程である。

## ページ別と担当

| ページ | 完成した内容 | 接続・確認の範囲 |
| --- | --- | --- |
| 敵選択（A/親） | 本日の2対象の既存背景/先頭画像、選択中先頭の使用スキル、難易度条件、討伐報酬予定、敵情報入口。選択タップと確定操作を分離 | 既存日次choices/新規受付を維持。新enemy readから実技能/予定を接続。画面はMock |
| 敵情報（A/親） | 現行7variantそれぞれの実5体、属性、実使用スキル。未取得と既知の空を区別 | SQL260と同じHARD override→専用2→通常2。現マスターと隔離PGを照合 |
| 開催中一覧（A/親） | 主催者の名前/リーダー/Guild、敵、難易度、HP率、期限、登録人数、本人の役割。閲覧と参加条件を分離 | 1ページ20件＋次ページ。難易度別の明示ページ取得。カード別人物RPC・全ページ自動取得なし |
| 救援（B/親） | 公開先別回数、依頼時Guildの説明、未確認要求の再送、Activity/Guild共通ビジュアルカード、終了済み表示と元識別子で遷移 | 既存依頼/参加正本を保持。可視feedの最大50識別子を一括read。現在所属で公開範囲判定、認証/所属変更時に前データを即隠す |
| Result（B/親） | 承認済みMVPを保持、個人勝敗/個人ダメージ/共有HP反映/累計/残HP/確定時戦況/報酬案内を整理 | 確定receiptを結果表示用に保存。個人勝敗やHPだけから共有撃破を推測しない。Replay/ack/元レイド帰還は既存処理 |
| 第3工程の参加者・報酬（C） | 多人数、長名、Guildなし、プロフィール往復と位置保持、短高で報酬末尾/閉じる/Present入口の再検証 | 修正済みの既存実部品を本候補で再撮影。実機受入は別 |

表示状態は実データのactive/cleared/expired/取得失敗/未取得を区別する。参加者数は登録人数でありオンライン数ではない。進行速度・勝算は表示しない。素材生成・バランス・戦闘計算・報酬資格の変更なし。

## 共通統合と既知FAILの解消

- 新しい一覧ページreadをActivity trackerへ接続した。部分ページは他難易度や別ページを消さず観測を追加し、新しい詳細/全体参照のrevisionを優先する。ページにないだけで終了と判断せず、期限/詳細の終了観測で通知を更新する。認証切替後の遅延応答を破棄する。
- Home Activityは救援カードを含む行だけ1列全幅にし、既存2列の狭い領域へ押し込まない。PCチャットのinline要素をflow要素へ変更した。
- Resultは `roomOutcome` を正本として `DEFEAT_SUCCESS→cleared`、`TIMEOUT_FAILURE→expired`、明示nullかつlate=falseのみ確定時active。欠落/未知は未取得。lateはbooleanのみを採用する。contextとreceiptのroomIdが一致した場合だけ戦況投影を使う。同Replayでは確定時点を表示し、現在の戦況と誤認させない。
- 旧post-loadoutの1件FAILは旧boss fixtureとRoom活動DTOの不一致だった。明示Mock read fixtureを補い、元の「Raid→Guild→Mission」の期待を保持して2件ともPASS。削除や無条件の期待値緩和なし。救援回数の旧1行表示assertは、同じ値を新dlの公開先別表示で確認するよう追随した。
- Setup計測は既存 `WORLD_INTRO_STARTED/COMPLETED` 契約を保持。固定SQLにない追加landing RPCと許可外 `WORLD_INTRO_VIEWED/SKIPPED` の経路を監査し、Setupからの追加呼出3行のみ除去。SKIPをCOMPLETEDへ読み替えていない。未使用計測モジュールは残し、HTTP永続化は未検証として引き継ぐ。

## 検証

- 全体型検証・Mock build・最終lintの結果は末尾に記載する。
- Raid関連Node **242件PASS**（既存関連230＋新page/hook/実DB応答adapter12）。同Replay復帰、ack成功/失敗、3役＋未参加、認証切替、登録/救援、期限終了、報酬/Present、ランキング廃止を含む。
- 共通UI/Typewriter/認証切替 **5件PASS**。`loadingLabel=""`、未指定、明示ラベルを区別して確認。
- 新表示parser **36件PASS**。隔離PGの実返値を使用し、20件上限/cursor/難易度/敵5IDと順序/技能欠落/救援IDと公開先/予定とPresent分離/取得失敗を確認。
- 隔離PostgreSQL17 **22群PASS**（新ページ8＋日次/集約10＋詳細4）。現在マスターseedと実migrationを使用し、技能fallback/欠損拒否、ページ境界、現在Guild、既存終了リンク、権限・副作用なしを確認。周辺schemaは最小fixture。HTTP認証の代替ではない。
- 既知FAILのpost-loadout E2E **2/2 PASS**。Setup **6/6**、ガチャ **11/11**。育成/編成/装備/canonical/台詞など **12 script成功**（既存Setup計測契約4群を含む）。件数を持たないscriptを個別test件数へ加算していない。
- SQL advisors: 追加functionに指摘なし。隔離fixtureの `build_server_battle_snapshot` / `resolve_canonical_reward_item` にsearch_path WARN2件。既存fixture由来で本SQLの警告ではない。外部DBへのadvisors実行なし。

実行コマンド、検証内訳と画面matrixは [C報告](raid_step4_c_report.md)、Character/Setup/ガチャ再検証とparserは [B報告](raid_step4_b_report.md)。過去候補のPASSは今回結果へ転記していない。

## 画面証跡・目視

`evidence/raid-step4/` に375/390/430×844および390×600の主要ページ・下端・状態別画像と測定JSONを保存。実Browser接続の選択→敵情報→明示確定→詳細、一覧20→次ページ、既存Result全体とMVP/帰還ボタンを確認。共通CSSを使う救援feedのホストfixtureは実アプリHTTP接続と区別する。

親目視で、初級の条件重複を除去し、Result説明文を既存本文フォントに戻してMVPとの強弱を調整した。敵・主催者の顔/背景、技能5体、短高の閉じる操作、報酬末尾/プロフィール復元を確認。エージェントのPNG目視とChromiumでの測定であり、人の実機受入PASSではない。

## Preview未適用SQLと適用順

前工程からの未適用3本を保持（内容変更なし）。正確な順序は次のとおり。

1. `20260908175140_raid_top_daily_authority.sql`
2. `20260908175143_raid_top_aggregate_api.sql`
3. `20260908181251_raid_room_display_projection.sql`

本工程の追加1本:

4. `20260909023226_raid_remaining_pages_projection.sql`

追加は表示read3RPC＋private helperだけ。新規挑戦/参加/戦闘/報酬正本を変更しない。前提250〜263と既存clear/rescue rules・マスター・公開projectionの実適用履歴を次工程で照合したうえで、上記順にSQL、対応フロントの順で適用し、認証/非公開Guild/日次境界/既存ReplayのHTTP縦通しを確認する。未適用時には取得失敗/未取得が表示される。報酬ルール未設定をMock数量で代用しない。

今回は外部DB適用・Preview配信・push・Deploy・Edge更新・Cron・運用フラグ・共有alias変更なし。隔離DB内の検証用設定は外部運用設定と分ける。配信前には、その時点の本番/他系統の後続修正との共通祖先・差分・競合を改めて確認する。

## 残件

- 実HTTP認証・セッション/所属切替、Preview接続、実端末Safari/safe area、人による最終ビジュアル受入。
- Setup追加landing計測の未実装経路を今後採用する場合の契約整理と実HTTP永続化。既存STARTED/COMPLETEDの定義は維持済み。
- 報酬スクロール/参加者プロフィール往復はローカル検証済み。端末受入の残件として保持する。
- 指定の残ページはローカル実装済み。新しいページ改修を勝手に追加せず、受入フィードバックは次工程で扱う。

## 親の最終確認

Mock production build PASS、全体型検証PASS。lint **0 errors / 1865 warnings**。同じコマンドで基準を再測定し0 errors / 1857 warnings。新規は既存画像のcrop/fallbackを伴う `<img>` 推奨警告9件、旧一覧画像の警告1件を除去（純増8件）。既存警告は保持し、新しい未使用変数/React fixture警告は解消した。詳細は `evidence/raid-step4/lint-comparison.json`。

lintは両候補とも `npx eslint . --ignore-pattern 'outputs/**'`。初回の通常 `eslint .` は未追跡のテスト生成CJSを走査して既存設定のplugin適用範囲エラーになったため、生成物だけ除外して再実行した。製品/テストsourceやルールを除外・緩和してPASSにしていない。

最終確認コマンド: `npm run build`（NEXT_PUBLIC_USE_MOCK_DB=true、APP_ENV=test、RAID_ROOM_UI_ENABLED=true、ENABLE_QA_TOOLS=true）、`npx tsc --noEmit`、上記lint。ローカルdev3016と隔離PG55462を検証後停止した。

## 変更ファイル

以下は製品・SQL・検証コードの変更一覧。報告/担当台帳と `docs/development/evidence/raid-step4/` の181枚のPNG・測定JSONを別途追加。

- `scripts/raid-step4/capture-detail.mjs`
- `scripts/raid-step4/capture-hosts.mjs`
- `scripts/raid-step4/capture-integrated.mjs`
- `scripts/raid-step4/capture-pages.mjs`
- `scripts/raid-step4/capture-result.mjs`
- `scripts/raid-step4/verify-pages-client.mjs`
- `scripts/raid-step4/verify-pages-pg.mjs`
- `scripts/raid-step4/verify-setup-measurement.mjs`
- `src/app/components/HomeTab.css`
- `src/app/components/HomeTab.tsx`
- `src/app/components/PCLeftChat.tsx`
- `src/app/components/SetupView.tsx`
- `src/app/components/TribeChatModal.tsx`
- `src/app/components/battle/BattleResultSummary.tsx`
- `src/app/components/raid/RaidEnemyRoster.css`
- `src/app/components/raid/RaidEnemyRoster.tsx`
- `src/app/components/raid/RaidEnemySelection.css`
- `src/app/components/raid/RaidEnemySelection.tsx`
- `src/app/components/raid/RaidRescueLink.css`
- `src/app/components/raid/RaidRescueLink.tsx`
- `src/app/components/raid/RaidResultDetails.css`
- `src/app/components/raid/RaidResultDetails.tsx`
- `src/app/components/raid/RaidRoomBrowser.tsx`
- `src/app/components/raid/RaidRoomConnectedBrowser.tsx`
- `src/app/components/raid/RaidRoomListCard.css`
- `src/app/components/raid/RaidRoomListCard.tsx`
- `src/app/components/raid/RaidRoomRescuePanel.css`
- `src/app/components/raid/RaidRoomRescuePanel.tsx`
- `src/app/components/raid/raidPagePresentation.css`
- `src/app/components/raid/raidPagePresentation.tsx`
- `src/app/components/raid/useRaidPageResource.ts`
- `src/app/components/raid/useRaidRescueCards.ts`
- `src/app/qa/raid-pages/IntegratedPages.tsx`
- `src/app/qa/raid-pages/RaidPagesHarness.tsx`
- `src/app/qa/raid-pages/page.tsx`
- `src/domain/raidPages.ts`
- `src/domain/raidResultPresentation.ts`
- `src/domain/raidRoomActivitySync.ts`
- `src/hooks/useBattle.ts`
- `src/utils/mock/mockRpc.ts`
- `supabase/migrations/20260909023226_raid_remaining_pages_projection.sql`
- `tests/e2e/post-tutorial-loadout-guide.spec.ts`
- `tests/raid-room/activity-sync.test.tsx`
- `tests/raid-room/browser.test.tsx`
- `tests/raid-room/pages-data-run-tests.mjs`
- `tests/raid-room/pages-data.test.ts`
- `tests/raid-room/pages-rescue-hook-run-tests.mjs`
- `tests/raid-room/pages-rescue-hook.test.tsx`
- `tests/raid-room/pages-run-tests.mjs`
- `tests/raid-room/pages-ui.test.tsx`
- `tests/raid-room/run-activity-sync-tests.mjs`
- `tests/raid-room/street-presentation.test.tsx`
