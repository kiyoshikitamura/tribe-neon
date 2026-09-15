# Character HOME crop / status badges

2026-09-10、ユーザー指摘の「HOMEのバストアップ」「各所のレアリティ・覚醒表記のバッジ化」を限定修正。

監査: 現本番6d13851はCharacterSystemV2 → CharacterHomeのfull-body表示と本文文字表記を使用。Character担当とRaid統合記録ではV3追加調整は未実装で、過去の固定Preview受入はV3完成の証拠ではなかった。今回を過去受入差分の消失とは扱わない。

- HOMEのみ既存透過立ち絵の胸元までを表示。全60キャラで顔の見切れを確認。
- 一覧、HOME、育成、覚醒前後、装備のキャラ概要、Partyとメンバー候補へ既存rarity / awakening画像を使用。
- rarityフィルタ、スキル・装備の詳細と強化の文字rarityも画像へ統一。
- 覚醒+1〜+5は既存 `getAwakeningBadgeAsset`。未覚醒に架空+0画像は使用せず、比較欄では「未覚醒」と表示。
- 枠、画像自体、育成/装備/Party処理、ステータス計算、Tutorial経路の変更なし。V3全体（高レアeffect等）の完成とは扱わない。
- `NO_DB_CHANGE`。お知らせ・System通知の再送なし。最新6d13851とそのRaid改修を保持。

検証: `scripts/raid-announcement/verify-character-visuals.mjs`で実コンポーネントとCSS・既存素材をbundleし、API/ContextだけをfixtureとしてPC Chromium 1280×900、Mobile WebKit 375×667 / 390×844 / 430×932を操作。HOME切替、一覧、育成、覚醒表示、スキル、装備7枠、Partyと候補、戻る導線、画像読込、横溢れなしをPASS。全60キャラのcropを一覧画像で視認。覚醒+1〜+5の実画像読込PASS。型検査とTutorial Character parity PASS。変更対象lintはエラー0（既存any/hooksとimg警告あり）。証跡: `scratch/character-visual-ui/`。

実ユーザーの本番認証セッションでの操作・実機の人受入は別。DB書込や育成素材消費を伴う操作は行っていない。

配信source: `c1f496f3d3288c06c95de8149c0c92c31727a7e6`
Deployment: `dpl_HEu7jac4QFLcKkoyzVJA2SB3pNAQ`
固定URL: https://tribe-neon-jx86jcwws-kiyoshi-kitamura.vercel.app

本番反映完了: 2026-09-10 04:27 JST。Production build READY、www HTTP200とDeployment ID一致、apex308。ゲーム2aliasのみ切替、他73alias不変。配信30 JS chunksの修正コード、Production Auth/API、既存Raid ticket/Header、全9種badge画像HTTP200、Raid告知バナーhash一致、System通知1件維持を確認。公開URL: https://www.tribe-neon.com/
