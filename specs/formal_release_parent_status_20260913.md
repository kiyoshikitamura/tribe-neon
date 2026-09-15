# GAME03 次版統合候補 / 2026-09-13

本書は初回統合時の記録。後続のPreview適用・実RPC結果は `preview_acceptance_progress_20260913.md` を優先する。仕様判断候補は `next_release_decisions_20260913.md`、専用スキル台詞は `exclusive_skill_dialogue_proposal_20260913.md`。

## 現行Production

ユーザー報告により ef18a73810c7a2b01f1cc56498ac1a87341f3c67 の本番公開・Smoke PASSを受領。現行改善の公開工程は完了。次版候補には同SHAのChat、Inventory、Ranking互換Migration差分を保持した。本作業ではProduction、alias、環境変数、DBを変更していない。

## 並走状況

|担当範囲|実装状況|残る確認・決定|
|---|---|---|
|Quest Raid Encounter|既存Raid新規開催への接続、抽選・再開・演出、追加報酬snapshot・二重付与防止を実装|Preview実DB・実画面。発生率、保証回数、難度比率、追加報酬を確定|
|課金|正式4Pack、120日期限、購入資産優先消費、Checkout/Webhookモード分離を実装|Stripeテスト決済・再送・復旧、正式設定。DIA有償／無償内訳と派生資産期限は未FIX|
|Special Gacha|4商品、正本確率・陣営、共通100Pt SSR交換、購入Ticket期限消費を実装|Preview演出・残高・交換・リトライ実画面|
|ショップ|正式4Pack、購入上限・残数、期限表示を実装|Preview購入往復。DIA販売は内訳確定まで無効|
|専用SSR|既存専用30件の正本照合、所有者一致による演出対象抽出を実装|承認済みモック再取得、正式台詞・目元素材、WEAPON_047／WEAPON_049／HEAD_020透過修正、演出組込・実画面|

専用SSRは準備段階であり、5領域すべてのリリース受入完了ではない。

## 検証の範囲

- 統合Typecheck、Quest Result／Leader回帰、各領域の対象検証はPASS。
- Special × paid lotsは実Migration・既存RPCをローカルPostgreSQL環境で組み合わせ、購入→Present→16抽選条件、期限順消費、期限切れ拒否・rollback、再送時の二重消費防止、Pt交換をPASS。
- EncounterのSQL試験は既存Raid登録・戦力・開催時間の契約ダブルを使用。実Raid Authorityへの結合受入はPreviewで別途必要。
- ローカルMock DB設定のwebpack buildはPASS。本番環境変数でのVercel buildや実iPhone確認の代替ではない。
- 既存承認モックは所在確認済みだが取得がHTTP 502で失敗。未確認の演出・台詞を補作していない。

## Preview適用候補

対象は sufvuqdnqohpfzkwxohq。読取確認では既存billing_products／billing_orders、Quest受取・Raid新規開催RPCが存在し、billing_asset_lots／quest_raid_encountersは未作成。以下はすべて未適用。

1. 20260913105642_quest_raid_encounter.sql
2. 20260913105839_billing_paid_pack_lots.sql
3. 20260913105913_special_gacha_release_contract.sql
4. 20260913111028_billing_checkout_mode_contract.sql

適用前に現在の履歴・RPC定義を再照合し、対象4件のみ順序指定する。適用済みMigrationの再実行や無差別DB pushは行わない。

Encounterは初期disabled。追加報酬数量を投入せず、発生率等の仮値を運営確定値として公開しない。Stripeはsandbox既定で、liveは明示的設定・環境一致が必要。キーや販売設定は本作業で変更していない。

次の受入はPreviewでのQuest報酬後Encounter→Raid作成・再開・救援・撃破・追加報酬、購入→期限付き付与→Special消費、複数再送・Reload、専用演出の体験非割込みを対象とする。
