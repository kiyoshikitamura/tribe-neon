# EXP Master Authority監査 / 2026-09-14

## 結論・訂正

育成マスタは存在する。「REQUIRED EXP MASTER NOT DEFINED」の断定を撤回する。
現在確認できた問題は、素材のEXP定義と、素材個数をLevel加算に使用するRPCの不整合。
正式なCharacter/Equipment必要EXP曲線は、今回確認したソースからは特定できていない。不存在の証明ではない。新規曲線を作成しない。

## READ ONLY実DB確認

Preview sufvuqdnqohpfzkwxohq / Production ktpolnkyyfkowxdmijww の両方で同一結果。
トランザクションをread onlyに設定しSELECT後rollback。ユーザー資産・Migration・環境変数・配信変更なし。

| 対象 | 両環境の確認結果 |
| --- | --- |
| character_level_up_master | Lv2–100の99行。cost_cash=100、required_material_count=1 |
| equipment_level_up_master | Lv2–100の99行。cost_cash=50、required_exp=1 |
| level_up_character | p_countで到達Levelを計算。required_material_countの合計を素材個数として消費 |
| level_up_equipment | p_countで到達Levelを計算。required_expの合計を素材個数として消費 |

両RPCとも素材effectValueによるEXP加算・余剰EXP繰越を行っていない。
Previewのcanonical_master_freeze_versionsも確認。収録domainにCharacter/Equipment育成曲線は見当たらず、required_exp/requiredExpキー抽出は全行空。これは他キー名・別資料まで不存在を保証しない。

## Repository Authority

- src/domain/gameplay/canonical/data/items_20260822.json：Character素材のeffectValueは小100/中500/大2000。Equipment素材は小100/中500/大2500。
- supabase/migrations/20260731000000_initial_schema.sql：equipment_level_up_master.required_expのDDL defaultは100。行ごとの正式曲線を示すseedではないため、この100を復元値として採用しない。
- supabase/migrations/20260812000121_secure_provisional_progression.sql：冒頭でprovisionalと明記。Character 100 CASH/素材1、Equipment 50 CASH/required_exp 1をLv2–100へupsert。実DB値と一致。
- supabase/migrations/20260821000172_equipment_level_curve_final.sql：Equipment能力成長とRPC。EXP素材量としてrequired_expを使用する処理が残る。
- equipment_progression_20260821.json：能力倍率・上限の定義であり、必要EXP曲線とは区別。
- user_level_progression_20260822.json / canonical_user_level_master：Player用。Character/Equipmentへ転用しない。

## 次の実装修正条件

既存正式な必要EXP曲線の出典・版を確定してから、素材effectValue、EXP蓄積、余剰繰越、CASH費用、上限を同じAuthorityに接続する。
現行1個=1Levelを素材100/500/2000 EXPへ置換するだけではバランスが変わるため実行しない。
混合素材投入は単一トランザクションで検証・消費・育成を確定する。
今回の成果は監査と引継ぎ訂正のみ。育成コード・DB変更なし。

## 過去FIX回収の追跡（追加）

ユーザーが過去FIX済みと明示。素材個数によるLevel加算は不具合として扱う。
Gitのshallow履歴を補完し、8月のFreeze commitと育成処理の履歴を確認した。

- ca258aeae6d204d1d70ecd776d85171e96c31fcc：Freeze snapshot/addendum。能力値と装備限界突破を回収。必要EXPのレベル表は確認できない。
- 51801a33f172ee9629ce0ad6a7ac967a948b62ce：canonical gameplay foundation。EXP個数処理が残存。
- 48377761：アイテムEXP定義をFreezeしたが、育成RPCとの接続が成立していない。
- 過去会話検索で8月20〜21日のEXP議論に到達した。ただし取得断片は「案」「未FIX」を含む。累計値から必要EXP曲線を逆算しない。
- TRIBE_NEON_Gameplay_Foundation_Salvage_Final_Recovery_20260821(2).md の全文範囲検索：Character能力成長表・Skill表を確認。EXP式は取得できず。
- GAME03_TRIBE_NEON_仕様正本_2026-09-10.html の必要EXP関連検索：該当箇所未回収。検索不一致を不存在の証拠にしない。

残る入力は過去FIXしたCharacter/Equipmentレベル別必要EXP表または式の原文と出典。新しい数値を決め直す依頼ではない。
EXP以外の確定済み修正（AP MAX50、Quest戦闘Main Formation）は並行作業へ分離。
