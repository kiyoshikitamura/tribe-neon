# レイドUI 第6工程 専用Preview反映・実接続

固定配信source: 2d2d2b1563e92f1471f9c86fa8a7cc59040ec726。
対象DB: sufvuqdnqohpfzkwxohq。専用branch codex/raid-preview-step6-20260909。Production/main/共有aliasは対象外。後続Character91f7a7dは取り込まない。

## 共有変更枠
KPIとCharacterに親が連絡し、同PreviewでDDL/配信/QAを重ねない回答を受領。既存KPI Cron毎時07/37を含むCron7件を保持。詳細raid_step6_coordination.md。

## SQL反映
原4SQLのSHA256は第5工程計画と完全一致。原ファイルは変更せず、順に連結して内側BEGIN/COMMITだけを除いた固定payloadを単一migration transactionで実行。payload SHA256 cd7310f1ccc9b3a988fbd0fe8aed56e1015dbe4aa08b30ce5c3ca293e2e85298。

1. 20260908175140_raid_top_daily_authority.sql
2. 20260908175143_raid_top_aggregate_api.sql
3. 20260908181251_raid_room_display_projection.sql
4. 20260909023226_raid_remaining_pages_projection.sql

事前のguard/postflightを通過した後だけ固有例外RAID_STEP6_EXPECTED_ROLLBACK_AFTER_PASSを発生させ、DDL専用apply_migrationでrollback試験。別接続でprivate未存在/履歴277/試験履歴0/新台帳0/旧2関数MD5一致を確認してから保存した。予期したrollback例外を実適用失敗と混同しない。

保存成功: standard migration version20260909051355、name raid_step6_daily_top_display_pages。元4versionを偽装登録せず、実適用1transactionの標準履歴と既存deployment_audit_raid_v1の新ID raid-preview-step6-four-sql-v1で4sourcehashを対応付けた。実行ID c19b5615-aaed-4c29-a3cd-73a2a801729e。旧14本は再投入なし。

14:14:55 JST別接続postflight PASS: 保護64関数定義/既存ownerACL、73table件数内容/ownerACL/RLS、flags/Cron不変。public5invokerのauthenticated許可/anon拒否、private7関数の直接権限とRLSを確認。日次tableはこの時点0件。その後の許可済み実HTTPで当日1行に2対象を初期化した。DDL postflight時の不変と、その後の専用QA操作を分ける。

## 実HTTPの現在結果
3役の通常password login/profile HTTP200、有効QA分類を確認。top/choices/list200、未認証401/42501、日次SHIBUYA/YOKOHAMAの2対象が全員一致。現行master5体とskillの返値確認。

新規専用QA Room a6940cc4-12eb-4c64-ba80-af3430134e96、SHIBUYA初級24時間。主催者/通常/救援の登録と表示、同request再送、対象外SHINJUKU新規拒否400/22023を確認。旧cleared Room af908a71-b5c3-4a73-9ef8-e1ab2b9b62e3 と自然失効待ち3972a461-b45f-4b02-8142-75f294461ae3はHP/期限を変更しない。

通常参加者の新専用Room1戦: start/resolve200、Replay bd809833-89cf-46b8-8bce-54eefea44f97、同requestで同Replay。個人敗北ENEMY、raw/applied damage5105、共有HP27,994,895/28,000,000、roomOutcome null、lateFinalization false。UI ack前の状態を保持して画面検証へ引き継ぐ。Mockを使用していない。

## 初期装備403（独立した残件）
既存Fresh QA anonymous user4392795b-e528-48ec-b323-900820209506は当初QA分類なし。専用調査ユーザーであることを確認し、既存KPI分類機構でこのsubjectだけ登録時からqaへ分類、除外trueを別接続確認した。権限変更ではない。

通常refresh200後、候補GameContextと同一WEAPON_001初期付与payloadを1件だけPOST /rest/v1/user_equipments?select=*。403/42501を再現、装備0→0。残4件は送信なし、credentials/storageStateを保存/上書きなし。authenticated INSERTの意図的REVOKE（既存SQL121）とクライアント初期保存の不整合で、今回Raid適用の影響ではない。権限を広げて回避していない。実Fresh全体はFAIL/未完了、仮装備表示修正とは別。詳細raid_step6_fresh_equipment_readonly.md。

## 配信・画面
専用PreviewはREADY。固定URL https://tribe-neon-gcg8o8bcu-kiyoshi-kitamura.vercel.app、deployment dpl_6JjqCfEgfhWb7QauPC4tb7e91WHn。target null（Preview）、raidSourceSha/gitCommitSha両方が固定完全SHAと一致。HTML200・JS15本200、JSにPreview refありProduction refなし。共有alias75件の全binding不変、新deployment alias/automaticAliasesとも空、本番wwwのdeployment保持。

