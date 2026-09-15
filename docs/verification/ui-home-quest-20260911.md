# GAME03 MyPage・Navigation・Quest 統合実装記録

2026-09-11。STATUS: PARTIAL — 実装・ローカル検証完了、専用Preview・実機受入は未完了。

## 基準と分担

- Base: `a744f9879320310bf72d66b955e401bf0eda048e`。
- Authority: `GAME03_UI改善_一括実装開始指示_2026-09-11.md`、最新のMyPage4入口FIXとユーザー承認。
- 親は管理・レビュー・統合。Home/NavigationとQuestを子エージェントが並行実装。
- ガチャ受入済み候補 `29d21c3a1c8ba248efe814e567cdb21b2f4bf54e` は別管理。本候補にガチャSQLを混在させていない。

## 実装

- 初回NavigationにQuestを挿入。Character代替実績を受理し、Guild取得待ちを初回CTA前提から除去。完了済みを再開させず、Raid未達を偽完了にしない。
- MyPageをQuest/Battle/Raid/Guildの4入口へ変更。既存キャラ領域のCSSは保持し、追加CTA行は作らない。既存画像を仮素材として使用。
- 討伐Activityと未知Activityの文言を修正。
- Questの状態を受取可能/戦闘待ち/派遣中/不明に分け、同状態は開始時刻順。現行masterのCASH・時間・Energyを表示し、未定義総合力0や付与のない説明を除去。
- 通常Questの実BattleResultと非戦闘Resultに全獲得アイテムを接続。同コースのキャラ選択へ戻る操作を追加し、自動消費を行わない。
- 時短の既存無料5回/JST日・有料30DIA/回、10回/JST日を維持。取得済みownerに基づく残数表示、有料確認、復帰/日替わり/拒否後の再取得。
- Tutorial専用Resultの既存互換を保持。

## 検証

| 項目 | 結果 |
|---|---|
| TypeScript | PASS |
| 最終 `NEXT_PUBLIC_USE_MOCK_DB=true NEXT_PUBLIC_APP_ENV=preview npm run build -- --webpack` | PASS |
| 初回Navigation・Activity・既存日次Mission契約 | PASS |
| Quest状態境界・並び順・入力不変 | PASS |
| 既存Quest結果liveness | PASS |
| diff check | PASS |
| 旧short tutorial character setup検証 | FAIL。WORLD_INTROとFREE_GACHAの不一致。変更前でも同一失敗、今回の修正対象外 |
| ESLint | 未実行。eslint-plugin-react-hooks依存不足 |
| 通常Turbopack build | 環境エラー。共有node_modulesの外部symlink非対応。webpack buildで検証 |
| モバイルgeometry・実機 | 未実施。ブラウザruntime不足 |
| 専用Preview | 未公開。Vercel認証・管理ツールが現在のWorkにない |

`scripts/verify_home_geometry.mjs` を準備済み。320/390/412pxの既存Homeシナリオ、4入口、最大1強調、キャラ矩形・メニュー高・バナー上端を取得し、変更前JSONと比較する。欠損画像は別判定。ローカル以外への通信を遮断する。

## 表示上の残件

- HomeのQuest/BPにはowner付き取得完了契約がないため、補助状態は現段階で省略。Raidは開催trueだけ表示し、参戦/救援の集約状態は未接続。4入口の操作は可能。
- アイコンの最終モチーフは未承認。新規画像は制作していない。
- 部分cloneによりpublic画像blob未展開。画像を含むPreviewで見切れ・キャラ表示・バナー位置を確認するまでUI受入PASSとしない。

## 次工程

1. 認証済みVercel環境で候補SHAを専用Previewへ配信。既存のREST配信方式はtarget省略、alias空、autoAssignCustomDomains=false。Productionへ接続しない。
2. 5枠混在、実Result全items→同コース選択、有料確認、JST復帰、初回Guide、Tutorial回帰をPreview上で確認。
3. 同条件の変更前後画面・geometryを比較。素材が仮である箇所と未実施の実機項目を明示して一括レビュー。
4. ガチャとUIを別リリース単位として判断。本番反映は別承認。

変更: ゲームフロントエンド・ローカル検証・記録のみ。DB/Migration/Master/Production/Deploy/alias/Feature Flag変更 NONE。
