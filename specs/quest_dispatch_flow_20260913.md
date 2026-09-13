# Quest 派遣一覧からの段階UI

## 確定構造
Quest到着時は派遣一覧。派遣0件でも一覧の未派遣5枠を表示。
未派遣枠 → 派遣先/級選択 → 出現エネミーと報酬確認 → 担当キャラ選択 → 派遣成功 → 該当派遣中画面。
派遣中は時短と「別の派遣をする」。後者は派遣一覧へ戻る。直接次の派遣先選択へ飛ばさない。
一覧に担当キャラ画像/名前、派遣先/級、状態、残り時間、地元一致を表示。
待機終了後は既存Battle→報酬→Repeatを維持。未派遣枠・派遣中カードを状態別に装飾する。
RPC、報酬量、時短費用、枠数、Tutorial専用UIは変更しない。

## 表示Authority
事前の敵確認はcanonical Quest enemy poolの該当街/級の候補。クライアントで確定編成を捏造しない。実敵編成は派遣時server生成のencounter_snapshot。
待機/戦闘待ち/受取可能は既存questProgressState。時間は既存activePatrols投影。
新規派遣RPC成功のpatrol_idを使い、今派遣した詳細へ遷移。他の派遣を誤選択しない。

## 地元ボーナスの既存不整合
既存仕様資料spec_ui_quest_map.mdは地元一致時のLUK報酬ボーナスを記載。一方、Preview start_patrol/claim_patrol_rewardsとuser_patrols trigger確認では地元加算なし。固定CASHと既存確率で付与されている。
今回UIは確認できる地元一致だけ表示。「地元ボーナス発生中」は実際の加算Authorityが成立するまで表示しない。倍率/数量はこのUI変更で勝手に追加しない。

## Acceptance
0件/一部派遣/5枠満杯、一覧到着、選択順、敵と報酬の確認、担当選択、開始成功後の該当詳細、失敗/連打、時短、別派遣→一覧、Reload、Battle/受取/Repeatへの接続。
新候補の実画面確認前はUI AcceptanceをPASSにしない。Production変更なし。

## 実装結果
構造変更済み。状態遷移時は表示先の先頭へスクロール。派遣中/戦闘待ち/受取可能から「別の派遣をする」で一覧へ帰還。
型・Next build・verify_quest_ui_state・verify_quest_battle_result_liveness PASS。実画面Acceptance未実施。
DB/Production変更なし。既存Mission共通修正の累積候補に包含。

## efa32fc実画面差分監査・ラベル修正
ユーザー提供監査: 段階UI、複数派遣の担当/時間、初心者順、受取dialog、同期中背面操作防止、Mission表示PASS。地元一致だけFAIL。
原因: 日本語homeTownと英字town_idの直接比較。既存resolveCharacterLocationKeyを再利用し、共通isCharacterHometownで担当選択/一覧/派遣詳細3箇所を修正。
7街の日本語/英字、大文字/空白、一致しない街、未設定/不明の誤一致防止を検証PASS。
ラベル修正後の実画面監査は未実施。ボーナス実加算は別のProduction必須Gateとして残る。

## 2026-09-13 実加算の後続対応
地元ボーナスをPreview DBへ接続済み。詳細は `quest_hometown_bonus_20260913.md`。
上記の「加算なし」は過去監査時点。現在はRPC差分検証PASS、専用Preview再配信・実画面Acceptance待ち。Production保留。
