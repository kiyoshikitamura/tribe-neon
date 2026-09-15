# 地元一致ボーナス 現行実装監査 / 2026-09-14

STATUS: READ ONLY監査完了 / バランス変更なし

基準Repository: `767b6f4540409d1f6aae02df9424fc2294f1baf0`
Preview DB: `sufvuqdnqohpfzkwxohq`。全照会は BEGIN READ ONLY / statement_timeout 15s / ROLLBACK。
Productionは照会・変更していないため本番同等との断定はしない。

## 結論

現行の「地元一致」は戦闘能力倍率ではなく、Quest探索報酬への固定CASH・確率ポイント加算。担当キャラクターのLv・覚醒由来LUKがそのまま供給量に影響する。二重加算のコードは確認されず、現在の係数だけで大きな効果が生じる。

| 判定・計算 | 現行Authority |
|---|---|
| 一致対象 | 探索担当1名のcanonical出身地と探索先courseのtown_id |
| 参照しないもの | ユーザー拠点、Favorite Leader、Battle Main Party、装備LUK、Skill、戦闘中Buff |
| LUK | canonical_character_statsの本体LUK。現canonical成長曲線・Lv・覚醒を反映 |
| CASH | 基本CASH + LUK × 10。一致しなければ加算0 |
| Drop | 各有効rollの基礎確率 + LUK × 0.1パーセントポイント |
| 上限 | Drop合計100%。基礎0%は抽選しない。CASH加算の独立したcapなし |
| 数量・対象 | 成功したrollのMaster数量を維持。地元でPoolや数量を変更しない |
| 固定時点 | user_patrols INSERT時にサーバーsnapshot。開始後のLv/覚醒変更では再計算しない |
| 二重付与 | patrol行lock＋COMPLETED拒否。DropはQUEST_DROP ledger。CASH合計に1度だけ加算 |

LUKの覚醒倍率は+0～+5で1 / 1.03 / 1.06 / 1.10 / 1.15 / 1.20。成長曲線の丸め後に倍率を適用し整数切捨て。HP/ATK/DEFの最大1.75倍をLUKへ使用していない。

## Preview実DBで計算した例

| キャラ | Lv / 覚醒 | 本体LUK | CASH加算 | Drop加算ポイント |
|---|---:|---:|---:|---:|
| レイジ（canonical ID char_reiji_01） | 1 / +0 | 9 | 90 | 0.9 |
| レイジ | 50 / +5 | 48 | 480 | 4.8 |
| レイジ | 100 / +5 | 86 | 860 | 8.6 |
| カレン | 1 / +0 | 26 | 260 | 2.6 |
| カレン | 50 / +5 | 156 | 1,560 | 15.6 |
| カレン | 100 / +5 | 258 | 2,580 | 25.8 |

全7街の基本CASHは初級600 / 中級1,200 / 上級2,000。カレンLv100/+5を秋葉原へ探索させる場合、CASHは初級3,180（基本比5.30倍）、中級3,780（3.15倍）、上級4,580（2.29倍）。これは推奨調整値ではなく現行計算結果。

同条件のDropは初級EQUIP_EXP_Sが20%→45.8%。中級SKILL_MANUALが5%→30.8%。上級SKILL_MANUAL・EQUIP_LB_PART各12%→37.8%、NORMAL_GACHA_TICKET_RANDOMが3%→28.8%（9.6倍）。確定素材は100%のままで数量も1のまま。

基礎低確率rollほど相対倍率が高くなる。さらに同一加算を各rollへ適用するため、非確定rollが3本ある上級では期待獲得品目数への効果も複数本分生じる。係数重複ではないが、供給バランス上の増幅要因になる。

## 適用経路

- Quest: 探索開始snapshot→正式Battle解決→claim_patrol_rewardsで報酬に適用。戦闘中HP/ATK/DEF/SPD/LUKへ地元倍率は適用しない。
- PvP / Room Raid / GvG: 地元一致による能力・報酬加算の参照は確認されない。GvGの他の地域・拠点仕様の包括監査ではない。
- 地元とLeaderの連動はon_leader_hometown_baseという別処理。ユーザーの表示拠点を変更するだけで上記報酬計算の入力ではない。
- 現UIはsnapshot額とRPCのcash合計を表示し、matchBonusCashは内数。クライアントで再加算しない。
- Preview publicの全通常関数本文を hometown / drop_bonus_bp / match_bonus で照合した該当はclaim_patrol_rewards、start_patrol、quest_hometown_snapshot、on_quest_hometown_snapshot、on_leader_hometown_baseの5関数。

## 証拠・旧仕様との区別

- `supabase/migrations/20260913032942_quest_hometown_reward_bonus.sql`: quest_hometown_snapshot、INSERT trigger、claimの計算・snapshot・重複拒否。Preview実関数定義と照合。
- `supabase/migrations/20260914110219_gameplay_direct_reward_delivery.sql`: QuestのPresent挿入を直接付与へ置換。地元の計算は維持。現Preview claimはこの直接付与経路。
- `supabase/migrations/20260914220000_canonical_character_growth_runtime.sql`: canonical LUK曲線と覚醒倍率。現Preview定義一致。
- `src/app/context/hooks/usePatrol.ts`: cash合計とボーナス内数を分離してResultへ投影。
- `src/app/components/quest/QuestPresentationV2.tsx`: 探索中snapshot内訳を表示。
- `specs/spec_ui_quest_map.md` §2: 係数の旧資料出典。ただし「派遣メンバーLUK合計」は現在の担当1名契約と異なるのでParty5名合算をAuthorityにしない。
- `specs/quest_hometown_bonus_20260913.md`: 担当1名、旧係数の接続を説明。旧Present説明は9/14直接付与で更新済み。過去のPreview未検証という記載だけで現行未実装と扱わない。
- `specs/quest_exploration_feedback_20260913.md`: UI調整で既存計算を維持する指示。今回の減額調整値はまだ確定していない。

## 次の仕様判断

別スレッドへ本監査を渡して、CASHとDropを別々に調整する。少なくとも固定加算を維持して係数/capを下げるか、基本報酬/基礎確率への割合補正に変更するかを決める必要がある。新係数・上限は本監査で作らない。

既存探索は開始時snapshotなので、新係数を導入してもそのままでは開始済み探索には効かない。原則は新規探索から変更し、既存snapshotを保持する案。適用境界も調整仕様で確定する。

今回は読み取りと文書作成のみ。DB・コード・Feature Flag・Productionに変更なし。実機・確率統計試験は実施していない。
