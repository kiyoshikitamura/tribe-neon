# iPhone 14 / Safari 実機指摘への修正

本番 `59be3c715defa33c61adbfb0e84f16778f34525d` に対する修正。作業基準 `c8811b3` は同リリースの記録追記先。

## 原因・変更

1. 導入SKIPがアゲハ案内まで飛ばしてNAME_INPUTへ進んでいた。WorldをSKIPした場合はAGEHA_INTROへ進め、次へで名前入力。アゲハ案内上のSKIPは名前入力へ進む。
2. キャラ抽選のPROCESSING/FLASHINGで旧共通街背景が先行していた。抽選開始時に表示カテゴリだけを保持し、キャラ抽選は無地スピナー→既存7街演出に統一。確定処理・RPCは変更なし。
3. 読み込みの二段階で文字結果へのボタンが瞬間表示されていた。通常読み込みはスピナーのみ、画像エラー時は再試行・文字結果への退避を維持。キャラ演出には旧共通演出の自動進行タイマーを適用しない。
4. 準備画面は固定240pxの立ち絵と下部CTAを同じスクロールへ積んでいた。非レイドの外枠を表示領域全体に合わせ、準備は内容のみスクロール・CTAは下部に常時配置。立ち絵・余白を縮小。
5. 行動枠がactionPresentationの存在を必須としていた。従来形式のtargetLine/skillCutInにも対応し、枠を内側2pxで描画。計算・タイムライン・useBattleは変更なし。
6. Resultの勝敗見出し43px・MVP260pxを縮小。非レイドResultは利用可能な高さに合わせ、次へを下端stickyにする。詳細表示・報酬確定待ち条件は維持。

## 検証

- Preview/Mock設定のNext build・型チェック：PASS。
- 変更コンポーネントと関連テストのESLint：エラー0。
- street battle integration契約：PASS。
- git diff --check：PASS。
- ブラウザ実行はChromium取得がタイムアウトして未完了。今回のスクリーンショットを修正後の実機PASSと読み替えない。
- world-intro-skip.spec.tsを新しいアゲハ経由へ更新。battle-live-presentation.spec.tsにCTA/Resultの画面内配置と行動枠の検証を追加。

## リモートPC Codexへの指示

1. この修正ブランチを取得。最新本番に後続変更があれば保持し、今回の差分を適用する。
2. `npm run typecheck`、`npm run build`と以下の関連ブラウザ確認に限定する。全体CIの既存失敗整理は今回の修正に混ぜない。
   - world-intro-skip：World SKIP→アゲハ立ち絵→名前入力。
   - キャラガチャ実経路：PROCESSING→FLASHING→READY、旧街背景・瞬間的な文字結果ボタンなし、7街3秒→TAP、画像エラー復帰。
   - battle-live-presentation：390×700 / 320×568、準備CTA・Result次へがスクロール前から画面内。詳細展開後も次へが操作可能。
   - 通常クエストの従来形式Replayで行動キャラ枠が点灯すること。
3. 指摘箇所が成立したらユーザー承認に基づきProductionへ反映し、配信SHA・deployment ID・本番確認結果を報告する。
4. レイド・DB・Edge・共有Preview aliasを変更しない。並走Raid `251dc03`のRoom復帰/Result後ackを上書きしない。この修正はuseBattleに変更なし。

引き継ぎ時点では本番未反映。リモートPC側での反映結果は下記。

## リモートPC検証記録

取得SHA: `eff2f35491efb078cf6f6495dfadadc97f071063`。確認時の本番は引き続き`59be3c7` / `dpl_8up8KQuqxybgbAC8mBNCM2vhudW9`で、後続の製品変更なし。製品コードは指定SHAそのまま、追加変更は以下の対象テストとこの記録のみ。

- 独立worktreeでPreview/Mockビルド・型チェックPASS。最初の作業ディレクトリでは前回の検証用worktreeがTypeScript対象へ入り、独立環境へ移して解消。製品設定・型検査除外条件は変更していない。
- 変更対象ESLint: エラー0。street battle integration契約: PASS。
- Chromium: world-intro-skip、battle-live-presentation、gacha-character-v3の16件PASS。実際のGameContext→CommonModalsを通るチュートリアル10連→育成・編成の1件もPASS。
- WebKit: 同範囲15件PASS。別途、実ガチャ導線1件PASS。補助のclock使用連打テスト1件（2/10→3/10期待）は旧製品コード`17fa2ce`でも同じ失敗を再現。既存失敗の修正は今回に混ぜていない。
- World SKIP→アゲハ画像→名前入力、3秒後TAP、画像エラーの再試行／文字結果復帰を確認。
- ガチャ実導線のDOM監視で旧共通街背景・正常読み込み中の文字結果ボタンが一瞬も出ないこと、スピナー表示を確認。
- 390×700 / 320×568で準備CTA・Result次へが初期位置から画面内、MVP詳細展開後も次へが画面内で操作できることを確認。スクリーンショットも目視確認。
- 従来形式の通常クエスト表示fixtureで行動者1名の枠が点灯し、2px内側に描画されることを確認。

WebKitはデスクトップの自動ブラウザであり、iPhone 14実機での再確認済みという意味ではない。今回の検証はローカルMockのみで、共有Previewの実データ・設定・Edgeを操作していない。`supabase/`と`src/hooks/useBattle.ts`は現本番から無差分。

## Production反映結果

- STATUS: **反映済み**
- 配信SHA: `3bdefedd9b49fbbadac5ca2bbc832fe10c1b9716`
- 製品コード: `eff2f35491efb078cf6f6495dfadadc97f071063`と同一。後続差分は対象テスト・記録のみ。
- Deployment ID: `dpl_73A7dsAKVLxBgFVuM9H4mLW6F3E6`
- 本番: https://www.tribe-neon.com/
- 固定URL: https://tribe-neon-kgkfs7za0-kiyoshi-kitamura.vercel.app
- ロールバック: `59be3c715defa33c61adbfb0e84f16778f34525d` / `dpl_8up8KQuqxybgbAC8mBNCM2vhudW9`

Production環境で新規ビルドし、APP_ENV=production / Mock=false / QA=falseを明示。固定URL確認後に本番ドメインへ切替。Previewビルドの昇格ではない。

本番でタイトル→開始選択、法的情報3ページ、QA5経路404、立ち絵・背景・エフェクト200、ガチャ／バトル両フォントdecode、準備画面・行動枠を含む修正CSSの配信を確認。戦闘CSSは遅延読込の別ファイルも照合した。pageerror=0、API接続先は`https://api.tribe-neon.com`。

切替直前・直後のalias比較で変更はゲーム本番3件（www、apex、tirbe-neon.vercel.app）のみ。KPI・共有Preview aliasは維持。レイド機能・DB構成・Edge・共有Preview実データに変更なし。全体CIの既存失敗整理は実施していない。

```powershell
npx --yes vercel rollback dpl_8up8KQuqxybgbAC8mBNCM2vhudW9 --scope kiyoshi-kitamura --yes
```

上記は復旧用の記録で未実行。本番実アカウントでの追加消費・iPhone 14実機の再確認は行っていない。
