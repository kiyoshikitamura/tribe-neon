# プレリリース素材台帳 — 2026-09-02

Status: **REPOSITORY INVENTORY COMPLETE / HUMAN CREATIVE ACCEPTANCE PENDING**

本書はRepository内の実体、Runtime参照、Production Freezeを照合したプレリリース台帳である。画像の生成・削除・移動・差し替えを承認する文書ではない。

## 1. 正本と優先順位

1. Gameplay/Character: `src/domain/gameplay/canonical/data/`と2026-08-21 Production Freeze
2. Production Creative x9: `src/domain/presentation/production_creatives.ts`
3. Runtime asset guard: `scripts/verify_final_asset_production.mjs`
4. 旧Phase 2資料と`open_beta_provisional_*`の名称は履歴・後方互換であり、現行Production statusを上書きしない

## 2. Runtime素材インベントリ

| 分類 | 現行数 | 技術状態 | プレリリース判定 |
|---|---:|---|---|
| Character | 60 | 60/60、768×1376、RGBA、Alpha Gate PASS | 欠損なし。再生成禁止。端末表示のみ確認 |
| Skill | 105 | basic 5 + skill 100 | Runtime masterとの対応をverifierで維持 |
| Equipment | 170 | 170/170、RGBA | 欠損なし |
| Item | 18 | 18/18、512×512、RGBA | 欠損なし |
| Town background | 7 | `bg_street_*.jpg` | 欠損なし |
| Gacha background | 3 | `bg_gacha_*.jpg` | 欠損なし |
| Production promotion | 14 | Gacha 6 + My Page 3を含む | Creative x9の端末Human Acceptanceが必要 |
| Favicon | 1 ICO | 16/32/48/256を内包 | Browser faviconとして利用可 |

## 3. 未確定・ユーザー確認が必要な素材

| 対象 | 現状 | 必要な判断 | 自動fallback |
|---|---|---|---|
| OGP image | 専用1200×630なし。`layout.tsx`にもOpen Graph/Twitter image指定なし | 最終構図、ロゴ、コピー、共有時のsafe area | 不可。未設定のまま公開しない |
| Apple Touch Icon | 180×180専用画像なし | 既存ブランドからの切出し承認 | Browser faviconでの代用をProduction確定にしない |
| Web App Manifest Icons | `manifest.ts`は追加済みだがfavicon参照のみ。192/512 PNGなし | PWAをプレリリース範囲へ含めるか | PWA非対象なら明示OMIT可 |
| 追加48体の表示title | 互換moduleに`暫定キャラクター`が残る。これは画像statusではない | 正式な通り名masterがないため、表示を維持・非表示・正式値提供のいずれかをProduct判断 | 推測した通り名へ置換しない |
| Gacha Creative x6 | 6/6接続済み | 390×844、412×915、desktop-shellのcrop/可読性 | 画像fallbackでPASS扱いしない |
| My Page Banner x3 | 3/3接続済み | rotation、crop、01=`guild`、02=`raid`、03=`null` | 将来の部分配信時のみ旧2-banner fallback可 |
| 初心者パックbanner | `/banner_beginner_pack.jpg`を参照中 | 課金公開時のCreative・商品表示・Legal整合 | プレオープン準備中なら非露出を維持 |

ユーザーが別途「仮画像」と認識しているものは、画面名またはファイル名をこの表へ追加してから差し替える。Repository上はCharacter 60、Equipment 170、Item 18、正規背景7に欠損はない。

## 4. 許容fallback

- お気に入りキャラクター未設定時の空状態
- キャラクター画像が再試行後も取得不能な場合の準備中表示
- ユーザーがギルドエンブレムを未設定の場合の空状態
- Gacha結果の個別画像取得失敗時のテキスト表示

fallbackは障害耐性であり、Canonical assetの恒常欠損を合格にするものではない。

## 5. Runtime使用禁止・保管専用

`scripts/verify_final_asset_production.mjs`により次をRuntime参照禁止とする。

- `/old/`
- `/raw_assets/`
- `event_banner_placeholder`
- `bg_base_*`
- 旧root character asset
- 旧PNG形式のGacha背景・初心者パックbanner

`public/menu/event_banner_placeholder.png`、`public/old/`、`public/raw_assets/`はファイル実体があってもRuntimeへ接続しない。

## 6. デプロイ容量監査

2026-09-02の作業環境では`public/`は約385MBであり、次の保管専用候補が含まれる。

| 対象 | 概算 | 状態 | プレリリース対応 |
|---|---:|---|---|
| `public/raw_assets/` | 90MB | Runtime参照禁止の原画 | 削除せず、別承認でデプロイ対象外保管へ移す |
| `public/old/` | 13MB | Runtime参照禁止の旧版 | 削除せず、別承認でデプロイ対象外保管へ移す |
| `public/promotion/X_chara_*` | 約11MB | Runtime未参照のSNS Creative | SNS運用要否を確認し、Web配信対象を分離 |
| 旧形式Gacha promotion PNG | 約4MB | 正本は同名JPGのslotあり | 参照有無を再検証後、別承認で配信対象を分離 |

本監査では移動・削除・圧縮を行わない。先にRuntime静的参照、運用用途、rollback保管先を確定する。

## 7. プレリリースGate

- `scripts/verify_final_asset_production.mjs` PASS
- Character Alpha Gateの60/60維持
- Creative x9の実機Human Acceptance
- OGP / icon方針の明示決定
- 禁止assetへのRuntime参照ゼロ
- 「仮画像」追加指定がある場合、その台帳化と差し替え後のHuman Acceptance

2026-09-02 Repository検証結果:

- `scripts/verify_final_asset_production.mjs`: PASS
- deployed images 486、static references 111
- format mismatch / decode failure / casing error / missing static reference: すべて0
