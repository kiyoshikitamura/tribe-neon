# 正式オープン正常化 第2差分

## 基準・扱い

- 親の取り込み用差分：850215b4d1e18a215b11c834d337d1121473dd88。
- 正本：formal_open_integrated_release_management_20260914.md。
- 画像待ちで停止せず先行。画像変更なし。Vercel・live DB・Production操作なし。
- 正式Candidate化前に、Vercel担当Codexが実Current Production SHAを取得し、ancestryを満たす候補へ受入済み成果と取り込む。

## 実装

### Skill Level表示

CharacterSystemV2の所持Skill・装備中Skill枠・Skill詳細からLv表示を除去し+値だけ表示。EquipmentとCharacterのLvは維持。
未使用skillLevel/setSkillLevel stateをuseCharacterProgression/GameContextから除去。保存済みSkill資産を変更しない。
Skill Mission triggerの履歴互換は未変更・別監査。

### Quest初級Default

街選択時にEASYを選択。コース配列の順番に依存せず、既クリアでも選択する。
データが後着の場合も選択画面で初級を補完。中級・上級を本人が選択した後のbootstrap更新では初級へ戻さない。
探索一覧→街選択の段階UIは維持。探索一覧そのものをスキップしない。locked/解放条件のDB変更は今回なし。

### Profile Leaderと編成先頭の操作分離

- リーダー表示はidentityLeaderCharacterId。所持キャラから選択可能。
- リーダー変更は新RPC set_profile_leader_v1(text)。所有確認・auth.uid必須、favorite_character_idだけ更新。
- 既存の地元同期Triggerを維持。同一Leader再保存は手動拠点を巻き戻さない。
- 編成5枠を表示しslot1は「先頭」。先頭変更はsave_main_formationで順番だけ変更。
- handleSetPartyLeaderの旧結合処理をhandleSetProfileLeaderへ置換。
- Clientへ公開されていない旧update_favorite_characterの権限を拡張しない。
- Mockにも新RPCの対応を追加。

### Room Raid Mission

- 正式finalizeの初回成功でRAID_FINALIZEDを1回。
- Clear gate成功・資格ledgerの新規行作成時だけRAID_CLEAR_ELIGIBLEを1回。
- finalize行lock/再送早期returnを保持。配送失敗はMission加算もrollback。
- Encounter報酬2倍、Snapshot、現行配送を維持。直接Bag付与は別差分。
- 既存RPC定義の限定anchorに挿入。定義不一致なら適用停止し、無条件に置換しない。

## 新規Migration（未適用）

1. 20260914072512_raid_room_mission_finalization_hooks.sql
2. 20260914072613_profile_leader_authority_v1.sql

CLI生成。Preview適用前に履歴と関数定義を確認。再適用しない。ProductionはGo後のみ。

## ローカル検証

- Typecheck / changed-file ESLint / diff check。
- Mock/development設定のNext build（Vercel実設定Buildとは別）。
- scripts/verify_quest_ui_state.mjs：街・コース順・既クリア・データ未取得。
- scripts/test_profile_leader_authority.mjs：PGlite、認証/所有/他user/非先頭Leader/編成不変/地元同期/同一Leader再保存。
- tests/raid-room/mission-finalization.test.mjs：PGlite、実finalize・Clear配送SQL、Mission記録sink。再送/failed/legacy/Tutorial/不正result/未達/複数item/報酬2倍/配送失敗rollback。

PGliteはlive DBや実Mission evaluator全体のAcceptanceを代替しない。

## Codexへ：差分Acceptance

1. 必要MigrationをPreviewへ適用しVercel実設定でBuild・配信。
2. Skill一覧/装備中/詳細は+値のみ。Equipment Lvを維持。
3. 各街は初級Default。中級/上級を選んでReload以外の同期をしても維持。クリア済選択・locked操作禁止。
4. Leader≠先頭、編成外Leaderを含む実画面。Leader変更で編成不変、先頭変更でLeader/拠点不変。Reload保持。
5. Characterパーティ5枠とLeaderが320/390pxで正常表示。
6. 実Room1戦→Mission進捗+1、finalize retryで不増、Clear資格達成で+1。通常/Encounter両方。Clear/Rescue既存報酬2倍を保持。
7. 実Mission evaluatorの同期/期間/前提Missionと整合することを確認。
8. 第1差分のSurvey Present・小Raid・一覧Leaderバッジも同候補で確認。

## 棚卸し結果と残作業

- EXP：REQUIRED EXP MASTER NOT DEFINED。Character最新level_up_characterは素材個数でLevel加算、Equipmentも同様。items master effectValueを使っていない。混合投入は逐次RPCで全体atomicでない。
- user_level_progressionはPlayer用。equipment_progressionは能力倍率/capで必要EXP表ではない。
- 仕様判断：Character/Equipment必要EXP曲線、部分EXP投入時のCASH費用、cap余剰EXP扱い。
- Guild tenure：joined_atは存在するが日数投影なし。Day0/Day1は判断待ち。
- AP MAX50：自然回復cap、Quest開始時の回復timer、表示用定数/JSONに100が残る。50超保持を含む一括修正が必要。
- Direct reward：通常MissionとDaily Rankingは既に直接付与。Quest drop/Raid Clear/Rescue/Login BonusはPresent経由。名前がgrant_present_payloadでも実資産dispatcherであり、一律置換しない。
- Daily Missionの未受取補填は補填例外として別管理。
- Quest Main Formation統一、Season Close/Claim/New Season、Billing一気通貫は未完了。

## リリース

本差分はローカル検証済みの取り込み用成果。正式リリース全体PASSでもPreview実画面PASSでもない。画像制作は別系統で継続。数値未FIXだけ保留し、残りの画像非依存作業を進める。
