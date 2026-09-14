# EXP・成長曲線 実装前監査 — 2026-09-14
基準SHA: 5a5014e74b564cf0724433d4eadf64d4a6a58530
Preview DB: sufvuqdnqohpfzkwxohq
状態: READ ONLY監査完了 / Runtime変更・Migration適用なし
仕様: specs/exp_growth_implementation_candidate_20260914.md

## DB
- user_characters.xp / user_equipments.xp は未存在。既存行0で追加する。
- Character level masterはLv2–100の99行、required_material_count=1、CASH100。
- Equipment level masterは99行、required_exp=1、CASH50。
- 両強化RPCはp_countをLv上昇数とし、素材effectValueを使用していない。
- Character/Equipment capは覚醒/LB +0..5でLv50..100。維持する。
- 素材/CASH行ロック・所有者検証・例外時atomic rollbackを継承する。
- MissionのCHAR_LEVEL_UP / GEAR_UPGRADEは実際の上昇Lv数を送る。

## UI・API
| 対象 | 現状 | 変更 |
|---|---|---|
| useCharacterProgression.ts | 混合投入は単素材RPCを逐次実行 | 単一atomic RPC。単体handlerも同じ計算へ |
| CharacterSystemV2.tsx | Lv+素材個数、費用=個数×100/50 | master/effectValueからEXP・予測Lv・費用を計算 |
| Equipment育成 | 詳細画面と一覧下部の2経路 | 両方で同一予測。対象所持rowのxp/levelを使用 |
| GameContext.tsx | 所持table select(*)で全row保存 | xp反映、必要EXP masterの取得/供給 |
| canonical/items.ts | canonicalItemEffectValueあり | 既存素材値を再利用 |

既存batch戻り値complete/completedItemIdsの契約を維持する。単一RPC失敗時は空配列、成功時は全item ID。
予測はFavorite Leader用のscalar characterLevelではなく、育成対象rowをAuthorityとする。
EXPのみ蓄積する操作を、予測Lv不変という理由でdisabledにしない。
runCompositeOperationは他の一括処理にも使用するため一括除去しない。

## 成長型と波及
- canonical_character_statsは現行で整数線形補間。
- canonical_character_masterには成長型列なし。character_release_master / character_battle_masterの60名の割当が一致（差異0）。
- 6型の件数はユーザー提示と一致。
- 新曲線の波及: calculate_user_character_power、build_server_battle_snapshot_00168、canonical_quest_enemy_snapshot、quest_hometown_snapshot。
- Quest敵能力とLUK由来CASH/drop bonusも回帰対象。
- refresh_user_power_projection / refresh_all_user_power_projectionsが存在。既存Power投影は関数置換だけでは再計算されない。
- PreviewでのPower再計算範囲を明示し、保存済みBattle/確定Ranking snapshotを遡及変更しない。

## 未確定: cap到達時の余剰EXP
現在はcapまでの素材個数だけ消費し、cap到達済みなら拒否する。
EXP列がないため、cap到達時の余剰EXPを保持するか切り捨てるかの既存Authorityはない。
提示本文もこの規則を定義していない。通常LvUP後の余剰繰越と区別する。
ユーザー資産に関わるため、切捨て・保持・返却のいずれも確定済みとはしない。

## 検証済み
提示されたTarget Lv帯を各99遷移へ展開して累計を再計算:
Character118400 / Equipment78450、CASH9900 / 4950で一致。

## 未実施
Migration、Runtime/UI実装、型検査、Build、強化/Battle E2E、人の受入。
Production変更なし。
