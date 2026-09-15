# 承認版Preview復旧記録 2026-09-13

## 復旧経緯

前回実行環境停止後、scratch作業フォルダが空になり、未pushのローカルコミットを取得できなくなった。
GitHub保存済み `1a9e3fc22af05510c935a6beddeecf5b7be02e5a` から作業環境を再取得し、承認済み仕様と各担当の作業記録から差分を復旧した。旧ローカルSHAと復旧後SHAは異なる。

## 復旧内容・検証

- Encounter：初回保証なし10%、10回連続未遭遇後の11回目保証。対象難度50/35/15、参加可能難度で再配分。探索街・開催上限を保持。
- Encounter報酬：Clear/Rescue各2倍、通常Raid等倍、再送時の二重付与なし、配送失敗rollbackを実SQLテストで確認。
- DIA：6商品有償/無償分割、有償120日、交換先へ期限継承、混合支払・端数・失効・再送・無料分保持・旧4パック回帰を実SQLテストで確認。
- 専用スキル：承認20台詞、暗転→台詞→カットイン→効果。子animationの1100ms遅延、pause、装備帯120ms間隔、reduced-motion終了を復旧。
- 型・変更Lint・Battle presentation・Quest Result・PvP Leader・Encounter protocolの対象検証PASS。統合build・自動Previewの結果は配信時の実測で別途報告。

## Preview Migration

接続先：`sufvuqdnqohpfzkwxohq`

| Repository名 | Live history version | 今回操作 |
|---|---|---|
|20260913120930_quest_raid_approved_occurrence_and_double_rewards|20260913121454|履歴statementsから完全復元。再適用なし|
|20260913120945_billing_dia_approved_contract|20260913123800|rollback事前確認後、今回適用・適用後確認PASS|

Encounter公開設定はenabled=falseを維持。Production・共有alias・環境変数は変更していない。

## 未完了を維持する項目

- Stripe Sandboxによる実決済/署名Webhookの通し受入。コード/SQL試験を実決済PASSと扱わない。
- 専用演出のPreview実画面と目元crop確認。
- WEAPON_047 / WEAPON_049 / HEAD_020透過素材。前回生成は実透過でなく造形も変わり不採用。元画像を保持。
- 実iPhone Safariでの最終確認。

追加のユーザー仕様判断は不要。配信完了と差分実画面受入を区別する。
