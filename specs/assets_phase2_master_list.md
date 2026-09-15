# 【TRIBE NEON】Phase 2 グラフィックアセット全再定義 ＆ 統合マスターリスト (Assets Master List)

作品全体のアートディレクション、追加アセット制作、AI生成、広告クリエイティブおよびAsset QAは`art_bible.md`を正本とする。本書は対象アセットと個別パスの管理台帳として扱う。

本ドキュメントは、Phase 2 において生成・透過処理・組み込みを行うすべてのグラフィックアセット（**全60キャラクター**、**背景画像**、**スキル/装備/アイテム/演出素材**、**UIパーツ/称号バナー**）を完全に網羅・リスト化したマスター仕様書です。

> **現行Production参照（2026-08-21以降）**: 本書の旧ルート直下パス、`member_*`仮名、PNG背景パス、未作成一覧は制作履歴です。Runtime正本は`src/domain/gameplay/canonical/data/`と`src/domain/presentation/production_creatives.ts`、配置信頼性の正本は`specs/production/gameplay_foundation/character_alpha_release_audit_20260821.md`および`scripts/verify_final_asset_production.mjs`です。60体画像を再生成・再設計する根拠として本書を使用しません。

---

## 1. 全60キャラクター再定義 ＆ アセット管理リスト (全60名)

すべてのキャラクターは緑背景（`solid chroma key green background`）で画像生成し、Node.js スクリプト `scratch/chromakey.js` を用いて透過アルファPNG加工を行い `public/` へ配置します。

### ① SSR ＆ 主要キャラクター (8名) + エネミー流用マッピング

| キャラID | キャラ名 (JP) | 属性 | レア | 立ち絵ファイルパス (`public/`) | エネミー/ボス流用 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `11111111-...` | **レイジ** | 秩序 | SSR | `/reiji_transparent_asset.png` | GvG防衛NPC (`gvg_defense_0`) |
| `33333333-...` | **ルイ** | 混沌 | SSR | `/rui_transparent_asset.png` | GvG防衛NPC (`gvg_defense_1`) |
| `22222222-...` | **チャン** | 悪 | SSR | `/chang_transparent_asset.png` | GvG防衛NPC (`gvg_defense_2`) |
| `44444444-...` | **レオン** | 悪 | SR | `/leon_transparent_asset.png` | PvPダミー / GvG防衛NPC (`gvg_defense_4`) |
| `55555555-...` | **ユウキ** | 秩序 | SR | `/yuki_transparent_asset.png` | レイドボス (`BOSS_001` 新宿カイザー) / GvG (`gvg_defense_3`) |
| `66666666-...` | **カイト** | 混沌 | SR | `/kaito_transparent_asset.png` | PvPダミー (`pvp_dummy_0` リュウ) |
| `77777777-...` | **コハル** | 正義 | SR | `/koharu_transparent_asset.png` | PvPダミー (`pvp_dummy_1` カイ) |
| `99999999-...` | **サクラ** | 悪 | SR | `/sakura_transparent_asset.png` | PvPダミー (`pvp_dummy_2` シン) |

---

### ② 構成員キャラクター (009 〜 060 / 計52名)

| キャラID | キャラ名 (JP) | 属性 | レア | 立ち絵ファイルパス (`public/`) |
| :--- | :--- | :--- | :--- | :--- |
| `a0000000-...009` | **構成員_009 (スカウト)** | 正義 | SR | `/member_009_transparent_asset.png` |
| `a0000000-...010` | **構成員_010 (ディーラー)** | 悪 | SR | `/member_010_transparent_asset.png` |
| `a0000000-...011` | **構成員_011 (ヒットマン)** | 秩序 | SR | `/member_011_transparent_asset.png` |
| `a0000000-...012` | **構成員_012 (用心棒)** | 混沌 | SR | `/member_012_transparent_asset.png` |
| `a0000000-...013` | **構成員_013 (ハッカー)** | 正義 | SR | `/member_013_transparent_asset.png` |
| `a0000000-...014` | **構成員_014 (拳闘士)** | 悪 | SR | `/member_014_transparent_asset.png` |
| `a0000000-...015` ~ `030` | **構成員_015 〜 030** (16名) | 各種 | R | `/member_015_transparent_asset.png` 〜 `/member_030_transparent_asset.png` |
| `a0000000-...031` ~ `060` | **構成員_031 〜 060** (30名) | 各種 | N | `/member_031_transparent_asset.png` 〜 `/member_060_transparent_asset.png` |

---

## 2. 背景画像 (Background Images) 全洗い出しリスト

拠点および各画面の雰囲気を決めるシームレス全画面キャンバス用背景画像一覧。

