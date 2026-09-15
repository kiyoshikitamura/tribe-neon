# 承認済み素材統合 2026-09-14

基準: `ed215459dc1b895fe94b17fd28d66c991a3ba0d6`。Production変更なし。

## 実装

- 提供ZIPの18 PNGをbytes変更なしで配置。目元10点は1536×512 RGBA、Guild8点は1024×1024 RGBA。
- SHA256、提供ZIP内パス、配信パスは `evidence/approved_assets_20260914.json`。
- 専用装備introの旧全身画像cropを承認済み目元画像へ接続。演出時間、Battle snapshot loadout判定、装備の有無条件は維持。
- `approvedAssets20260914.ts`のキーは現canonical `char_*` ID。旧UUIDへaliasを作らない。
- 未対応キャラクターの既存crop fallbackは維持。
- Specialガチャ現行3種、Raidバナー、Raid Encounter、Shop素材は変更なし。

## キャラクター照合

|画像|canonical ID|専用装備ID|
|---|---|---|
|ゴウ|char_go_01|WEAPON_047|
|レオ|char_leo_01|WEAPON_048|
|ケンゴ|char_kengo_01|WEAPON_049|
|コハル|char_koharu_01|WEAPON_050|
|ミヤビ|char_miyabi_01|HEAD_020|
|ミオ|char_mio_01|BODY_029|
|レイジ|char_reiji_01|BODY_030|
|アゲハ|char_ageha_01|LEGS_020|
|カレン|char_karen_01|ACCESSORY_049|
|カエデ|char_kaede_01|ACCESSORY_050|

キャラ名と専用装備のcanonical ownerを10件とも照合済み。レイジは現canonicalに存在するため接続可能。旧UUID残骸との対応づけは不要。

## Guild素材の残り

7都市＋イベント1位baseの8PNGは配置し、素材catalogへ収録済み。ただし今回の素材担当変更ではDB cosmetic IDや所有権へ未接続。
既存 `guild_standard_01`〜`08` は王冠／翼／稲妻／薔薇／双剣／炎／月／蛇という別の意味を持つ。番号だけを根拠に都市画像へ差し替えない。既存IDとの正規対応または追加ID登録をSeason統合側と確認する。

## 検証

- ZIPの18元ファイルと配置bytes一致: PASS
- 18点の寸法／RGBA: PASS
- canonicalキャラ10件／SSR専用装備owner／配置先存在: PASS
- git diff --check: PASS
- 型／Build: 親エージェントの統合検証で実施
- 実機演出確認: 残件とまとめて実施予定、未完了
