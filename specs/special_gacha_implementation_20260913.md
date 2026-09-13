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

## Preview現行RPC互換修正

Preview正規Authorityは5引数無料再送wrapperから6引数（rate_version）本体へ移行済みでした。Special Migrationは6引数本体を検出して変更し、wrapperを保持します。6引数がない旧DBでは従来5引数本体を変更します。転送・版チェック・無料専用抽選・保存結果再送・Special入口・Pt読取のドリフト検出は維持しています。

SPECIAL_GACHA_VERSIONED=1 を指定した scripts/verify_special_gacha_release.mjs は、2026-09-13のPreview読取定義fixtureで同じ16購入パターンとSSR交換を検証します。無料3カテゴリの最新版成功、旧版初回拒否、完了要求の旧版再送、5引数互換再送、wrapper定義不変、Tutorial旧SSRプール維持、未知版AuthorityでMigration停止を追加確認します。日次無料のrarity選択helperのみ固定Rの契約fixtureで、確率再監査は対象外です。実DB適用は含みません。

## 抽選master参照の正本修正

Preview READ ONLYで、旧 skill_battle_master は8/12暫定枠（専用20件無効・ownerなし）、現在の戦闘Authorityは canonical_skill_master の2026-08-21版であることを確認。後者の20件は正本の名称・所有者・rarity・activation・cooldown・target・raw effect本文と一致しています。旧表へ所有者や能力を上書きせず、Special pool生成・専用判定・カタログ名称をcanonical_skill_master／canonical_equipment_masterに統一しました。装備は承認済み10 IDだけを採用し、旧表の専用19件を自動追加しません。master能力値に変更はありません。

旧skill表を無効・ownerなしにしたfixtureでも、5引数／6引数の双方でMigrationと購入16ケースがPASSしています。
