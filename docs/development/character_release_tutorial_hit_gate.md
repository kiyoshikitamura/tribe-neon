# Character公開候補 — Tutorial命中修正の統合・配信受入ゲート

## 基準と包含判定

- Repository: kiyoshikitamura/tribe-neon
- Character/Card統合基準: 894bcb6cab5984e59ddd6a52cb41a5dbd19813b3
- 修正元: 84a1231845a5e0a82dce91c4f37267e833c1605f
- 作業branch: codex/character-release-tutorial-hit-20260909
- 統合候補SHA: この文書を追加したcommit（git log --diff-filter=A --format=%H -- docs/development/character_release_tutorial_hit_gate.md）。完全SHAは作業完了レシートにも記録する。Production SHAとは別。
- 基準への修正元のancestor判定はfalse。StreetBattleViewerの旧通知分岐にも修正がなく、未包含を確認した。
- 修正元commitの製品差分はStreetBattleViewerの2か所のみ。そのpatchと対応する表示単体/E2Eを適用した。修正元の過去の検証画像・結果を今回のPASSとして転用しない。
- 84a1231全体への切替は行わない。894bcb6との比較でCharacterEquipment/CharacterPartyの削除などがあるため。元commitの親系統や別Raid画面差分は今回の修正差分に含めない。
- 894bcb6のCharacter、共通カード素材、User Identity、Raidコード、DB/Edge/Cron、Masterは保持する。後続Raid系統3ec0450等との全体統合・本番移行完了は今回の検証対象外。これらを含む最新の全領域公開候補と同義ではない。

## 確定した表示契約

従来damagePopup分岐の通常攻撃/スキル命中で、既存street-impact画像をダメージ数字と同じ対象・通知で表示する。命中通知中は旧スキルカットインを解除する。回復/シールドでは攻撃画像を出さない。グループ化ReplayのACTOR/IMPACT/RETURN分岐、HP/ダメージ計算、報酬、ack、Tutorial進行条件は変更しない。Tutorial SKIP非表示を保持する。

## 配信工程へ追加する必須ゲート

単独DeployやDB変更はこの作業に含めない。既存の統合配信工程で以下を行う。Raid Production Authority確定、Migration Bundle確定、Rehearsal PASS、本番DB/Edge/Cron適用、統合Candidate配信、各領域Smokeの既存順序は維持する。

1. 配信担当が統合候補の完全SHAとDeployment ID、URL、環境、配信日時を記録し、今回の2か所の修正とSKIP非表示、確定Character/カード/Raidを実体で照合する。別候補へ取り込む場合もancestorだけでなく差分の包含を確認する。
2. 実接続のチュートリアルで通常攻撃とスキルをそれぞれ発生させる。各対象カードに命中画像が読み込み済みで表示されること、未対象カードや回復/シールドに打撃画像が出ないことを確認する。
3. HP減少、ダメージ数字、命中画像が同じ命中に対応することを録画/時系列記録で確認する。スキル予告後、命中時にカットインが解除されることを確認する。
4. 戦闘中のSKIP非表示、Result到達、次へ操作、チュートリアルの次の会話/継続状態までを通す。重複報酬や進行停止がないことを確認する。
5. 同じ配信実体で通常Battle、Raidの戦闘/Replay復帰/ack後の元Raid帰還/報酬表示、Character HOME/育成/Equipment/Party、共通カードのSmokeを行う。
6. 人が端末で通常攻撃/スキルの見え方、カットイン解除、HP/数字との同期を受入判定する。375/390/430px相当と端末負荷時を含め、担当者・日時・端末・OS/ブラウザー・証跡・結果を記録する。

## 結果は3区分で管理

| 区分 | 状態 | 記録内容 |
| --- | --- | --- |
| コード統合・ローカル検証 | PASS | 候補SHA、型/build、テストログ、Mock時系列/画像を下記結果へ記録 |
| 実接続確認 | 未実施 | 配信SHA、Deployment ID、環境、アカウント識別子（秘密情報不可）、通常/スキル命中、HP/数字、解除、Result/継続、Raid Smokeを個別PASS/FAILで記録 |
| 人による受入 | 未実施 | 受入者、日時、端末、各項目のPASS/FAIL、証跡。自動テストで代替しない |

ローカルMockは既存の1人Lv100とテストスキルのfixtureを使用する。実ユーザーや実DBを変更しない。この成功を実接続/実機/人による受入やProduction反映済みと表記しない。

## ローカル検証結果

証跡: [検証フォルダー](evidence/character-release-tutorial-hit/)。本候補の製品差分で実行した結果であり、実接続・人受入のPASSを意味しない。

| 検証 | 結果 |
| --- | --- |
| 型 | tsc --noEmit PASS |
| Mock production build | NEXT_PUBLIC_USE_MOCK_DB=true / NEXT_PUBLIC_APP_ENV=development / next build --webpack PASS |
| 表示単体 | 9 PASS（旧通知通常/スキル/回復・シールド、通常/Raid Replay、SKIP） |
| useBattle/Raid hook | 20 PASS（Replay/ack/復帰/再送等） |
| Raid画面 | 29 PASS |
| Raid activity同期 | 16 PASS |
| Raid報酬 | 4 PASS |
| Character contract | PASS（装備制約/2slot/選択/Mock回復fixtureの境界） |
| 変更表示・E2E lint | 0 errors、既存方式のimg警告5件（元から4件＋命中画像1件） |
| 保持比較 | Character/Raid/Context/useBattle/rarityAssets/public/supabaseは894bcb6から差分なし。修正後StreetBattleViewerは84a1231と同一内容 |

再実行: npm ci --ignore-scripts --no-audit --no-fund後、上記Mock環境変数でbuild、tsc。表示/Raid単体はtests/raid-room/run-street-presentation-tests.mjs、run-use-battle-room-tests.mjs、run-browser-tests.mjs、run-activity-sync-tests.mjs、run-clear-reward-tests.mjs。RAID_TEST_RUNTIME_DIRにはesbuild/jsdom/React/testing-libraryを持つ検証runtimeを指定する。Character contractはnode --experimental-strip-types scripts/raid-character/verify-character-contract.mjs。

ブラウザーはlocalhost:3197でこの候補のbuildを起動し、既存playwright.config.tsのbaseURLを同URLに、webServerを無効、workersを1にしたローカル設定でtutorial-hit-effects、battle-live-presentation、character-ux-v2の3specを実行する。外部HTTPを遮断したTutorial Mockを含む。前回の修正元証跡は上書きしない。

ブラウザー12件PASS: 通常Battle 3件、Character 8件（375/390/430pxと低い画面）、Tutorial命中→Result→継続1件。時系列は443サンプル、HP変化4件すべてで数字と命中画像が同時に存在、命中とカットインの重複0件、未読込画像0件。通常/スキル画像と継続画面を目視確認した。実接続・人による受入は引き続き未実施。
