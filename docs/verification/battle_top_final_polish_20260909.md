# Battle TOP 最終ブラッシュアップ / FIX候補

- Accepted Base: `502c41f22d66a1d3df74db490e2a7284b925326b`
- 前回統合Preview: `2d3b799ba604a99d69516935e5172a5f8f9e395a`
- 今回配信SHA: `0711ca4cb9a31fefb3e6c4e1d4386a498bb58476`
- 固定Preview: https://tribe-neon-qi7g7awum-kiyoshi-kitamura.vercel.app
- Vercel READY、Preview target、Git metadata SHA一致。Production反映なし。

## 変更

- MY TEAM / RIVAL双方をユーザー名に統一。自分はHeaderと同じGameContext.username。立ち絵の代替テキストにはCharacter名を維持。
- Heroに双方のRATE、総合力を表示。Rival CardもRATE優先とし「順位 —」を撤去。
- 両Leaderと「デッキを見る」からMY DECK / RIVAL DECK Dialogへ直接遷移。既存CanonicalDialogとPvpDeckPresentationを再利用。
- My Deckは現在のselectedMembersと取得済みスキルを使用。Rival Deckは現在の選択相手のdefense_charactersを使用。新規query/RPCなし。相手一覧にスキル・装備は含まれないため、追加取得や推測表示はしない。自分も既存PvPデッキ表示範囲（CharacterとSkill）を維持。
- 下部の2つの旧デッキ確認detailsを削除。
- CTA付近に「公式戦 ｜ BP 1消費 ｜ RATE変動あり」を表示。
- Rankingは「現在 / 1位 / RATE … / ランキングを見る」。`#`表記を廃止。順位の取得範囲は従来どおり。
- 順序はHeader→VS Hero→Rivals→Battle Ranking→既存ルール補助→Raid→Guild Battle。
- Raidは既存Raid variantの先頭エネミー立ち絵と既存エリア背景を使用するContent Preview Cardへ変更。非開催時はLIVE等を出さず「開催情報はレイドで確認」。CTAは「レイドを見る」。Raid側のquery/runtime/UIは変更しない。

## RATE増減値の調査

`usePvp.fetchPvpOpponents`が呼ぶ既存`get_pvp_opponents_page`は`win_rating_delta` / `loss_rating_delta`を返す。既存Migration `20260901000216_pvp_main_formation_matchmaking.sql`で、双方とも`canonical_pvp_rating_delta`のサーバー計算結果であることを確認。

数値が取得できた場合だけHeroに勝敗増減を表示。frontendは符号・文字列の整形のみ。独自計算なし。欠落時は「RATE変動あり」を維持。実Previewで+16/-8がレスポンスと完全一致することを確認。

## 検証

- TypeScript PASS、lint 0 errors（既存/ローカル検証ファイルを含む1,723 warnings）、local build / Vercel build PASS。
- Chromium 5/5、WebKit 5/5 PASS。両方で390×844 / 412×915、Safe Area余白、両ユーザー名、RATE、Power、Dialog内容、連打、Ready取消、Ranking/Raid遷移、reload/background/foreground、画像失敗→再取得、サーバー拒否時BP維持。
- Dialogは390px内に収まり、horizontal overflow=0。Accepted Mockは相手3体固定を返すため取得件数を維持。実DBでは5体の相手で検証。
- 実Preview: Home→Battle→相手切替→Rival Deck→閉じる→My Deck（5体/5スキル）→閉じる→Ready→Battle→Result→期待する帰還先。
- 実データ対戦2回、開始RPC各1回、BP 5→4→3。初回「ランキングを確認」、通常「バトルへ戻る」を確認。相手選択/デッキDialogによる追加RPC 0。
- Raidのエネミー表示、Ranking→Raid→Guildの順序、Raidへの遷移PASS。
- 固定PreviewでTutorial開始smokeも両サイズPASS（World→アゲハ紹介→名前入力）。
- `verify:pvp-r8` 18 checks、Battle presentation、MVP result PASS。
- `502c41f`との差分で、src/public/supabase配下の変更はBattle TOP 4ファイルだけ。他1,507ファイルは一致。今回`2d3b799`からのアプリ変更はPvpTab.tsxとBattleTopPresentation.tsx/cssの3ファイル。開始handler引数はAcceptedと一致。
- Formula/RNG/Authority/DB/Migration/Economy/Master/Tutorial/Gacha/Character/Raid/GvG gameplay変更なし。

## 画面証跡

- First View: `scratch/battle-top/polish-after-live-390.png`、`polish-after-live-412.png`
- Dialog: `scratch/battle-top/polish-live-my-deck.png`、`polish-live-rival-deck.png`
- Ranking/Raid: `scratch/battle-top/polish-live-raid.png`
- Safe Area/Mock Dialog: `scratch/battle-top/after-safe-390.png`、`after-safe-412.png`、`polish-my-deck-390.png`、`polish-rival-deck-390.png`（412版もあり）
- 結果: `scratch/battle-top/polish-live-results.json`、`transplant-parity.json`、`scratch/polish-e2e2.log`、`polish-webkit.log`

## 残り

新固定PreviewのiPhone実機最終確認待ち。自動/WebKit検証は実機Safariのbrowser chrome操作そのものを代替しない。前回記載のAccepted由来`pvp-r9 / bio edit`は対象外の既存事項として残す。Production反映なし。