配信経路の初回失敗も記録する。CLIのPreview + skip-domainは送信前validationで拒否、Productionへ切り替えていない。REST専用Preview payload（target省略/autoAssignCustomDomains false/alias空/branchやgitSourceなし）へ変更。CLI生成curlの認証placeholderは利用できずGET403で送信前停止、正規認証経路を確認してから再実行する。正規@vercel/cli-auth credential loaderのメモリ内認証を使用し実GETでproject/team/aliasを確認してから、RESTファイルupload・単発createを実行した。実tokenをファイル/ログへ出していない。固定git archiveから配信対象2,273ファイルをSHA1/SHA256で照合。配信による共有env/alias/Edge変更なし。

人の実機受入は機械/エージェント操作と区別する。専用URLで3役の画像/タップ/低高さ/報酬末尾/プロフィール往復/Replay帰還を確認する。自然失効待ちRoomを直接終了させず、通常masterと報酬条件を変更しない。

## 追加の実接続検証

通常参加者は実HTTPで開始した同Replayをブラウザで再生し、再読込で同Replay IDを確認。新規start呼出し0。ackの503はPlaywrightによる通信失敗の模擬で、2run各1回（実サーバー障害ではない）。失敗後のResult、local pendingの前後一致（server履歴から復帰した経路なのでnull）、server上の同request未ack保持を確認した。その後の実ack200で元Room詳細へ帰還し、server復帰候補から当該requestが消えた。初回scriptのlocal pending必須という誤った期待は修正し、初回証跡も保持した。

救援は3役×Activity/Guildの2出典×単体/カードの2読取RPC＝12件200。元rescue ID・公開先・Guild IDを保持。全3役が同じGuildのため、Guild外ユーザーの実HTTP否定系はこの証跡では未確認。

### 討伐・報酬用QA fixture

新専用Roomで通常の戦闘APIによりhost1戦2,791、normal1戦5,105、rescue5戦20,004のraw貢献を積み、全actorのack完了を確認した。rescueは4戦時15,956で条件未達、5戦で既存2戦/16,000条件を満たして停止。架空の戦闘台帳や資格は作成していない。

親が対象boss1行だけcurrent_hpを27,972,100→1へ変更。rollback試験と別接続の復元確認後、同guardでcommitし別接続でHP1/ACTIVEを確認。実行ID 2c9f77d8-851c-49c4-b13c-a07e54f16a68。guardは対象Room/owner/3役QA所属/既存貢献/未ack0/期待HP/期限を照合し、他boss・通常master・報酬条件・旧保護Room不変を検査する。SQLと前後値はevidence/raid-step6/qa-hp-fixture-*へ保存。

続くhost正規戦闘はReplay 8a2725c4-d560-4dfa-aa6a-636028c1a187、個人winner ENEMY、共有outcome DEFEAT_SUCCESS、raw2,940/applied1、残HP0。**終盤HPを短縮したQA試験であり、28M全HPの自然討伐完走を検証したものではない。** 討伐/救援報酬の条件・数量・計算は変更していない。

hostの新しいブラウザは、既存の未ack Replay 3609062b-f279-46b3-938d-37676c2981aaを先に選択した。復帰APIのcreated_at昇順という既存契約どおりであり、最新を選ぶとした試験前提の誤り。前日FINALIZED/RESOLVED済みの再取得で、他43boss行MD5は事前値と一致しHP再反映なし。旧pendingはack/削除していない。今回は新戦闘で実際に受領したpayload/receiptだけをlocal pending契約どおり保存し、実出撃後に記録のある再読込状態を準備して最終Replayを復帰した。架空の戦闘応答やMockは使用していない。

新Roomの討伐Present3件と救援Present1件を、既存claim_presentでそれぞれ受取。全HTTP200/success、Present CLAIMED、所持itemは各1→2。同ID再受取は400/P0001、所持2維持で二重増分なし。既存の別Presentは操作していない。新Room由来grantとpresentIdの対応はnew-room-issued-presents.json / new-room-reward-claims.json。

## 最終保護確認と検証の区別

05:44:21 UTCの独立read-only確認で、42静的master/rules/items/settingsの件数・内容MD5、Cron7件、3flags、旧保護Room2件のroom/boss計4MD5は全不変。専用QA進行・新Room・Present・日次正本の正規差分は不変比較から分けた。05:44:35 UTCの配信再GETで固定2d2d Preview READY、共有alias75件不変、Production 550c02225cbecb6ba6f174ee3fb952bcaae2f6dd / READY、HTMLとJS15本200を確認。Edgeは既存live5ファイルが候補と一致しており変更なし。