| アセット分類 | アセット名 | 保存ファイル名 (`public/bg/`) | 概要・用途 |
| :--- | :--- | :--- | :--- |
| **拠点背景** | **新宿 歌舞伎町** | `/bg/bg_street_shinjuku.png` | 新宿拠点滞在時のマイページビジュアル背景 |
| **拠点背景** | **渋谷 センター街** | `/bg/bg_street_shibuya.png` | 渋谷拠点滞在時のマイページビジュアル背景 |
| **拠点背景** | **池袋 裏通り** | `/bg/bg_street_ikebukuro.png` | 池袋拠点滞在時のマイページビジュアル背景 |
| **拠点背景** | **六本木 ナイトクラブ前** | `/bg/bg_street_roppongi.png` | 六本木拠点滞在時のマイページビジュアル背景 |
| **拠点背景** | **秋葉原 電気街** | `/bg/bg_street_akihabara.png` | 秋葉原拠点滞在時のマイページビジュアル背景 |
| **拠点背景** | **川崎 工業地帯** | `/bg/bg_street_kawasaki.png` | 川崎拠点滞在時のマイページビジュアル背景 |
| **拠点背景** | **横浜 港湾エリア** | `/bg/bg_street_yokohama.png` | 横浜拠点滞在時のマイページビジュアル背景 |

旧架空拠点名を持つ`bg_base_*.png`は互換参照が残るレガシーアセットであり、新規制作の正本には使用しない。未作成のバトル・ガチャ・ギルド背景は実在するものとして本表へ記載せず、不足アセット台帳で管理する。

---

## 3. アイテム・スキル・装備・演出素材リスト (未作成不足分)

### ① スキルカードアイコン (100種)
- アイコンファイル名: `public/skills/skill_001.png` 〜 `skill_100.png`
- 枠アセット: `public/skills/frame_n.png`, `frame_r.png`, `frame_sr.png`, `frame_ssr.png`

### ② 装備品アイコン (100種)
- 武器アイコン: `public/equipments/eq_w_01.png` 〜 `eq_w_40.png`
- 防具（頭/胴/足）: `public/equipments/eq_a_01.png` 〜 `eq_a_40.png`
- アクセサリー: `public/equipments/eq_acc_01.png` 〜 `eq_acc_20.png`

### ③ アイテムアイコン (10種)
- スタミナ回復: `public/items/item_energy_drink.png` (`エナジードリンク`)
- キャラ育成素材: `public/items/item_exp_book_s.png`, `item_exp_book_m.png`, `item_exp_book_l.png` (`経験の書`)
- 装備強化素材: `public/items/item_custom_oil_s.png`, `item_custom_oil_m.png`, `item_custom_oil_l.png` (`カスタムオイル`)
- 覚醒素材: `public/items/item_awakening_book.png` (`覚醒の書`)
- 限界突破素材: `public/items/item_lb_skill.png`, `item_lb_equipment.png`

### ④ バトル演出エフェクト (8種)
- ヒットエフェクト: `public/effects/fx_hit_slash.png`, `public/effects/fx_hit_impact.png`
- バフ/デバフ: `public/effects/fx_buff_atk.png`, `public/effects/fx_shield.png`, `public/effects/fx_heal.png`
- カットイン背景: `public/effects/fx_cutin_ssr.png`, `public/effects/fx_cutin_sr.png`

---

## 4. UIパーツ ＆ 称号バナー ＆ フレーム素材リスト

### ① 丸型漢字メニューボタン (3種・透過PNG)
- 連合ボタン: `public/menu/menu_allies.png` （赤グラデーションベゼル + 「連合」漢字）
- 喧嘩ボタン: `public/menu/menu_fight.png` （青グラデーションベゼル + 「喧嘩」漢字）
- 制圧ボタン: `public/menu/menu_conquest.png` （緑グラデーションベゼル + 「制圧」漢字）

### ② ギルドレベル外枠ベゼル (4種)
- Lv1〜5 (銅): `public/guild/bezel_bronze.png`
- Lv6〜15 (銀): `public/guild/bezel_silver.png`
- Lv16〜29 (金): `public/guild/bezel_gold.png`
- Lv30 (脈動ゴールド): `public/guild/bezel_pulse_gold.png`

### ③ 順位バッジ ＆ 称号バナー (6種)
- ランキング1位 (ゴールドバッジ): `public/rank/badge_rank1.png`
- ランキング2位 (シルバーバッジ): `public/rank/badge_rank2.png`
- ランキング3位 (ブロンズバッジ): `public/rank/badge_rank3.png`
- 称号バナー枠 (極道/裏社会スタイル): `public/titles/banner_frame_standard.png`, `banner_frame_gold.png`, `banner_frame_dark.png`

---

## 5. アセット生成 ＆ 自動クロマキー透過パイプライン手順

1. **画像生成プロンプトの送信**:
   - `generate_image` ツールを用いて、対象キャラクターを `solid chroma key green background` 指定で作成。
2. **自動透過スクリプトの実行**:
   - `node scratch/chromakey.js <生成画像パス> <保存先publicパス>` を実行して背景緑色ピクセルを完全アルファ0透過。
3. **開発サーバー (`http://localhost:3000`) での目視確認**:
   - 立ち上げ中の開発サーバーにて画面上の表示をリアルタイム検証。
