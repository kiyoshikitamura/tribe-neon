# 第6工程 未確認項目の補完

配信source: `2d2d2b1563e92f1471f9c86fa8a7cc59040ec726`。
既存証跡: `b8ad912782f49fb6a58eef4f12b0cea95856e4f0`。
補完branch: `codex/raid-step6-supplement-20260909`。
固定Preview: https://tribe-neon-gcg8o8bcu-kiyoshi-kitamura.vercel.app 。接続先 `sufvuqdnqohpfzkwxohq`。

SQL再投入・再配信・Production/main/alias/Edge/Cron/flags変更なし。前回のPASSを無条件に再実行せず、以下の未確認経路を追加した。

## A 実UIの新規出撃 — PASS

新専用QA Room `513fddee-eac1-481b-8b2b-8d273131bbef`、主催者は既存normal QA。通常HP28,000,000で作成し、UIの参戦中→戦況→出撃準備→討伐開始を操作した。開始は実UI1回、同じ開始payloadの実HTTP再送1回、同Replay再読込、UI ack1回、元Roomへの帰還を確認。

- request `3ce0079f-7fc9-4348-a128-e71e55c4c896`
- Replay `b481f2d7-80db-425f-9786-123ae7d4f9f8`
- RP 4→開始後3→再送後3→復帰/ack後3。DBの開始要求1件・cost1・FINALIZED/ack済みと一致。自然回復時刻も不変で、回復による増分と消費を混同していない。
- 正規戦闘damage4,995、残HP27,995,005。今回HP短縮なし、撃破には未到達。

初回は遅れて出た既存Guild通知で操作待機が止まり、start/resolve/ack0を確認して通常閉じる操作を修正した。同Roomを再利用し、新規作成・出撃を重複させていない。出撃準備の画像集計selectorは0件だったため機械画像PASSとはせず、実PNGを親とAで目視した。将来用scriptのselectorを修正したが追加戦闘は実行していない。

同Replay再読込で背景が変化する見た目の差分を確認。Replay/MVP/ダメージ/残HP/RPは一致している。背景一貫性は後続UI修正の残件であり、今回配信sourceは変更しない。

## B 公開範囲・条件

Guild外専用匿名QAを通常Auth/Setupで初期化。親がそのsubject1件だけ既存KPI分類機構で登録時からqaへ分類し、別接続で確認した。通常ユーザーの分類・所属・権限は変更していない。

最初のAuth-only QA `351cc041-43d4-4f6b-b965-7c408952d64c` はstdin接続不備でメモリ内セッションを再利用できず、ゲーム未初期化のまま保持した。プロセスメモリから認証情報を取り出さず、その専用プロセスだけ終了。ファイルgateのローカル確認後、追加1件 `796dfc87-d4dd-42dc-b6c2-5657334cc825` を作成して継続。認証情報の保存・ログ出力なし。

既存normalで新QA RoomのActivity/Guildへ各1回救援を公開。同request再送でも同じ2出典・回数1を保持。Guild外からの実HTTPで開催中/撃破済みのActivity情報を取得でき、Guild限定は単体403/42501・カード0件を確認した。

Guild外QAは通常Setup・ガチャ・編成・クエスト初級1回/中級2回・無料時短3回・正規帰還報酬でLv5へ到達。中級2戦は敗北であり、400XPずつは既存の派遣完了報酬。戦闘勝利や直接XP更新とは扱わない。PvP・課金時短は使っていない。

実UIで全体Activityカード→対象詳細→「参加する」を操作し、`join_raid_room_rescue_v1` 200、`viaRescue:true`、Room `513fddee-eac1-481b-8b2b-8d273131bbef`、救援ID `4be49290-8be1-48d6-af5e-110d135d5b22` の保持を確認。未所属のまま「救援参加」・登録2人となった。親が390px PNGを目視確認。追加のレイド出撃はしていない。

Lv5のnormalは総合力78,228。中級160,000の新規受付を403/42501 `raid power requirement` で拒否し、RP3のままを確認。新FreshのLv不足とは別に検証した。

親の390px画像確認では最低総合力160,000の表示を確認したが、条件不足でも「この敵に挑む」は有効。受付後に「作成できませんでした。時間をおいて同じ内容で再度お試しください。」という汎用エラーになる。サーバー拒否はPASS、条件不足に応じた操作/説明と内部用語の整理は未修正のUI残件。中級の新規受付を検証した結果であり、中級の開催済みレイドへの登録参加拒否までPASSとしない。

終了済のActivityカードは「撃破済み」「戦況を見る」、遷移先は同じRoom/救援ID・HP0・討伐済み・参加disabled。briefingは200で `joinEligibility` 不可/`room_ended` を返す。親もPNGを目視確認した。終了Roomへの参加RPCそのものは未実行。対象は前工程のHP短縮fixtureで撃破したRoomであり、自然失効の証明ではない。

## C 初期装備403 — 現配信FAIL、ローカル候補検証PASS

