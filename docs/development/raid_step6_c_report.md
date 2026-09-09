# 第6工程 C — 実HTTP・ブラウザ検証

対象sourceは2d2d2b1563e92f1471f9c86fa8a7cc59040ec726、固定Preview https://tribe-neon-gcg8o8bcu-kiyoshi-kitamura.vercel.app 。実DBはsufvuqdnqohpfzkwxohq。Mock、storageState/HAR/trace保存なし。以下は実配信候補に対する今回の検証であり、旧工程のPASS転記ではない。

## 認証・データ・日次

3役の既存private credentialをメモリ内だけで読み、通常password認証成功。host/rescueはブラウザのメールログイン・再読込から継続、normalはブラウザのメールログインから復帰を確認。Aの実DB読取で3役とも現時点有効なqa/test分類を確認。鍵・メール・パスワード・JWTはレポートと証跡へ記録しない。

実HTTPで3役のtop/choices/listは200、未認証topは401/code42501。日次対象SHIBUYA/YOKOHAMAの2件一致。対象外SHINJUKUへのcreate1回は400/22023で拒否。実Browserでも2対象と敵選択を確認し、トップの挑む→選択までcreate/start呼出0。

新専用Room a6940cc4-12eb-4c64-ba80-af3430134e96を初級、通常maxHP28,000,000、24hで1件作成、同request再送で同一Roomを確認。normal登録、host全体/Guild救援、rescueID参加から3役表示owner/member/rescue・登録3人・実敵5体/技能を確認。活動救援ID4f939109-80c9-412d-a45d-4f577c64ccdaのdata-room-idと新Roomを照合し、終了後の「戦況を見る」から元Roomへ遷移成功。最初のクリック待ち失敗は表示文字とaria-label「救援先を開く」のテストlocator不一致で修正した。

## 戦闘・Replay・ack

戦闘の新規start/resolveは実HTTP、Result/復帰/ackは実ブラウザ。この経路をUIから新規出撃成功とは扱わない。

normalの通常1戦はraw/applied5105、個人敗北、共有残HP27,994,895。Replay bd809833-89cf-46b8-8bce-54eefea44f97をブラウザ再読込後も同じIDで復帰、追加start0。ack通信503をPlaywright network routeで模擬し、Resultとサーバー未ack履歴が残ることを確認。503は初回検証と期待修正後の計2runで各1回。HTTP先行のサーバー履歴復帰では元々local pendingがnullのためnull維持が正しい契約であり、初回のnonnull期待を修正した。最終実ack200で元Room帰還、未ack一覧から当request消失を確認。

Aがhost/rescueの通常資格戦闘を実行後、親がこの新QA Roomだけcurrent_hpを1へ短縮する明示fixtureを適用。通常master/maxHP/報酬条件/旧Roomを変更しない。Aのhost最終Replay8a2725c4-d560-4dfa-aa6a-636028c1a187はraw2940/applied1、個人敗北・共有撃破成功。自然撃破とは区別する。

hostは旧未ack Replay3609062b…が存在し、既存SQLのcreated_at/request_id昇順に従って最初に復帰した。これは既存仕様であり製品バグではない。旧Replayは既FINALIZED/RESOLVED、Aが他43bossの前後hash一致・HP再反映なしを確認した。旧pendingをack/削除せず、新最終戦の正規HTTP受領payloadだけをlocal pending契約で保存した「実出撃後のlocal記録を持つ再読込状態」をQA準備した。resolve allowlistは最終Replayのみ、start禁止。最終Replay表示・実ack・撃破済元Room帰還を確認。

## 画面・報酬

390x600で最終ResultのMVP、個人結果と共有撃破結果を確認。撃破済詳細の敵/背景/主催者/参加者画像はcomplete=true・naturalWidth>0。初回host/rescueホームやnormal帰還の画像は読込前撮影だったためビジュアル受入には使わず、loaded/cleared-detail画像を用いる。Bも該当8画像のGET200とsource内容一致を別検証。

実3参加者のプロフィールは非重畳dialog1件、390x400でrescue行から非0スクロール28→28を復元。画像の最終待機状況はnormal-daily-rescue-ui.jsonに記録。受取前のhost報酬は390x600で本文height433/scrollHeight948・横幅364一致、末尾までスクロールし閉じる中心点ヒットを確認。未受取撮影後Aへ受取所有権を解放し、Aが新Roomのclear3/rescue1の4Presentを通常受取・二重受取拒否確認。Cがrescue本人の討伐/救援両報酬「受取済み」、貢献20,004、本文末尾を再表示した。

証跡はoutputs/raid-step6配下: preflight-roles.json、top-http.json、new-room-state.json、new-room-projection.json、outside-daily.json、normal-battle.json、browser-login.json、normal-recovery-initial.json、normal-recovery.json、host-final-ui.json、daily-rescue-ui.json、rescue-daily-rescue-ui.json、normal-daily-rescue-ui.json。scripts/raid-step6に安全な再現script。

主要画面: screens/normal-result.png、normal-ack-failed.png、host-final-result.png、host-cleared-detail.png、host-rewards-unclaimed-top.png、host-rewards-unclaimed-bottom.png、normal-daily-top.png、normal-enemy-selection.png、normal-activity-rescue.png、normal-rescue-target.png、rescue-home-loaded.png、rescue-participants-low-restored.png、rescue-rewards-claimed-bottom.png。親とCが目視確認。

## 未確認・境界

実端末の人手受入、ブラウザからの新規battle startは未確認。上記503は実障害ではなく通信失敗の模擬。自然撃破は未確認。旧自然失効待ちRoomの期限/HP/報酬/旧Presentは未操作。Fresh初期装備403はA/Bの別実HTTP検証でありCの通常Fresh完走PASSには含めない。今回はCの製品source変更・commit・master/権限変更なし。

最終プロフィール撮影 normal-profile-low.png は5枚のキャラクターと枠すべてcomplete=true・naturalWidth>0（12 img）で、親とCが目視確認。profileScrollは28→28。今回のviewport検証は390x400/390x600（loginは390x844）であり、375/430は今回再検証していない。
