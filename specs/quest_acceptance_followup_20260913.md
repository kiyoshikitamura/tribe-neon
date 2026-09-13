# Quest差分FAIL 2件の修正・再配信依頼

対象Branch: codex/mission-journey-review-20260913
Base: 35dbd986c5864e44afd1df000ffcd02750a7c449

## 修正
1. Quest探索一覧のラベルを「地元一致」に統一。探索中詳細のボーナス内訳・実加算は維持。
2. 街選択後に初級が補完される原因は、通常UIを返した後も動作する親PatrolTabの旧初期選択Effect。
   自動補完をチュートリアル中だけに限定。未探索を開く際も以前の級・キャラ選択をクリアする。
   街選択時は級未選択、本人の級タップ後に敵・報酬・キャラクター選択CTAを表示。

## 検証範囲
- 修正した実Effectの本体を抽出してJavaScript実行: 7街すべて通常探索で未選択維持、チュートリアルでは初期補完維持。
- 一覧の短縮ラベル・詳細ボーナス内訳保持をソース確認。
- ローカル実行環境が起動不能のため、今回の型検査・ESLint・ビルド・実画面監査は未実施。
- 前候補のPASSを今回の未実施検証として流用しない。
- DB・Migration・Production・共有alias・環境変数は変更なし。

## Windows Codexへの依頼
本書を含む候補SHAを専用作業フォルダへ取得し、以下をお願いします。
1. Typecheck、変更2ファイルのESLint、Quest UI state/Battle Result liveness、buildを確認。
2. 専用Previewへ再配信。Supabaseは sufvuqdnqohpfzkwxohq。Migration再適用不要。
3. 探索一覧でレイジ/新宿・アゲハ/渋谷の両方が「地元一致」となること。
4. 未探索→街選択直後は級未選択で、敵・報酬・キャラ選択CTAが表示されないこと。級タップ後だけ表示されること。
5. 別の街へ選び直す、探索一覧へ戻って再開する場合も未選択。チュートリアルの初回探索は維持。
6. 既報の未検証（Fresh Characterバスト下CTA、複数一括受取、開催中Raid復帰/再案内）は引き続き未検証として管理する。
7. URL、SHA、Deployment ID、READY/HTTPと検証結果を報告。

専用Preview再配信依頼: 可（型・ビルド確認後）。
ユーザー一括実機確認依頼: 不可。差分Acceptance完了まで保留。
