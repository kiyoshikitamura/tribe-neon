# アセット定義書：戦闘演出 ＆ 特殊エフェクトパーツ一覧 (assets_battle_effects.md)

> **2026-09-12更新：** 課金・ショップ・スペシャルガチャ・専用演出・購入分の期限については、[課金公開・統合設計書](monetization_release_20260912.md)を現行仕様とする。本書の該当する旧記述は履歴であり、新規実装の根拠にしない。対象外の仕様は本更新で変更しない。

本仕様書は、タイムライン制オートバトルで使用される戦闘演出、カットイン、特殊アセット、および状態バッジアイコンの**全必要アセットリスト**と、**画像生成用プロンプト・制作パラメータ**をまとめた定義書です。

---

## 1. 制作規約 ＆ 透過処理ガイドライン (Matte Outlaw UI)

### ① 世界観・ビジュアルスタイル
- **テーマ**: 現代ストリート・アウトロー (Matte Outlaw UI)。
- **禁止表現**: サイバー、SF、未来、ホログラム、ネオン光線自発光。
- **推奨質感**: つや消しブラック（Matte Black）、つや消しスチール、つや消しゴールド、実体感のある火花・爆煙・金属光沢・薬品スプラッシュ、新宿/渋谷の夜のネオン看板が鈍く反射する環境ライティング。

### ② 画像生成 ＆ 自動透過処理仕様 (Chroma Key Green)
- アイコンやエフェクト単体素材は、画像生成ツールにて **`solid chroma key green background (#00FF00)`（単色緑背景）** を指定して生成します。
- 生成後、Node.js用透過処理スクリプト（`scratch/chromakey.js` / Jimpライブラリ）により、背景の緑色（アルファ値0）を自動削除・透過PNG加工し、`public/images/effects/` 配下へ格納します。

---

## 2. 必要アセット一覧 ＆ 生成用プロンプトシート

---

### カテゴリA: カットイン ＆ 画面演出用アセット (UI & Overlays)

#### A-1. `cutin_bg_sr.png` (SR用カットイン背景帯)
- **用途**: SRスキル発動時、画面中央を横断するカットイン帯背景。
- **仕様**: 1200x240px, 半透明透過PNG。
- **プロンプト例**:
  > `horizontal UI cut-in banner, matte dark steel metal texture, brushed silver bevel border, subtle dark street streetware apparel style, dark gradient overlay, clean transparent edges --no cyber, futuristic, hologram`

#### A-2. `cutin_bg_ssr.png` (SSR/専用用 豪華重厚カットインフレーム)
- **用途**: SSRおよびキャラ専用スキル発動時、画面中央に配置される豪華演出ベゼル。
- **仕様**: 1200x320px, 透過PNG。
- **プロンプト例**:
  > `luxury heavy metallic UI banner frame, matte black steel plate with polished gold metallic bevel edge, dark outlaw street gang aesthetic, aggressive streetware bevel, high details --no cyber, futuristic, neon glow`

#### A-3. `fx_screen_darken.png` (全画面暗転シート)
- **用途**: SSR/専用スキル発動時に画面全体を落とす暗転グラデーション。
- **仕様**: 1080x1920px (9:16縦長), 半透明PNG。
- **プロンプト例**:
  > `full screen dark vignette background, matte black atmosphere, subtle dark smoke texture at the edges, clean center --no bright lights, cyber`

#### A-4. `fx_speed_lines.png` (ダイナミック暗色集中線)
- **用途**: 必殺技演出の迫力を高める背景集中線。
- **仕様**: 1080x1920px (9:16縦長), 透過PNG。
- **プロンプト例**:
  > `action speed lines overlay, dark charcoal and metallic grey dynamic radial lines, transparent background, high contrast street action aesthetic`

---

### カテゴリB: 特殊攻撃 ＆ インパクト系エフェクトアセット (Special FX)

