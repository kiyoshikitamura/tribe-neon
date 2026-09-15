# RAID-STEP4-B 実装報告

基準8665d29。Bは表示専用3部品とCSS（6ファイル）を実装。子commit/外部接続/DB変更なし。

- RaidRoomRescuePanel: 全体アクティビティ/依頼時の所属Guildの各回数・残回数を分けて表示。元request/getStatus、pending request ID保存/再送、終了・上限到達後の既存要求照会、user切替破棄・block解除は変更していない。各公開先レイドごと3回。Guild所属の有無は既存statusにないため断定せず、未所属なら全体のみという説明を維持。
- RaidRescueLink: Activity/Guild共通カード。追加props entry?:RaidTopEntry/source?。主催者/所属/敵/HP/期限/登録人数は同rescueIdのentryだけ使用。未取得は補完せず、カードごとのRPCなし。終了時は戦況を見る。openRaidRescue(rescueId)を維持し既存サーバー資格確認へ接続。固定人物や勝算を生成しない。新カードはsectionなので親の既存inline包囲要素はflow要素へ調整が必要（共有先へ連絡済）。
- RaidResultDetails: victory/modeResult/roomState/lateFinalizationの表示契約。個人勝敗と共有active/cleared/expired/未取得を区別し、既存stat値と報酬案内を描画。MVP/Replay/ack/returnをこの部品で処理しない。共有側接続は親担当。

検証: B実装直後の全体tsc PASS。対象eslint errors0（既存effect依存とimgのwarnings5）。既存browser29件は27PASS/2FAILで、両FAILとも救援回数を旧1行文字列で比較する期待値のみ。新dl各公開先値へ追随するテスト更新をCへ依頼済。送信再試行/保存/参加/Replay関係は通過。

親統合後の最終型/build/関連回帰とCの実画面撮影・目視はこの時点で待ち。旧工程のPASSを当該検証として扱っていない。

## 追加の表示parser検証

`RAID_TEST_RUNTIME_DIR` に既存ローカルesbuild runtimeを指定して `node scripts/raid-step4/verify-pages-client.mjs` を実行し **36/36 PASS**。同工程Aの隔離PGが出力した `outputs/raid-step4/actual-list.json` / `actual-enemy.json` / `actual-rescue.json` を実parserへ入力した。不正cursor、20件上限、難易度不一致、5体のID/順序、skills欠落と明示空配列の区別、救援識別と公開先、同レイド別救援ID、予定報酬とPresent混在拒否、取得失敗と空成功の区別を確認。結果は `outputs/raid-step4/pages-client-results.json`。製品parser変更なし。

## 第4工程候補での最終独立Character / Setup / Gacha回帰

2026-09-09、このworktreeの最新候補で新規実行。過去工程のPASS転記ではない。製品source変更・build・外部操作なし。

下表はすべて `node --experimental-strip-types scripts/<script>` で実行し、**12 scriptすべてexit 0**。ログは `outputs/raid-step4/b-final-<script>.log`（script内の `/` は `-`）。件数を出さないscriptは1 scriptとして記載する。

| script | 結果・確認範囲 |
| --- | --- |
| verify_tutorial_character_parity.mjs | PASS、canonical60体、reveal/Mock rarity |
| verify_character_awakening_copy_equivalent.mjs | PASS、覚醒曲線1/1/2/3/4、累積11、Cash依存0 |
| verify_mock_secure_skill_loadout.mjs | PASS、所有/slot/専用装備 |
| verify_post_tutorial_loadout_guide.mjs | PASS、Skill/Equipment/推奨編成とmilestone |
| raid-character/verify-character-contract.mjs | PASS、9群、装備拒否時無変更・編成選択identity・復帰fixture |
| verify_mock_secure_equipment_loadout.mjs | PASS、現canonical専用装備・所有/slot・bulk |
| verify_gacha_character_town_backgrounds.mjs | PASS、60体/7エリア/背景7、欠損0/誤対応0 |
| verify_ssr_gacha_quotes.mjs | PASS、SSR10/有効台詞10、重複0/欠落0/未知0 |
| verify_canonical_gameplay_foundation.mjs | PASS |
| verify_canonical_battle_runtime.mjs | PASS |
| verify_canonical_runtime_integration.mjs | PASS |
| raid-step4/verify-setup-measurement.mjs | PASS、4群、既存RPC/共有token/再送key/SQL許容イベント/Setupの接続維持 |

計測scriptは `RAID_TEST_RUNTIME_DIR` が必要。RPCはメモリ内置換であり、HTTP経由の永続化確認ではない。Nodeの既存MODULE_TYPELESS_PACKAGE_JSON警告は出るが全script成功。

ブラウザ回帰は親管理dev3016を再利用し、C撮影とは別browser process/context、workers1で実行した。

```powershell
$env:PLAYWRIGHT_PORT='3016'
$env:PLAYWRIGHT_REUSE_SERVER='true'
node node_modules/@playwright/test/cli.js test tests/e2e/world-intro-skip.spec.ts tests/e2e/gacha-character-v3.spec.ts --workers=1 --reporter=line
```

**17/17 PASS（1.3分）**。Setup6件は375/390/430×844と390×667の即SKIP/二重tap/reload/back、通常導入の全ページとcanonical tutorial、scene transition後timer競合を確認。Gacha11件は順序/詳細/CTA/演出再表示、SSR/非SSR、連打、7エリア導入、reduced motion/keyboard、画像待機/再試行/文字fallbackを確認。ログ: `outputs/raid-step4/b-setup-gacha-final.log`。Fresh全体・実機・計測HTTP永続化は本追加検証の対象外。
