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

本番デプロイはリモートPC側で実施。ここでは本番未反映。
