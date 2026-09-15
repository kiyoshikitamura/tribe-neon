# 新専用QA Room 報酬検証前の読取

対象Room `a6940cc4-12eb-4c64-ba80-af3430134e96`、boss `2aec4aba-e56b-4e71-bbdf-f08071ec3fa4`、ownerは既存QA host。beginner/RAID_SHIBUYA_V1、max_hp28,000,000、読取時current_hp27,994,895、expires_at2026-09-10 05:15:50.362999+00。AはREAD ONLYのみ、HP/条件/戦闘/報酬を変更していない。

## 実資格と設定

- 討伐: enabled、minimum_contribution_damage=0（条件は厳密にraw damage >0）、正式FINALIZEDかつlateFinalization=falseの戦闘1以上、Room撃破。EQUIP_EXP_S×1を各有資格本人へPresent送付。
- 救援: enabled、救援参加記録あり・主催者以外、救援参加後かつ期限/撃破前開始の正式確定戦闘2以上、累計raw damage>=16,000、Room撃破。CHAR_EXP_S×1。通常参加者を救援へ読み替えない。
- 最小進捗の読取時点: normal1戦/5,105、host0戦/0、rescue0戦/0。hostは正規1戦で正damage、rescueは正規2戦以上かつ16,000到達まで必要。戦数だけ満たしても不足なら救援報酬は成立しない。
- 資格集計はraw_damageであり、HP残量でclampされるapplied damageとは別。最大HPや報酬thresholdを下げる理由にはならない。

## HP短縮fixtureの提案（未実行）

親の専用QAデータ許可判断を前提に、先に全3役の上記進捗を自然な戦闘API/正式finalizeで満たす。進行中Replayを確定してから、親のみ新QA boss1行のcurrent_hp=1へ短縮し、追加の正規1戦で撃破させる案。条件変更・架空ダメージの台帳挿入・人工的finalizeは禁止。これは通常28M討伐完走の検証ではなく、資格は通常戦闘、終盤HPのみfixtureと明示する。

transaction guard案: 固定Roomとbossの対応/owner/variant/beginner/max28M/created_at/expires_atをassert。3役membershipと有効QA分類、host/normal clear進捗とrescue必要進捗、未finalize戦闘不在を確認。対象bossをFOR UPDATEしACTIVE/outcome null/現在HP期待値/期限未来を再確認。旧2Roomと全master/条件/報酬設定のhashを保存し、UPDATEは固定bossとRoomJOIN条件・期待HP一致で1行のみ、RETURNINGの前後でcurrent_hp以外不変、旧2Room/master/条件hash不変をassertして台帳に操作IDとbefore/afterを記録。AはDMLを作動させない。

## Present検証の切り分け

読取時3役の未受取Presentはhost11/normal11/rescue9。ただしRoom clear/rescue reward_grantsと結合した未受取は0件であり、新Room報酬と混同しない。撃破後は新room_idでreward_grants→present_idを特定し、正規claim RPCでそのPresentだけ受取。Present状態と所持item差分、重複発行/重複受取防止を照合する。他報酬を一括受取して合格にしない。

## 旧Room保持の読取

- 自然失効待ち `3972a461-b45f-4b02-8142-75f294461ae3`: boss56d721b3-8f38-4ac4-939f-9d9ea3760c5d、32M/32M ACTIVE、expires2026-09-09 10:40:55.031663+00。room MD5 fcb843a1e0a947318806edc580044ae8、boss MD5 a6b8e91f9b6bf9b33e2bbcc79aa3b96d。
- 撃破済 `af908a71-b5c3-4a73-9ef8-e1ab2b9b62e3`: bossc127f1da-9a60-4919-b351-6a99412574d7、0/32M CLEARED/DEFEAT_SUCCESS。room MD5 14b2d1f2af459ea792f6e63e192c4264、boss MD5 ab75df0b2de18080af1195730aa9b9f6。

自然失効が発生した後の状態変化はCron由来として別に確認し、旧HPや期限を書き戻さない。

## 追加許可後の資格戦闘HTTP

