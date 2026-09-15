# 次版Preview工程 2026-09-13

## 配信

GitHub保存済み93c07a92be7289c4d3565343499196ffdefda2f4に対し、既存Vercel連携の自動配信成功を確認。
URL: https://tribe-neon-1pbm42sw2-kiyoshi-kitamura.vercel.app
GitHub deployment: 6420952277 / Preview – tribe-neon / success。
HTTP200、公開JS15件のSupabase URL参照はsufvuqdnqohpfzkwxohqのみ。
直接配信CLI認証・環境ファイルはこの作業環境にないが、自動配信経路は利用可能。
このSHAのSpecial SQLは後述の互換修正前であり、最終受入候補ではない。

## 実DB受入（Preview限定）

全4件の事前一括試行でSpecialの旧5引数想定が現6引数Authorityと不一致となり停止。全件rollbackし、未適用状態を再確認。
Special以外の3件は実DBでrollback試行PASS後に適用。

|Repositoryファイルversion|Preview履歴version|対象|
|---|---|---|
|20260913105642|20260913114154|quest_raid_encounter|
|20260913105839|20260913114209|billing_paid_pack_lots|
|20260913111028|20260913114321|billing_checkout_mode_contract|
|20260913105913|20260913114919|special_gacha_release_contract（現行Authority互換修正後）|

MCP適用により実行時versionが付くため、履歴nameは元のversion付き名称を保存して対応させる。元ファイルversionだけで未適用と判断して再実行しない。

- Encounter：既存KPI qa対象を使い、トランザクション内だけ設定を有効化・仮報酬を設定。既存実Raid登録RPC、同要求で同じ開催ID、ackをPASS。全変更rollback。実戦・救援・撃破の実画面PASSではない。
- Billing：既存KPI qa対象で実注文予約RPC→テスト形式sessionによる配送→再送を実行。5品目の購入lot、120日期限、再送増量なしをPASS。全変更rollback。Stripeは呼んでおらず、実カードテストPASSではない。
- Encounterは無効、追加報酬0件、遭遇記録0件に戻っていることを確認。
- Security advisorの新規対象を照合。Encounter内部表は意図的に直接権限なし・RLS policyなし、入口RPCは所有者検証あり。購入lotは匿名Authを含む自己所有者だけ読取を許可。これらを不要な公開権限追加で解消しない。

## Special互換修正

6引数の無料rate_version Authorityを検出し本体へ適用。既存5引数replay wrapperは変更しない。旧5引数構成も保持。ドリフトガードを残す。
次の実DB試行で専用Pool照合が停止。旧skill_battle_masterは暫定データであり、専用20件がdisabled。実戦正本canonical_skill_masterにはowner・名称が存在するため、参照元を正本へ修正する。能力値変更・旧masterへの無断有効化は行わない。

上記2件を修正後、実Preview rollback試行PASS、Special Migration適用完了。
専用スキル20件・専用装備10件、属性SSR4件／6件、各ガチャのレアリティ合計100を実DB確認。
KPI qa対象・トランザクション内の仮残高とOPEN設定で、4ガチャ×DIA／Ticket×1／10連の16条件を実RPC実行。全ケース同requestの再送結果一致・追加抽選なしをPASS。すべてrollbackし、仮残高・取得物・抽選履歴・公開設定を残していない。実画面やStripe決済の確認とは区別する。

4件の適用とDB差分検証は完了。前節の旧SHAにこのSpecial SQL修正を含めた後続候補を保存する。DBの特定機能を利用可能にする公開設定は別途行う。

## 設定・仕様待ち

- 課金APIはHTTP200 / available:false。配信側のStripe Sandbox設定確認が必要。秘密値の提出・Repository保存を求めない。
- Encounter率・保証・エリア・難度・追加報酬、DIA内訳・交換先期限、Special10連と既存Ptの扱いは `next_release_decisions_20260913.md` で提案。
- 専用スキル20件の台詞候補は `exclusive_skill_dialogue_proposal_20260913.md`。全件未承認。
- 承認済みSSRモック本文は取得・照合できた。ローカル再生未確認。目元正規化・透過3件・本体演出は継続。

Productionへの操作なし。次版の一括実機確認依頼はまだ不可。
