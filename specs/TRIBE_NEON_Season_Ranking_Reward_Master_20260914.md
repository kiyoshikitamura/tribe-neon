# GAME03 / TRIBE NEON

# Season Ranking Reward Master

Date: 2026-09-14 Status: **PRODUCTION FIX / IMPLEMENTATION REQUIRED**

## Scope

正式OPEN後のMonthly Season終了報酬。 - 個人総合力 `POWER` - Guild総合力
`GUILD_POWER` - CASH 0 / DIA 0 - DailyはEXP中心、Seasonは名誉＋Special
Ticket＋希少育成素材

## 個人総合力

  ----------------------------------------------------------------------------------------------------------------
  Rank      Honor                      SP Char SP Skill SP Equip     覚醒   Skill指南書   改造パーツ Other
  --------- ------------------------- -------- -------- -------- -------- ------------- ------------ -------------
  1         Season                           4        2        2        2             4            4 ---
            Champion称号＋専用Badge

  2--3      TOP3称号＋専用Badge              2        2        2        2             3            3 ---

  4--10     TOP10称号＋Badge                 2        1        1        1             3            3 ---

  11--30    TOP30 Badge                      1        1        1        0             2            2 ---

  31--100   TOP100 Badge                     0        0        0        0             0            0 Normal
                                                                                                     Character
                                                                                                     x2 +
                                                                                                     CHAR_EXP_L
                                                                                                     x3 +
                                                                                                     EQUIP_EXP_L
                                                                                                     x3

  101+      ---                              0        0        0        0             0            0 ---
  ----------------------------------------------------------------------------------------------------------------

Exactly-once: `season_id + POWER + user_id`

## Guild総合力

  -------------------------------------------------------------------------------------------------------------------------------------------------------------------
  Rank     Guild Honor                                               SP             SP             SP   覚醒/member   Skill指南書/member   改造/member Other/member
                                                            Char/member   Skill/member   Equip/member
  -------- ---------------------------------------------- ------------- -------------- -------------- ------------- -------------------- ------------- --------------
  1        Champion限定Emblem＋Decoration＋Champion表示               2              1              1             2                    3             3 ---

  2--3     TOP3限定Emblem＋Decoration                                 1              1              1             1                    2             2 ---

  4--10    TOP10 Decoration＋Badge                                    1              0              1             0                    2             2 ---

  11--20   TOP20 Badge                                                0              0              0             0                    0             0 Normal
                                                                                                                                                       Character x2 +
                                                                                                                                                       Normal Skill
                                                                                                                                                       x1 + Normal
                                                                                                                                                       Equipment x1 +
                                                                                                                                                       CHAR_EXP_L
                                                                                                                                                       x2 +
                                                                                                                                                       EQUIP_EXP_L x2

  21+      ---                                                        0              0              0             0                    0             0 ---
  -------------------------------------------------------------------------------------------------------------------------------------------------------------------

Guild ownership: `season_id + GUILD_POWER + guild_id` Member reward:
`season_id + GUILD_POWER + guild_id + user_id`

## Guild Member Eligibility

1.  Season終了Snapshot時点で対象Guild所属
2.  当該Season中7日以上在籍

Finalize時にeligibilityをSnapshot固定。終了後脱退しても受領権維持。
Guild Emblem/Decoration ownershipはMember eligibilityと独立。

## Reward IDs

既存IDのみ使用: `SPECIAL_TICKET_CHARACTER`, `SPECIAL_TICKET_SKILL`,
`SPECIAL_TICKET_EQUIPMENT`, `AWAKENING_BOOK`, `SKILL_MANUAL`,
`EQUIP_LB_PART`, `NORMAL_GACHA_TICKET_CHARACTER`,
`NORMAL_GACHA_TICKET_SKILL`, `NORMAL_GACHA_TICKET_EQUIPMENT`,
`CHAR_EXP_L`, `EQUIP_EXP_L`.

称号/Badge/Emblem/Decorationは既存Cosmetic Master監査後に正式IDへ接続。
存在しないIDを推測作成しない。将来Character
Frame/Effectへ差替可能なindirect Reward ID構造を維持。

## Runtime

Monthly終了: 1. Server-side Ranking finalize 2. immutable final snapshot
3. Personal tier resolve 4. Guild tier resolve 5. Guild member
eligibility snapshot 6. Exactly-once grant 7. receipt/read state

## UI

Ranking報酬確認: - デイリー / シーズン切替 - Season全Tier - 現在順位 -
現在獲得予定報酬 - Guild Member eligibility説明

終了後は次回Home/MyPageで集約Reward Dialogを1回表示。

## Impact

-   DB: Season reward master / final snapshot / grant ledger /
    eligibility snapshot
-   UI: Season reward table / planned reward / receipt
-   Ops: 自動配布。Cosmetic素材運用あり
-   Monetization:
    CASH/DIAなし。上位価値を優先し、月次・少数対象として希少素材量を許容
-   Guild Economy: HOLD継続

## Acceptance

-   Personal TOP100全Tier一致
-   Guild TOP20全Tier一致
-   101+/21+報酬なし
-   Personal/Guild二重受賞可
-   7日在籍境界
-   retry/concurrency二重付与なし
-   snapshot後順位/eligibility不変
-   Daily Ranking regressionなし
-   CASH/DIA 0