最新Characterの確認済みHEADは `91f7a7d937fbbf427bfbaada0547f38c244e9a11`。その作業tree/報告と親のthread照合、ローカル全refs履歴でも、初期装備の権限修正は確認できない。`1a38636a4d8d24ce948b1467f4da974cb17cdb3d` は仮装備を表示しない修正であり、403とは別。

原因はGameContext初期化の5件直接INSERTと、SQL121によるauthenticated INSERT禁止の不整合。一般INSERT権限は復活させない。新規user初期化時だけ付与資格を記録し、正規tutorialガチャ後の本人へ固定5種を原子的に付与するローカル候補を準備した。

今回の新Freshでも通常reload/resume時にPOST `/rest/v1/user_equipments` 403/code42501を実responseで再確認。仮装備表示の抑止とは別に、実保存失敗が継続している。通常進行中の別エンドポイントの409/404/500等は付随する未分類事象としてB証跡へ残し、Fresh全体をPASSにしない。

候補は既存空所持から初回と推測せず、既存403ユーザーへ自動遡及しない。売却/reset後の再付与を防ぐ永続receipt、users→receiptロック、途中失敗の全rollback、再送同receipt、保存済みrowだけのUI/総合力投影、認証切替後の旧応答破棄を検証。先頭キャラ選択やreset後の扱いは候補前提であり、正式採用の承認事項。

- PGlite SQL15群PASS、projection6群PASSを親が再実行。台帳のFKはON DELETE CASCADEとし、正規アカウント削除を阻害せず、usersを保持する通常resetでは再付与しないことも確認。
- GameContext置換案を仮想コンパイラへ渡して371ファイルの型検証、diagnostics0。製品ファイルは編集していない。
- `parent-equipment-projection.patch` は `git apply --check` PASS、未適用。
- 正式migration未生成・外部適用なし。実多接続、完全なreset統合、実HTTP保存成功、既存403ユーザー救済は未確認。実Fresh全体はPASSにしない。

詳細と局所候補は [C報告](raid_step6_supplement_c.md)。

## 自然失効・討伐の区別

既存自然失効確認Room `3972a461-b45f-4b02-8142-75f294461ae3` は16:05 JST読取でACTIVE、32M/32M、期限2026-09-09 19:40:55 JST、room/boss MD5は前回証跡と一致。期限前であり自然失効完了の証跡はないため未確認のまま。期限/HPを書き換えていない。

前回第6工程の討伐/Present検証はHP短縮fixtureを使った試験。今回AはHP短縮せず正規出撃・消費を確認したが未討伐。どちらも通常HPからの自然討伐完走PASSとは扱わない。

## 人の実機受入と残件

人によるSafari実機受入、自然失効、通常HP全量の自然討伐は未確認。初期装備の候補採用/既存ユーザー救済、実多接続/実Fresh成功、同Replay背景一貫性を引き継ぐ。

## 配信保持・証跡

16:30 JSTに専用deploymentのsource SHA一致・READY・接続先Preview・aliasなしを再確認。既存75 aliasの差分0、Production参照SHA550c02225cbecb6ba6f174ee3fb952bcaae2f6ddも不変。保存済CLI認証を使った最初の読み取りは403となったが、公式CLIの通常inspect成功後の再読取は成功した。ゲームの初期装備403とは別の読み取り認証事象。

別接続SELECTで初期装備候補RPC/台帳がPreviewに存在しないことも確認。SQL再投入・配信変更は実施していない。

画面: [出撃準備](evidence/raid-step6-supplement/a-setup.png) / [Result](evidence/raid-step6-supplement/a-result.png) / [元レイド帰還](evidence/raid-step6-supplement/a-returned-room.png) / [総合力不足の表示](evidence/raid-step6-supplement/b-normal-power-refused.png)。

公開救援: [Guild外のActivity](evidence/raid-step6-supplement/b-outsider-activity.png) / [救援参加後](evidence/raid-step6-supplement/b-outsider-joined.png)。

終了救援: [撃破済みカード](evidence/raid-step6-supplement/b-outsider-ended-card.png) / [終了詳細](evidence/raid-step6-supplement/b-outsider-ended-detail.png)。

今回の型検証は未適用の初期装備表示候補のみ。配信製品source・既存migration・依存関係を変更しておらず、以前のbuild/PASSを今回の新規実行結果へ転記していない。

補完scriptsのlintは12ファイル・error0/warning0。既存アプリ全体の警告件数を今回の新規lint結果と混同しない。証跡は明示した36ファイルだけ収集し、認証情報・JWT・秘密鍵のテキスト検査を実施。保存画像10枚は親が目視確認した。storageState/認証token/HAR/処理中commandや未追跡outputs全体をcommit対象にしていない。

ステージ59ファイルは今回新設した報告/候補/検証script/証跡に限定。全36証跡のSHA-256をGit index内の実バイトと照合し一致、秘密情報検査と差分範囲検査もPASS。既存source/証跡は変更なし。差分の空白検査は原文の空白を保存する未適用patchのみ除外し、そのpatchは別に `git apply --check` PASSを確認した。

担当別詳細: [A](raid_step6_supplement_a.md) / [B](raid_step6_supplement_b.md) / [C](raid_step6_supplement_c.md)。専用QAブラウザー/processは終了済み。
