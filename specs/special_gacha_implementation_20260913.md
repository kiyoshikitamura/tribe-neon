# スペシャルガチャ実装・統合引継ぎ

2026-09-13。基点 a70421643702e47a88366ef9eea952f435ef2990。
状態：ローカル実装・限定検証完了。Preview配信・実DB適用・実機受入は未実施。
正本：monetization_release_20260912.md。旧見積り・旧商品・旧200Pt仕様へ戻さない。

## 実装

- 正義／悪、秩序／混沌の2キャラガチャ。全レアリティで属性を限定。旧character_release_masterと現行正本の不整合を避け、canonical_character_master（2026-08-21）を参照。
- キャラ300ダイア、スキル／装備200ダイア。1連／10連、SP券1枚／10枚。キャラ2種は同一SPキャラ券。
- 属性CTA→名前付きダイアログ→通貨／回数→確認→既存演出。Normal/Tutorial画面を保持。
- ガチャ可用性はSPECIAL_GACHA状態をAuthorityとし、Stripe接続可否と分離。
- 個別提供割合・価格・共通Ptはget_special_gacha_catalog()でサーバーから取得。
- スキル専用SR10・SSR10、装備専用SSR10を既存masterから投入。専用はNormalへ投入しない。
- 抽選は既存rarity抽選→汎用／専用pool→pool内均等。正本の実効率を維持。
- SSR限定100Pt交換。余剰Pt保持。交換はrequest IDによる再送復元と別内容再使用拒否。
- 同一ユーザーのSpecial抽選と交換はusers行ロックから処理しPt表示の競合を抑止。
- CHAR_SPECIALはTutorial保証元poolを維持し、旧混合Specialの直接抽選を停止。

## DB差分

`20260913105913_special_gacha_release_contract.sql`（Supabase CLI生成）。
既存抽選RPCの5引数版に局所patchを行い、既存重複時処理・Mission・演出用結果構造を保持。
想定定義が異なる場合はmigration自体を停止する。配信時にlive定義との照合が必要。
Normal無料6引数ラッパーは変更しない。Tutorial抽選関数も変更しない。
新規：Special pool group、交換receipt、カタログ取得、冪等SSR交換。
公開Flag、既存ユーザー資産、既存Pt残高、通常ガチャ率を直接書き換えない。

課金レーンの購入ロットはuser_items更新triggerで接続する契約。SP券の既存quantity減算を維持しているため、ガチャ側の新規消費hookは不要。有償DIA内訳未FIXは課金レーンで管理。

## 検証

- TypeScript：PASS。
- 変更UI/domain ESLint：0 errors。GachaTab既存警告7件。
- `verify_special_gacha_release.mjs`：PGliteによるローカルPostgreSQL実行PASS。
  - 既存実RPCを読み込み、候補migrationを適用。
  - 4ガチャ×DIA／SP券×1／10連＝16条件、同request再送の結果・残高・券・Pt一致。
  - CASH／FREE／NULL拒否、2〜9連拒否、旧混合キャラSpecial拒否。
  - 全rarity属性整合、SSR人数4／6、専用SSR実効率4.8%／6%、pool欠落防止。
  - SSR限定100Pt交換、再送・別対象再使用・SR拒否・余剰・不足・旧内部RPC権限。
  - Normal pool不変、3カテゴリ無料10連／CASH単発の実行とSpecial Pt非加算。
- `verify_gacha_stage1_normalization.mjs`：PASS。
- 旧 `verify_gacha_phase6b_contract.mjs` はCOMING SOON固定文言を要求しFAIL。基点GachaTabにも当該文言が存在しない既存のテスト仕様不一致。今回の公開状態テストは上記カタログ／閉鎖時RPC拒否で実行。

実行例：`PGLITE_MODULE=/tmp/special-db-check/node_modules/@electric-sql/pglite/dist/index.js node scripts/verify_special_gacha_release.mjs`。
PGliteは検証用ツールとして別ディレクトリに導入し、ゲーム依存には追加していない。
assetデータは専用IDとrarityのfixture、characterは現行canonical JSON masterを使用。実DB全体・本番ユーザーによる検証を意味しない。

## 親での統合／残項目

1. GameContextのhandleScout ID投影、handleExchangePityRewardのみ変更。他レーンのContext変更とは親で統合。
2. 課金lot trigger＋ガチャのSP券使用をPreviewで通し検証。
3. 実DBのガチャ定義・個別ID・営業状態とmigration drift guard照合、Preview適用後の全16条件。
4. 実画面の2属性CTA・確認・演出・割合・100Pt交換・二重タップを確認。
5. 専用SSR演出／素材は別レーン。ガチャ画像は既存カテゴリ画像を継承。
6. 10連追加保証／割引は未承認のため新設していない。既存各枠独立抽選を保持。
7. 既存Pt残高は換算・削除せず保持。公開時の移行承認は正本の残項目として管理。

Production、Preview、共有alias、環境変数、実DB、決済への変更はなし。
