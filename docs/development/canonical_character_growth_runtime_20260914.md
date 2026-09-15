# 成長指数のDB接続・current Power整合候補

2026-09-14。Preview DB: sufvuqdnqohpfzkwxohq。
状態: 候補作成・Preview rollback検証PASS。永続適用・Production変更なし。

## Authority

- canonical characters_20260821.json: blob cbae064187916fa768bf5ebd0dbc039fc085e35e。
- 正本60名の既存growth_patternを維持。ATTACKER/DEFENDER/SPEEDSTER/LUCKY_STAR/BALANCED各12名、HP_TANKは0名。
- 指数6型: character_growth_20260914.json blob023b1d11a7186cc0c30a27242e8b863b60ae3a46。
- 旧release/battle表や旧fixture UUID3件の割当は継承しない。HP_TANKを埋めるための新しい割当も作らない。

## 候補

Migration: supabase/migrations/20260914220000_canonical_character_growth_runtime.sql
Blob: 05ebeaadfe76d285235b02b8237de80dde847b64

- canonical_character_growth_exponentsに6型の指数を登録。
- canonical_character_growth_assignmentsに正本60名のversion/character_id/growth_pattern_idを登録。canonical master本体の変更を避ける。
- canonical_character_statsをLv比率の指数補間→ROUNDへ変更。Lv1/Lv100端点、Lv/覚醒clamp、覚醒倍率と整数切捨ては維持。
- source drift guard: 元関数MD5 2c196719fe8fcd72b10ffc2c5e578d7e。
- ownership、Lv、awakening、xp、素材、能力端点master、確定snapshotを更新しない。

## current Powerだけの整合

refresh_user_power_projectionは当日ranking_daily_activity_snapshotsのtotal_power/last_active_atも更新するため呼ばない。
user_power_rankingsへの直接UPDATEにも通知専用m9x_power_leader_activity_triggerがあるため、単純な全更新はしない。

候補は同一transactionで:
1. user_power_rankingsをACCESS EXCLUSIVEでlock。
2. 通知専用triggerの関数MD5と有効状態を確認。
3. このtriggerだけを一時停止。
4. calculate_user_total_powerの正規計算でcurrent projectionへUPSERT。既存行はtotal_powerが異なる場合のみ更新。不足行はINSERT。
5. 元のO/A/R/D状態を復元。

他trigger/RLSは無効化しない。guard_preopen_guild_power_cutoff等のSeason保護契約は変更しない。
既存current projectionの変更は能力曲線の変更を反映するためであり、ランキングsnapshotの再計算ではない。

## rollback検証

SQL: tests/db/canonical-character-growth-runtime-rollback.sql
最終Blob: f5e3220e18f98918c0f74bf61dd26cdc30a0a2d9

Previewで候補DDL・runtime・current projection整合を同一transaction内で実行してROLLBACK:
- 正本60割当。
- client実draftから生成した360期待値（60名×Lv1/50/100×覚醒0/5）とDB結果完全一致。
- client fixture blob: 931864b1ffddc8f1d8b63508a16657e73d6b4117。
- 全user current Powerが正規再計算と一致。
- 21表の前後hash一致。旧Battle replay sessions/events、Raid/GvG snapshots、Season/当日Ranking snapshots、Activity/feed状態、users/user_characters/user_items、canonical/旧Battle masterを含む。
- 全既存trigger有効状態のhash一致。
- 初回rollback後、新2表が存在せず、元canonical_character_stats MD5復元、通知trigger OをREAD ONLY再確認。
- 旧Battle対象を追加した最終21表検証もPASS・ROLLBACK済み。

この検証は既存Previewデータに対するtransaction内検証。永続Migration適用、実機・ブラウザ回帰、Production検証ではない。
