# RAID-CHAR-B — Setup / Gacha統合レビュー

STATUS: VALIDATED（ローカルMock画面・対象回帰）。Human Acceptance / Preview接続完了ではない。

Raid `9fe5909c024f649c47ec8402409936cd79fd1a37`、Character `a02754c98c1d927e36ecdb46d7ac55541828a346` を固定3-way mergeした未commit統合候補で検証。Bによる製品コード変更・commit・外部操作はない。

## 採用差分と依存確認

- SetupView.tsx/.css: 世界導入SKIP、sessionStorage失敗時も画面遷移維持、NAME_INPUT到達後の旧timer上書き防止、OutlawButton利用。
- components/gacha/CharacterGachaPresentation.tsx/.css、gachaStandingBounds.json: Character専用演出、7エリア導入、結果順序、単発/10連、レアリティ表示、詳細・一覧、再表示、画像再試行と文字fallback。
- useGacha.ts: scoutPresentationCategory状態。GameContextでは要求開始時にcategoryとresults消去を同一flushSyncへ、CommonModalsはCharacterだけ新演出へ接続。抽選/確定は既存処理であり演出再表示で再抽選しない。
- acquisitionAttribution.ts / acquisitionAttributionMetadata.ts: 導入計測の補助（下記の未接続依存あり）。
- QA presentation harness、qaHarness scenarioと新Gachaテストを保持。
- 上記B専有製品ファイルは採用元Character SHAと一致し、Raid固有の処理を混入していないことをgit diffで確認。
- 新台詞resolverとJSON、既存SSR台詞master、キャラクター画像/背景、TNTetsubin fontパスを参照。60キャラの背景対応は静的検証PASS。

## 今回実行した検証

3015の親管理Mock dev serverを再利用、Chromium workers=1。

```powershell
$env:PLAYWRIGHT_PORT='3015'
$env:PLAYWRIGHT_REUSE_SERVER='true'
node node_modules/@playwright/test/cli.js test tests/e2e/world-intro-skip.spec.ts tests/e2e/gacha-character-v3.spec.ts --workers=1 --reporter=line
```

**17/17 PASS（約1.3分）**。

- Setup: 375/390/430×844、390×667。即SKIP/二重tap、reload/back、通常導入、遷移timerの上書き防止、登録後の既存tutorial接続。
- Gacha: 375/390/430×844、320×568。10件順序、詳細、tutorial CTA、単発閉じる、SSR/非SSR、連打、4→3エリア導入、reduced motion、keyboard、cold image待ち、失敗時再試行/文字結果。
- `node --experimental-strip-types scripts/verify_gacha_character_town_backgrounds.mjs`: PASS、60人/7エリア/欠損0/誤対応0。
- `verify_ssr_gacha_quotes.mjs`: FAIL。台詞データ検証自体は通過するが、旧CommonModals内の `resolveSsrGachaQuote(tutorialRevealResult?.characterId)` / tutorialSsrStageを正規表現で要求している。実装はCharacterGachaPresentationのresolveCharacterGachaQuoteへ移動済み。製品SSR演出E2EはPASS。旧内部構造の静的期待更新は親へ報告済み。
- OutlawButtonの空loadingLabel/未指定fallbackの実部品検証は親担当。Bは実装が `loadingLabel ?? "処理中…"` であることをレビュー済み。

## 今回撮影した画面

共通保存先: [evidence/raid-character-integration-20260909](evidence/raid-character-integration-20260909/)。旧証跡は転記していない。

375×844、390×844、430×844、390×600それぞれで、`setup-prologue-*`, `setup-guide-*`, `setup-name-*`, `gacha-summary-*`, `gacha-reveal-*` の **20枚** を撮影。全20枚を目視した。

[390px導入案内](evidence/raid-character-integration-20260909/setup-guide-390x844.png)、[390pxガチャ一覧](evidence/raid-character-integration-20260909/gacha-summary-390x844.png)、[390×600ガチャ詳細](evidence/raid-character-integration-20260909/gacha-reveal-390x600.png)。

画像の顔/頭部、名称/台詞、結果10件、SKIP/次へ/編成へ進む/一覧へ戻るの配置を確認。画面幅ごとの横はみ出し0。390×600でも主要操作は下端に収まり、文字の重なりなし。低高さでは立ち絵領域が縮小する既存レスポンシブ挙動を確認。

計測値は [setup-gacha-metrics.json](evidence/raid-character-integration-20260909/setup-gacha-metrics.json)。撮影スクリプトはローカル `outputs/b-setup-gacha/capture.mjs`。ソフトウェアキーボード・実iPhone/Androidのsafe-areaは未検証。

## 発見した未接続依存

Character採用元の `src/utils/acquisitionAttribution.ts` は `record_kpi_acquisition_landing_v1` を呼ぶが、固定統合候補のmigrationに定義がない。既存 `kpiInstrumentation.ts` は `begin_kpi_acquisition_journey_v1` と別storage tokenを使用している。

さらに新 `WORLD_INTRO_VIEWED` / `WORLD_INTRO_SKIPPED` はSQL249 `record_kpi_acquisition_observation_v1` の許容イベント外で、現定義のままなら22023。追加導入計測は本候補のSQLでは接続成立しない。Mockはearly returnし、送信失敗も画面遷移を止めないので、Setup E2EのPASSを計測接続PASSとしない。親へ報告済み。BはSQL/本番/運用変更を行っていない。

全体型/lint/build、共有merge最終判定、他系統回帰は親/A/Cの担当。最新本番への同期・公開・実機Human PASSを意味しない。

## 追加担当: SSR静的検証の移動先追随

親の追加指示により `scripts/verify_ssr_gacha_quotes.mjs` のみ更新した。製品コード/SQLは変更していない。

旧FAIL原因はCommonModals内の旧SSR実装名への固定regex。新検証はCommonModalsから共通CharacterGachaPresentationへの接続、canonical IDでの台詞解決、初回/後続SSRのQUOTE gate、tapによる全文表示→REVEAL、名前/IDを出さないpre-reveal枝を確認する。

SSR10人・有効10件・固定台詞・欠落/重複/未知IDの元検証を保持。さらに追加台詞がSSR正本を上書きしないことも検証する。

再実行 `node --experimental-strip-types scripts/verify_ssr_gacha_quotes.mjs` は **PASS**（productionSsr 10 / enabledQuotes 10 / duplicate 0 / missing 0 / unknown 0）。上記旧静的テスト不整合の残件は解消済み。

## TypewriterText修正後の最終Setup回帰

親が共有TypewriterTextのrender中親更新を修正した統合候補で、2026-09-09に `world-intro-skip.spec.ts` のみ3015再利用・workers1で再実行した。**6/6 PASS（40.4秒）**。

375/390/430×844、390×667の即SKIP/二重tap/reload/back、通常導入、scene transition後のtimer上書き防止を再確認。Bによる製品追加変更なし。この再実行を修正前の17件PASSと区別する。
