# GAME03 / TRIBE NEON

# Quest 21 Stage Balance Master v2

Date: 2026-09-17

## v2追加FIX

### 1. Player EXP

21ステージへPlayer EXPを追加する。

  Area       初級   中級   上級
  -------- ------ ------ ------
  新宿         30    110    250
  渋谷         35    125    280
  池袋         40    140    310
  六本木       45    155    340
  秋葉原       50    170    370
  川崎         55    185    400
  横浜         60    200    450

Quest Raid Encounter撃破時の `User EXP +50%` はこの基礎Player
EXPへ適用する。

### 2. Enemy実Stat / 編成 Authority

Recommended Powerから実装側へEnemy Stat調整を委任しない。

21 First-Clear Bossについて以下をHuman FIX Masterとして定義する: - 5
Character IDs - Level - HP - ATK - DEF - SPD - Skill Loadout - Tactic

Recommended Powerはユーザー向けGuidanceおよびBalance Targetであり、Enemy
HP/ATK/DEFを自動生成する式ではない。

実装側はFIX済みEnemy Masterを忠実に接続する。 Preview
playtestで難度が外れた場合は、実装側の裁量変更ではなくMasterをHuman
Reviewして再FIXする。

Area Identity: - 新宿: ATK - 渋谷: SPD - 池袋: DEF/HP - 六本木: Skill -
秋葉原: 妨害/LUK - 川崎: 高ATK - 横浜: 耐久/総合

既存Production Character /
Skillを優先し、存在しないSkillを推測追加しない。

### 3. 7街一覧UI --- 旧削除指定を変更

以前の「街一覧からEnemy傾向表示を削除」の指定を変更する。

今回の新FIX: 1. **Reward Identityを主表示** 2. **Enemy傾向を補助表示**
3. 詳細情報はStage詳細へ

旧Enemy表示UIをそのまま復活させるのではなく、Farm先選択のために再設計する。

例: - 新宿: **キャラ育成素材 UP** / 攻撃型が多い - 渋谷: **スキル素材
UP** / 素早い敵が多い - 池袋: **装備育成素材 UP** / 防御・HP型が多い -
六本木: **スキル指南書 UP** / スキル型が多い - 秋葉原: **ガチャチケット
UP** / 妨害・特殊型が多い - 川崎: **改造パーツ UP** / 高火力型が多い -
横浜: **キャラ・装備素材 バランス** / 耐久・総合型

Acceptance:
**7街一覧だけで、どこへ行けば何が出やすいか判断できること。**
Enemy傾向はReward Identityより視覚的に強くしない。

## 既存v1 FIXは維持

-   Tutorial未育成Power 65,000--75,000
-   21 sequential stages
-   AP 3/10/20
-   Time 5/60/180 min
-   Recommended Power 60k → 340k sawtooth progression
-   Formal-open CASH 300/600/1000
-   Hometown base CASH +10% / Drop +2%pt / no LUK
-   Raid Encounter: item x1 + base CASH same amount + User EXP 50%
-   First Boss: 初級 Normal3種 / 中級 SP3種 / 上級 SP3種+LB
-   横浜上級: SP3種各2 + Skill Manual10 + Equip LB Part10
-   First-clear total: Normal21 / Special45 / Manual38 / LB Part38

Recurring Area×Difficulty drop percentages remain Preview candidates
until expected-value and playtest validation.