#### B-1. `fx_heavy_impact.png` (泥臭い打撃・爆発衝撃波)
- **用途**: 高威力打撃・鉄パイプなぎ払い・爆発の着弾演出。
- **仕様**: 512x512px, クロマキー緑背景 ➔ 透過PNG。
- **プロンプト例**:
  > `gritty street combat impact shockwave, bursting dust and sharp metallic debris, dark outlaw street brawl splash, solid chroma key green background --no cyber, futuristic, hologram`

#### B-2. `fx_heavy_slash.png` (金属大斬撃痕)
- **用途**: 仕込み刀や刃物による大斬撃一閃演出。
- **仕様**: 512x512px, クロマキー緑背景 ➔ 透過PNG。
- **プロンプト例**:
  > `sharp metallic blade slash trail, glowing steel katana sword swing arc, realistic spark particles, solid chroma key green background --no cyber, futuristic, hologram`

#### B-3. `fx_muzzle_flash.png` (銃口火花 ＆ バースト爆煙)
- **用途**: 銃撃・一斉射撃・バーストショット演出。
- **仕様**: 512x512px, クロマキー緑背景 ➔ 透過PNG。
- **プロンプト例**:
  > `tactical pistol muzzle flash flare and gun smoke, bullet fire sparks, realistic military tactical firearm blast, solid chroma key green background --no cyber, futuristic`

#### B-4. `fx_acid_splash.png` (強酸・毒性薬品スプラッシュ)
- **用途**: 強酸スプレー、毒針、化学デバフ演出。
- **仕様**: 512x512px, クロマキー緑背景 ➔ 透過PNG。
- **プロンプト例**:
  > `toxic acid liquid spray splash, corrosive yellow-green chemical droplets, liquid dynamic splash, solid chroma key green background --no cyber, futuristic`

#### B-5. `fx_shield_heavy.png` (透過ライオット防犯シールド)
- **用途**: 防御・全体シールド展開演出。
- **仕様**: 512x512px, クロマキー緑背景 ➔ 透過PNG。
- **プロンプト例**:
  > `heavy tactical riot shield protection barrier, reinforced police ballistic shield mesh, matte dark steel frame, solid chroma key green background --no cyber, futuristic`

---

### カテゴリC: バフ・デバフ ＆ 状態異常バッジアイコン (Status Badges)

すべてのアイコンは **128x128px, クロマキー緑背景 ➔ 透過PNG** として制作します。

| ファイル名 | アイコン種別 | プロンプトデザイン指定 |
|---|---|---|
| `icon_buff_atk.png` | 攻撃力バフ | `red sword icon, matte steel plate, dark street outlaw UI emblem` |
| `icon_buff_def.png` | 防御力バフ | `blue riot shield icon, matte dark metal, tactical armor badge` |
| `icon_buff_spd.png` | 速度バフ | `cyan wing sneaker icon, fast motion streak, streetware badge` |
| `icon_debuff_atk.png` | 攻撃力デバフ | `broken red sword icon, cracked metallic texture, debuff badge` |
| `icon_debuff_def.png` | 防御力デバフ | `cracked blue shield icon, rusted metal plate, debuff badge` |
| `icon_debuff_blind.png` | 暗闇デバフ | `slashed eye icon, dark smoke fog background, debuff badge` |
| `icon_debuff_silence.png` | 沈黙デバフ | `crossed out microphone icon, radio noise waves, debuff badge` |
| `icon_status_poison.png` | 毒状態 | `green skull and acid potion bottle icon, toxic symbol, status badge` |
| `icon_status_bleed.png` | 出血状態 | `crimson blood drop icon with knife slash marks, status badge` |
| `icon_status_stun.png` | スタン状態 | `yellow lightning spark and dizzy stars icon, stunned badge` |

---

## 3. アセット格納先 ＆ コード参照ルール

- **配置フォルダ**: `public/images/effects/` 配下
- **コード参照**:
  - 画像描画コンポーネントにて `/images/effects/fx_heavy_slash.png` のように相対パスで読み込み。
  - 戦闘準備画面（`SETUP`）にて `preloadImages(EFFECT_ASSET_PATHS)` を非同期実行し、事前読み込みを保証。
