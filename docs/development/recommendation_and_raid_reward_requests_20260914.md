# おすすめスキル・拠点別Raid報酬 要望監査

2026-09-14 / READ ONLY監査完了・仕様判断待ち

基準: `767b6f4540409d1f6aae02df9424fc2294f1baf0`。
Preview DB: `sufvuqdnqohpfzkwxohq`。DB確認は BEGIN READ ONLY / ROLLBACK。
今回コード・DB・Productionを変更していない。

## 1. おすすめ装備とおすすめスキル

### 確認した事実

- 旧 `4ffe843` の `CharacterSystemV2.tsx` は、個別キャラのおまかせ装備から `handleAutoEquipComposite` を呼び、スキルと装備を両方適用していた。Partyにも同機能の入口があった。
- 現V2の装備ページは `handleEquipGearBulkRecommended` だけを呼ぶ。装備7枠（武器2・頭1・胴1・脚1・アクセサリ2）が対象で、スキルを変更しない。
- 現V2のスキルページにおすすめボタンがない。`handleEquipSkillBulkRecommended` 自体とContext公開は残っている。旧 `CharacterTab.tsx` にはスキル専用ボタンが残る。
- Previewの `apply_recommended_main_loadout()` は現在も5人のスキルと装備を両方配分する。9/10 MigrationにもSkill動作を維持する旨が明記されている。
- 従って旧機能の消滅ではなく、V2の導線変更で一括スキル操作に到達できなくなった差分。意図的な廃止として受け入れられた証拠は今回確認していない。

### ボタン接続だけでは不足する点

個別キャラの旧おすすめスキル処理には、ID末尾を1〜50に限定するOpen Beta filterが残る。Preview canonical Master70件のうち20件が範囲外。単にボタンを追加すると、その20件が候補に入らない。

既存の並び順は専用一致→plus_val降順→レアリティ→Master ID→個体ID。他キャラが使用中の個体は候補外。覚醒由来の解放枠数を使う。正式RPC `set_character_skill_loadout` は所有権・解放枠・専用一致・専用スキル最大1個を検査し、全体を同一transactionで保存する。旧候補生成は専用最大1個を明示制限しないため、候補生成側にも合わせる必要がある。

### 別スレッド用の提案

「おすすめスキル」を個別キャラのスキル欄に追加し、装備ページのボタンは装備専用のままとする。既存の順位規則と他キャラの使用中個体を奪わない規則を維持し、canonical Masterから候補を作る。戦闘用の最適組合せ探索は今回含めない。

判断依頼: この分離案を採用するか。5人まとめて配分する入口の復活も必要かは別途決める。

実装時の受入: 未装備／装備済み、キャラ切替、専用1個、解放枠、他キャラ装備保持、候補なし、保存後reload、通常・専用双方が候補になること。

根拠: `src/app/components/character/CharacterSystemV2.tsx`, `CharacterEquipment.tsx`, `CharacterParty.tsx`, `src/app/context/hooks/useCharacterProgression.ts`, `supabase/migrations/20260910013126_game03_short_tutorial_character_setup.sql` および上記Preview RPC。

## 2. 拠点別Raid報酬

### 現在の正式Room報酬

| 難度 | 討伐報酬 | 救援成功報酬 |
|---|---|---|
| 初級 | EQUIP_EXP_S ×1 | CHAR_EXP_S ×1 |
| 中級 | EQUIP_EXP_S ×1 | CHAR_EXP_S ×1 |
| 上級 | EQUIP_EXP_S ×1 | CHAR_EXP_S ×1 |
| 超級 | EQUIP_EXP_S ×1 | CHAR_EXP_S ×1 |

Preview実Masterで確認。全難度enabled。討伐の最低貢献ダメージ設定は0、正式判定はこれを超える貢献と撃破等の条件を用いる。救援は別の正式救援資格判定を維持する。

- 報酬Master `raid_room_clear_reward_items` / `raid_room_rescue_reward_items` の主キーは `(difficulty,item_id)`。拠点キーがなく、7拠点とも同じ報酬。
- 拠点の正式対応は `RAID_SHINJUKU_V1` / `RAID_SHIBUYA_V1` / `RAID_IKEBUKURO_V1` / `RAID_ROPPONGI_V1` / `RAID_AKIHABARA_V1` / `RAID_KAWASAKI_V1` / `RAID_YOKOHAMA_V1`。`raid_rooms.raid_boss_instance_id` → `raid_bosses` のvariant・base → canonical variantのareaを使用できる。
- Questで出現したRoomは保存済み `quest_raid_encounters.reward_multiplier=2` を討伐・救援報酬に適用する。これは拠点差ではない。
- `_issue_raid_room_clear_rewards_v1` / rescue経路は正式資格と一回限りのledgerに基づき、現在は直接My Bagへ付与する。旧MigrationのPresent文言を現仕様と取り違えない。
- 旧非Room Raid用 `raid_rewards_20260830.json` 等には日次報酬・抽選報酬があるが、現在のRoom報酬表とは別物。現 `on_canonical_daily_activity_finalized` はRoomを除外するため、旧値をRoomの追加報酬として流用しない。

### 別スレッド用の判断事項

1. 拠点差を品目で付けるか、数量で付けるか、両方か。
2. 討伐・救援のどちらを対象にするか。難度差も同時に設けるか。
3. 7拠点×4難度について対象品目・数量をFIXする。現在の供給総量を維持するか増やすかも併記する。

実装案: 共通報酬に拠点別overrideを追加し、サーバーの単一解決関数を報酬表示と実付与で共有する。Room作成時の適用version・拠点・数量を固定し、途中でMasterを変更しても既存Roomの表示と付与がずれない契約を設ける。既存のQuest出現2倍・資格・即Bag・重複防止を維持する。具体的な値は未作成。

未確認: 今回Production DBは読んでいないため、この報酬値が現在の本番とも同一とは断定しない。上記は統合候補とPreview現行の証拠。
