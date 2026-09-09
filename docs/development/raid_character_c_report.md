# C: Raid / Character 統合候補の検証

対象は Raid `9fe5909c024f649c47ec8402409936cd79fd1a37` と Character `a02754c98c1d927e36ecdb46d7ac55541828a346` の固定組合せ。全結果を今回の統合worktreeで再実行した。Cは製品コードを変更していない。

## Raid 機械検証

全227件 PASS。内訳: domain 110、Browser 29、clear reward 4、useBattle Room 20、Street presentation 4、activity sync 14、ranking retirement 5、UI cutover 3、top 16、detail 16、top data 6。ログは `outputs/raid-character-c/*.log`。

MVP/Result、同一Replay再読込、ack成功後帰還・ack失敗保持、救援資格、報酬/Present、refresh、認証切替の旧応答破棄、JST日替わりを含む。親が本候補の隔離PostgreSQLで採取した `outputs/raid-detail/actual-display.json` と `outputs/raid-top-data/actual-pg-snapshot.json` を実parser/loaderに通す検証も再実行PASS。これはPostgREST/GoTrue経由の実HTTP認証検証を意味しない。

## Raid 画面検証

`node scripts/raid-character-integration/capture-raid.mjs` PASS。証跡は `docs/development/evidence/raid-character-integration/raid/` のPNG65枚とbrowser-report.json。

12状態（主催者/通常/救援/未参加/撃破/期限終了/読込/取得失敗/未取得/多人数/長名/Guildなし）、390×844/600の参加者プロフィール往復・非重畳・scroll復元、予定/発行/未設定/取得失敗報酬、本文scroll・Present導線・44px閉じる・最下部ボタンhitを再検証した。実RaidRoomBrowserの統合表示でも検証し、375/390/430pxの横はみ出しと出撃準備ボタンhitを確認。

追加top matrixも375/390/430×844と390×600でPASS、`raid-top/` に8枚とreport.json。top-375-844をC目視し参戦中/救援の情報と画像表示を確認。

C目視: `integrated-member-375-top.png`、`integrated-member-430-bottom.png`、`integrated-reward-600-bottom.png`、`integrated-participants-restored-600.png`。主催者と敵の区別、顔crop、貢献の強弱、短高での本文scroll/固定close、footerとの分離は良好。エミュレートしたChromiumであり、物理端末受入は未実施。

## Fresh / Character

Characterブラウザ8件はPASS（375/390/430、短高、空所持、再取得時選択、フィルタ、多数所持）。Fresh最終1件PASS（1.9分）。Fresh専用 `tests/e2e/raid-character-fresh.spec.ts` は既存m9の画面操作を抜粋し、ユーザー・進行状態のseedを除去。初期Mockがmasterを持たないため、`gacha_production_20260830.json`、`characters_20260821.json`、`quests_20260830.json`から全対象の初期masterを補完する。ガチャweightは正本rarity確率を同rarity人数で割り、架空の敵・費用・時間・報酬を作らない（既存Mockのtutorial抽選は決定的順序であり、本番確率の検証ではない）。ほかの補完は親が承認/実装した `mock_rpc_fixture:empty_raid_recoveries=true`（新規ユーザーの未ack履歴なしを返す、復帰処理自体のPASSには数えない）。既存Characterブラウザテストは所持品等を設定するfixture検証として区別する。

初回Character実行はMockに `list_raid_room_battle_recoveries_v1` が未実装のためエラーダイアログが操作を遮り失敗。明示fixture追加後に8件全件再実行PASS。製品のuseBattle/RPC/ackは変更していない。

Fresh初回は未補完gacha pool 0 / masters 0、FREE_GACHAで停止。canonicalガチャmaster補完後はQ1のquests未ロード（所要時間00:00）を確認し、現行quest masterを追加。次にB1旧CSS locatorを現出撃5人のbuttonへ追随した。途中演出の古いCSS/actor座標assertはFreshから外し、実戦闘playback→Resultと主導線の完了確認を保持。

Fresh最終runは新規開始→世界紹介/名前→10連→Lv.7育成→編成→派遣/時短→現StreetBattleViewerで戦闘→Result→完了案内→Mockメール登録→Home→Character HOMEまで完走。`outputs/raid-character-c/fresh-accepted.log` にPASS、`docs/development/evidence/raid-character-integration/fresh/` に主段階画像。`fresh-character-home-390.png`をC目視し、画像・名前・総合力・育成/装備/編成CTAとfooterの表示を確認した。画像応答失敗/pageerrorなし、親修正後のTypewriter render中更新console.errorも最終runでは再発なし。

再実行コマンド: `PLAYWRIGHT_PORT=3015 PLAYWRIGHT_REUSE_SERVER=true npx playwright test tests/e2e/raid-character-fresh.spec.ts tests/e2e/character-home.spec.ts --workers=1`（PowerShellでは各環境変数を `$env:` で設定）。Freshの保存値はアプリが通常操作で生成したもので、最終AUTHENTICATION stepをread-only確認した。

## 残件

- 実HTTP認証、実機、Preview/Productionは未検証。
- build/type/lint/最終commitは親担当。