親が基本UI確認後にhost/rescueの通常API出撃を許可。Aは新Room限定でhost1戦raw2,791、rescue5戦raw累計20,004を正式開始→resolve-battle→同Replay receipt確認→ackした。rescue4戦時15,956で条件未達だったため5戦目を行い、到達後停止（上限6戦を超えず）。同request payloadを事前保存し、再開時も同IDを使用。token出力なし。

別接続DB照合: host1戦2,791/未ack0、normal1戦5,105/未ack1、rescue5戦20,004/未ack0。3役とも討伐貢献の戦闘条件が成立し、rescueは2戦/16,000を超える。撃破前なのでreward gate自体はnot_succeeded。HP27,972,100/max28,000,000 ACTIVE。normalのUI ackはC担当であり触れていない。HPfixtureは全actor ack後に親だけが判断する。

再現script `scripts/raid-step6/qualify-host-rescue.mjs`、safe証跡 `outputs/raid-step6/qualification-host.json` / `qualification-rescue.json`。AはHP変更・報酬発行・Present受取をまだ行っていない。

## HP fixture後の正式撃破

親が全actor ack後、新専用bossのcurrent_hpだけを1へ変更するguard付きfixtureを適用し、別接続で確認してREADY通知。Aは通常host開始RPC→resolve-battleを1戦実行。Replay `8a2725c4-d560-4dfa-aa6a-636028c1a187`、個人winner ENEMY、共有outcome DEFEAT_SUCCESS、raw damage2,940/applied damage1、残HP0。個人敗北と共有撃破は別の事実。28M全HPの自然討伐を検証したものではない。

結果は `outputs/raid-step6/host-final-battle.json` に保存し、未ackのままCへUI/ack所有権を引き渡した。別接続SELECTで新Roomの討伐grant3件（各EQUIP_EXP_S×1）と救援grant1件（CHAR_EXP_S×1）、全てUNCLAIMED Presentを確認。`outputs/step6/new-room-issued-presents.json`。Cの報酬未受取画面確認後まで受取操作を待つ。

## C既定復帰で選ばれた旧Replayの確認

Cのhost UI初回はサーバー履歴から旧Replay `3609062b-f279-46b3-938d-37676c2981aa` を選択し、既存resolve1回後にID assertで停止（新規start0/ack0）。AがSELECT確認したところ所属は旧Room `1a7094ff-52b5-4670-893f-082442be9629`、boss `93457d0a-ef8a-4646-9e1a-6ac3f03e5396`。2026-09-08 15:27:10Zに既にRESOLVED/FINALIZED、damageログ1件raw2,858で旧時刻のまま、ack=null。現在HP29,997,142は旧保存result.remainingBossHpと一致する。

さらに新QA bossだけを除いた全43boss行の整列hashを再計算し、適用前baseline `44a24b6ed91658cb9cc77512fd725780` と完全一致。再resolveで旧Room HPを含むboss行が変更されていないことを確認。旧pendingのack/削除は行わない。親が承認した最終正規payload/receiptのlocal復帰fixtureで最終Replayだけを指定し直す方針をCへ共有した。

## 新Room Present正規受取

Cの未受取表示確認後、親が受取所有権をAへ移して実行許可。Aは `claim-new-room-rewards.mjs` で新Roomの読取RPCから得た4つのPresent IDだけを `claim_present(p_present_id)` へ送信。

- host/normal/rescueの討伐EQUIP_EXP_S×1、およびrescue本人の救援CHAR_EXP_S×1、計4件すべてHTTP200/success。
- 各本人の該当所持item数量が正確に+1、Room報酬APIの同じPresent IDがCLAIMEDへ変化。
- 同Presentをもう1回指定する検証は全4件HTTP400で拒否。所持数量の追加増分0。
- 旧Present・claim_all_presentsは操作なし。資格情報の出力/保存なし。

safe証跡 `outputs/raid-step6/new-room-reward-claims.json`。Cへ受取済表示の読取所有権を返却済み。これにより本新QA Roomについて正規戦闘資格→HP終盤fixture→正規撃破→実報酬発行→正規Present受取→重複受取拒否を確認した。通常28M全量討伐やFresh全体完走のPASSには読み替えない。