第6工程では製品ソース・migrationファイルを変更していない。配信時の新しいbuildがREADYになったことと、今回の実HTTP/ブラウザ検証を記録する。過去工程の型・Mock回帰PASSを今回の実接続PASSとして転記しない。第6工程専用スクリプトのlintはerrors0/warnings0。

## 人による実機確認・残件

### 今回の到達点

| 項目 | 結果・範囲 |
| --- | --- |
| SQL4本・専用Preview配信 | PASS。固定source/接続ref一致、別接続確認済み |
| 3役の実認証・集約API・日次2対象 | PASS。通常password認証、再読込保持、owner/member/rescueの返値 |
| 新規受付・対象一致・同要求再送 | PASS。対象外拒否、同request同Room。日またぎ実再送は未確認 |
| 個人敗北/共有戦況、同Replay、ack | PASS。実HTTP戦闘→UI復帰/Result→実ack→元Room。503だけ模擬通信失敗 |
| 救援リンク | PASS。Activityの元rescue IDから正しい撃破済Roomへ遷移。APIではActivity/Guildの出典保持。Guild外否定系は未確認 |
| 3役の戦況・報酬表示 | PASS。主催者/通常/救援の実画面、rescue本人の受取済表示を確認 |
| プロフィール・報酬スクロール | PASS。390×400で非0スクロール28→28、dialog1枚。390×600で報酬本文433/scroll948、末尾/閉じる操作可能 |
| 討伐/救援Present | PASS。新Room由来4件、通常claim API、所持増分/二重受取拒否。HP fixture使用 |
| 初期装備保存・実Fresh | FAIL。403/42501再現、装備0→0。権限を変更していない |
| 人のSafari実機受入 | 未確認。Chromium/エージェント目視から分離 |

初期のnormal帰還/host・rescue Home画像は取得途中で撮影されていた。配信8画像は200かつ固定source SHA256一致。読込後のhost-cleared-detail、normal-home-loaded、rescue-home-loaded、normal-profile-lowで画像と所属が正しく表示されることを親が目視した。初期診断画像を最終ビジュアルPASSの証跡には使わない。

主な画面: [戦況](evidence/raid-step6/host-cleared-detail.png)、[救援参加者](evidence/raid-step6/rescue-rescue-target.png)、[プロフィール](evidence/raid-step6/normal-profile-low.png)、[救援報酬受取済・末尾](evidence/raid-step6/rescue-rewards-claimed-bottom.png)、[救援カード](evidence/raid-step6/normal-activity-rescue.png)、[敵選択](evidence/raid-step6/normal-enemy-selection.png)。

### 後続確認

- iPhone Safari実機で通常ログイン/再読込、375/390/430px相当・短い高さ、safe area、フッターとモーダル、画像の切れ方とタップ領域を確認する。今回のChromium操作/目視と、人による実機受入は別。
- 3役の通常QAアカウントで、日次2対象、戦況、プロフィール、救援出典、報酬とPresent状態を確認する。再度戦闘する場合は新しい専用QAデータを使用し、旧自然失効確認Roomを直接変更しない。
- 初期装備保存403はFAIL。既存保存権限の設計とクライアント初期付与を整合させる後続修正が必要。原因不明の権限拡大や仮装備表示で回避せず、修正後に実Freshを再検証する。
- Guild外ユーザーの否定系・同一ブラウザでの別アカウント切替・日付をまたぐ実再送は、この実HTTP試験の未確認範囲。既存ローカル検証のPASSを流用しない。
- 新規戦闘開始は実HTTPで検証し、ブラウザでは同Replay/Result/ack帰還を検証した。UIボタンからの新規出撃は未確認。今回の画面確認は390×400/600（login844）で、375/430pxは今回再撮影していない。
- 自然失効確認Roomは2026-09-09 19:40:55 JST期限のまま保持。この作業時点で期限前のため、自然失効後の確認は未実施。

本番変更、main統合、push、共有alias/運用フラグ/Cron/Edge変更なし。今回の証跡commitは配信source SHAとは別であり、そのcommitを再配信したものではない。

証跡は65点（画面32枚）を保存し、manifestのSHA256とGit staged blobを全件照合した。テキストはLF正規化後のhashと採取時raw hashを区別する。既知QAパスワード/メール/公開キー値・JWT・秘密鍵の点検PASS、画面は親が目視して認証情報なしを確認。認証ファイル、storageState、環境ファイル、配信用archive、未整理outputsはcommitに含めない。製品srcとmigrationの差分0、専用検証scripts lint0件、staged whitespace check PASS。
