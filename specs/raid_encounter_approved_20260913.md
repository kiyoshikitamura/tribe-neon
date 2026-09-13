# Encounter確定差分 2026-09-13

初回から10%、10回連続未遭遇の次（11回目）は確定。初回保証なし。難度は初50/中35/上15を参加可能難度へ再配分。探索した街は日次対象外も可。本人開催中1件、全体は既存難度上限を共有。

未遭遇数は抽選が成立した回だけ加算。開催上限で抽選できない回は消費しない。開催成功で0へ戻す。作成失敗はDRAWNを保持し難度を再抽選しない。

## 報酬2倍

|経路|現行Room版|新版Encounter|
|---|---|---|
|毎戦・デイリー・RP消費報酬|on_canonical_daily_activity_finalizedでRoomは明示除外|維持。新設なし|
|旧instance討伐|Room専用finalizerと分離|変更なし|
|Room討伐Clear|既存条件を満たした会員へRoom×本人×itemで1回|全item数量2倍|
|Room救援Rescue|既存条件を満たした救援会員へRoom×本人×itemで1回|全item数量2倍|
|Quest通常・Mission・Ranking|別Authority|変更なし|

ClearとRescue双方を獲得する本人は両方2倍。同一の原子的確定内で通常分と増量分を合算し、Presentとgrantsを同量にする。既存キー・ボスロックで二重付与防止。受取期限30日を維持。

新規Roomはreward_multiplier=2をDRAWN時に保持。既存DRAWN/CREATEDは1と旧bonus_items snapshotを維持。旧追加素材triggerはmultiplier=2へ付与しない。発見だけの付与なし。

UIは発見演出・再訪・Room詳細に「報酬2倍」。受取内訳は既存grantsの実数。

## 復旧・検証

ファイル20260913120930_quest_raid_approved_occurrence_and_double_rewards.sqlはPreview migration historyのversion20260913121454から完全復元。再適用禁止。enabled=falseで受入待ち。

tests/db/quest-raid-approved.test.mjsは新Migration・実Clear/Rescue issuer SQLをPGlite実行。初回非保証、10miss→11回目、cap、再送、2名へClear/Rescue各2倍、Present/grants一致、再発行0件、旧固定bonusなし、通常Room等倍、配送失敗rollbackを確認する。参加条件・登録はcontract doubleであり、実DB受入とは区別する。
