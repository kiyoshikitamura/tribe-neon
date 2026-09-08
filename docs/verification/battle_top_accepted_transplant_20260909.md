# Battle TOP Accepted Base監査・載せ替え

## 原因と配信履歴

- 旧Battle TOP: `244a5258cde06dd28ec78ca47a5e9ccc7f03346e`、branch `codex/battle-top-vs-street-hero`。`7584a2b`（VS表示実装）と`244a525`（立ち絵サイズ修正）の2commit。
- 作業Base: `b722f6e6d60c89a58c4cdd9cb945ede0da265850`、`origin/main`。最新Accepted系統ではなかった。mainを最新と判断した監査不足が原因。
- 最新Accepted系統: `502c41f22d66a1d3df74db490e2a7284b925326b`、`codex/iphone14-presentation-hotfix-20260908`。
- 同系統最新Preview: https://tribe-neon-ocgdj2myg-kiyoshi-kitamura.vercel.app （502c41f）。承認済み配信版`3bdefedd9b49fbbadac5ca2bbc832fe10c1b9716`と差分はQA文書のみ。アプリ本体は`eff2f35491efb078cf6f6495dfadadc97f071063`と同一。
- 直前の承認済みProduction: https://tribe-neon-kgkfs7za0-kiyoshi-kitamura.vercel.app （3bdefed）。承認・配信記録: `docs/qa/iphone14-presentation-hotfix-20260908.md`。
- 調査時の現在Production（www/apex）: https://tribe-neon-nzfnw847z-kiyoshi-kitamura.vercel.app （b722f6e、deployment `dpl_6TVTedpFhixiwvbWJd1fktAtRXy9`）。VercelのGitSourceはmain、GitHub自動デプロイ。Quest hotfix系統のmain更新後に、以前の演出承認系統から切り替わっている。本作業では変更しない。
- 共有mobile-preview aliasは`1b77472fb45ee0476a131d7ace0a956a3a96a7a4`を指しており、最新Acceptedの判定には使用しない。
- mainとAcceptedの共通祖先: `826f8b770f36a6f6844d920b0adcd2853188b91d`。単純なmain追随ではAcceptedの演出を復元できない。

## 旧Previewで欠けていた変更

|領域|主な欠落差分|代表ファイル|
|---|---|---|
|Tutorial / Title|TAP TO START後の開始分岐、登録前World導入、World SKIP→AGEHA_INTRO→NAME_INPUT、認証再開、ガチャ完了後の育成・編成進行|TitleView.tsx、SetupView.tsx、TutorialWorldIntro.tsx/css、TutorialAuthentication.tsx、useAuth.ts|
|Home|承認済みキャラ台詞、24時間アクティビティ、イベントAuthorityに基づく告知バナー、初回MyPage到達連携、ログインボーナス表示・導線|HomeTab.tsx/css、Header.tsx、GameContext.tsx、homeCharacterDialogue.ts|
|Gacha|Character Gacha V3（街導入→10体公開→コンパクト一覧）、立ち絵境界補正、専用フォント、SSR台詞、PROCESSING/FLASHINGの街導入、通常時の旧テキストボタンちらつき修正|GachaTab.tsx/css、gacha/CharacterGachaPresentation.tsx/css、gachaStandingBounds.json|
|Character|ガチャ公開終了まで育成を待機、育成完了済み時の再消費防止、育成結果→編成→派遣の進行、共通立ち絵表示更新|CharacterTab.tsx/css、character/CharacterPresentation.tsx、CharacterSystemV2.tsx|
|Battle|Street Ready/戦闘/Result、Ready CTA下部固定、手番枠、SSR演出、MVP/ResultのiPhone収まり、報酬・Replay表示の生存性修正、初回PvP絞り込み、報酬マスタ表示、既存Header、防衛UI撤去|CardBattleView.tsx、battle/StreetBattleSetup.tsx、StreetBattleViewer.tsx、StreetFlow.css、BattleResultSummary.tsx、PvpTab.tsx/css、useBattle.ts|

上記はBase間の差分。今回これらの仕様は変更せず、Accepted Baseをそのまま使用する。mainだけにあるQuest hotfixも別途混ぜない。

## 内容競合と移植範囲

旧2commitの一括cherry-pickは実施しない。`PvpTab.tsx/css`には内容競合があると事前報告し、Acceptedファイル上で表示差分を手動統合した。Git conflict markerの機械的解消はない。

- `BattleTopPresentation.tsx/css`: 244a525から移植。固定領域・画像readiness・再取得・VS・左右Power・CTA・相手カード・Raid/Ranking/GvG入口。
- `PvpTab.tsx`: 選択対象はAcceptedの`displayedOpponents`。初回PvP filter、取得query/RPC、報酬マスタ表示、BP回復、ランキングAuthorityを維持。開始引数はAcceptedの既存handlerを抽出。旧防衛UIを復活させない。
- 既存`/promotion/battle_page_header.webp`は維持。Heroをその下に置き、立ち絵領域を196pxに調整。
- `PvpTab.css`: 編成detailsの補助スタイルのみ追加。
- テスト2ファイルを移植し、最新Title/ログインボーナス/Street Readyの正規導線へ更新。
- Formula/RNG/Replay/Result/Reward/Ranking Authority、DB、Migration、Economy、Tutorial、Home、Gacha、Character、Battle本体、Master DataはAcceptedと同一。

## 検証・固定Preview

検証完了後に結果を追記する。Production反映は禁止。新Previewの実機確認はユーザー待ち。
