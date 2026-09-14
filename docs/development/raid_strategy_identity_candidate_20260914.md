# Raid 攻略性・表示実装と戦闘調整候補 — 2026-09-14

## 状態

選択画面の攻略ヒント・全4難度の新報酬比較・Daily実受取表示を実装。
新報酬は `get_raid_reward_policy_v2()` の認証済み返却値が取得できた場合だけ表示。
上級・超級の `enabled=false / PENDING_CONTRIBUTION` は「新報酬：付与条件調整中」。
実受取表示は `get_raid_room_clear_reward_v1().dailyBonus` の別枠receiptを使用し、Instanceと混同しない。

新しいStats / Skill構成 / 難度別攻略強度は未適用。以下は既存Repositoryから作成した調整候補であり、本番またはPreview実DBへの一致を断定しない。
現在UIは既存Statsに基づく限定したヒントを表示。六本木のSkill主体、秋葉原の妨害、横浜の回復、川崎の低耐久を実装済みとは訴求しない。

## 現行Stats（canonical raid_production_20260830.json）

|地域|HP|ATK|DEF|SPD|現状と新仕様の差|
|---|---:|---:|---:|---:|---|
|新宿|32,000,000|9,500|6,200|390|高ATK。Burst技能構成の検証が必要|
|渋谷|28,000,000|8,800|5,500|470|最高SPD。難度別先制圧力は未検証|
|池袋|36,000,000|8,200|8,200|340|最高DEF・高HP|
|六本木|34,000,000|8,700|7,700|390|現状DEF寄り。Skill型構成が必要|
|秋葉原|30,000,000|8,400|6,500|430|現状SPD寄り。状態異常構成が必要|
|川崎|38,000,000|10,500|6,000|350|最高ATKだがHPも最高。低耐久仕様に不一致|
|横浜|35,000,000|8,900|7,200|390|高めHP。回復編成の検証が必要|

`start_raid_room_battle_v1()` のRepository初期定義はEnemyごとの skill_loadout、なければ専用Skill→通常Skill fallback を参照する。StatsはInstance由来。同じ地域の見た目・名称だけではSkill型の成立を証明できない。

## 実在Skillによる構成候補

すべて canonical skills_20260821.json に存在する通常Skill。新ID・新Effectは追加しない。専用品を他Characterへ付けない。

|地域|Enemy側の候補|プレイヤー側の対策候補|
|---|---|---|
|新宿|SKILL_009 ATK+15%、SKILL_011 ATK130%攻撃|SKILL_006 DEF+15%、SKILL_002 SHIELD|
|渋谷|SKILL_004 SPD+12%、通常攻撃Skill|SKILL_030 SPD-15%、SKILL_013 回復・状態解除|
|池袋|SKILL_006 DEF+15%、SKILL_002 SHIELD|SKILL_015 DEF-20%、SKILL_022 全体攻撃・DEF低下|
|六本木|SKILL_009 ATK強化、SKILL_015 DEF低下|SKILL_030 SILENCE、SKILL_039 状態解除|
|秋葉原|SKILL_018 STUN、SKILL_030 SILENCE・SPD低下|SKILL_013 / SKILL_023 状態1個解除、SKILL_039 全解除|
|川崎|SKILL_035 ATK+35%・DEF-15%、SKILL_011 攻撃|SKILL_004 SPD強化、先手集中攻撃|
|横浜|SKILL_029 即時回復・REGEN、SKILL_048 回復・REGEN|SKILL_030 SILENCE、継続火力|

`canonical_runtime.ts` は SILENCE / STUN / REMOVE_STATUS を処理する。独立した「回復阻害」や新Resistanceを推測で追加せず、横浜の回復対策は既存SILENCEを候補にする。

## 次の戦闘調整工程

1. 実Previewの地域×難度×5人のStats/Skillロードアウトを取得し、現在使用中の生成経路を確定。
2. 川崎HPの低耐久化、六本木/秋葉原/横浜のSkill構成を候補データとして別途作成。
3. 初級は特徴Skill少数、中級は明確な特徴、上級は対策による効率差、超級は対策要求を、同一総合力の対策有/無で比較。
4. ATK/DEF/SPD/HPの具体的調整値を勝手に「確定値」としない。生存ターン、1戦Damage、対策による差を示して候補をレビュー。
5. 確定したCombat ProfileとUIの全7地域Identityを同時に切り替える。

超級の推奨総合力260,000は既存値を保持。参加最低値240,000は変更していない。

## 検証

`node --experimental-strip-types scripts/verify_raid_strategy_reward_display.mjs`

- 7地域、未知IDを偽補完しない。
- server policyの重複難度・不正確率・不正数量・enabled/status不整合を拒否。
- 旧Instance receiptの互換性。
- Daily当選/非当選、別Room receipt混入拒否。

実機でRaid TOP→敵選択時点のヒント・4難度報酬比較の視認性を確認する。DBだけでUI受入PASSにはしない。

## 再開時の検証（2026-09-14）

- 現Previewの28profileは候補baselineと全件一致。候補SQLをtransaction内で実行し、140memberのsnapshot生成成功後ROLLBACK。恒久適用なし。
- 現行ローカル戦闘エンジンで28編成×3条件（旧／候補／対策）×20seed=1,680戦を比較。旧シミュレーターの成長データimport漏れとgrowth_pattern未指定を修正。
- 対策条件は同じキャラ・育成・装備・Statsで2名の通常スキル各1枠だけ交換。全地域で改善するとは確認できない。
- 秋葉原は中／上／超級でraw damageが約1.27／1.30／1.47倍。候補の状態異常対策が有効なケースを確認。
- 横浜は全難度で回復スキルの発動を確認したが、最大HP比例回復が大きく対策有効性を確認できない。超級の平均raw 861,936に対し戦闘終了時の敵HP純減31,605。SILENCE候補では純減6,783。実ledgerのapplied contributionとは別指標。
- UIを全7地域の新攻略ヒントへ切り替える条件は未達。数値候補を受入済みとは扱わず未適用を維持。
- 全結果: raid_strategy_simulation_20260914.json。再現: node --experimental-strip-types scripts/verify_raid_strategy_simulation.mjs。実接続E2E・実機受入の代替ではない。
