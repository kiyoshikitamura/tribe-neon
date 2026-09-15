# c844 専用 Preview 配信・統合検証

固定配信 source: `c844534f5ce160fb3e713a58aed8377190aaa209`

固定 URL: https://tribe-neon-3qicrkiov-kiyoshi-kitamura.vercel.app

Deployment: `dpl_FgKMDvp1NdvjYDzNtYmTfHxYuVLi` / READY / Preview DB `sufvuqdnqohpfzkwxohq`。
この証跡を保存する後続 commit は製品候補の変更ではない。HP・編成・装備・Skill を追加調整していない。

## 配信と DB

git archive の固定 c844 を専用 Preview として配信。実配信 JS の環境と接続 ref を照合し HTTP 200。
Production を含む既存 75 alias は前後不変、target/alias/automaticAliases は未指定。
追加 SQL 06 のみを既存状態 guard 付き transaction で一度適用し、旧 SQL は再投入していない。
06 SHA256: `3a8403bfa502ea0a695a11c101fc032cda81cbcfe1695ff5e2e376ee3d06a887`。
専用適用 driver SHA256: `8311f82a7ca841811b33bd57368989b8619335499c90b1a2852a045c944c5462`。
既存 8 Room の保存編成、boss、Replay enemy、共通 master、flags、期限処理を保持。旧 Room snapshot の後付けなし。
Stock 07 の Production 向け disabled flags 条件は専用 Preview に適合しないため、専用 postflight で現 flags 保持を検証した。元 Bundle の改変ではない。

## 検証の範囲

- 4 難度の新規 Room、20 敵の Character / 装備 / Skill の ID・育成値を完全照合。
- 実 Auth → 戦闘 → Edge 確定を計 7 戦。初級は HP 短縮なしで討伐・通常参加・救援成立。
- 救援は累計 123,663 / 2 戦。討伐 3 件と救援 1 件の Present を受取、全二重受取拒否。開始再送は同 Replay、RP の追加消費なし。
- 中・上・超級は各 1 戦で編成と接続を確認し、全難度討伐は再実施していない。
- 確定済み Edge 再送と自然 Cron 期限終了は既存の同一定義の実接続証跡を再利用。8c→c844 の supabase/functions 差分なし、期限関数定義も一致。
- c844 の型・build・28 編成参照・関連回帰は raid-launch-integration の PASS を再利用。今回も固定 source の Preview build が READY。製品コード変更なしのため広域検証を繰り返していない。
- 実 Fresh の画面観察は fresh-acceptance/ACCEPTANCE.md。人の受入とは分離する。

## QA 設定と承認対象

未承認 v3 閾値・報酬は専用 QA の検証時間中のみ使用し、終了後は元 QA JSON に完全復元。公開設定への適用なし。
救援は必要戦数と累計 Damage の AND 条件。初級の代表約 5 戦討伐に対して救援 2 戦が必要で、途中参加や高火力による早期討伐では未達になり得る。この性質を含めた設定承認が必要。
属性 ×2 / Guild ×2 は追加有効化していない。QA HP 短縮、テスト報酬、QA ユーザーを公開用データへ流用しない。

## 残件と停止境界

公開閾値・報酬案の承認、同一候補での Character とチュートリアルをまとめた人の受入が残る。
メール配送や OAuth 実サービスの受入を、QA Admin による資格準備で代替して PASS とはしない。
本番書込み・本番 Deploy・公開切替は実施していない。承認と統合受入後に、Production 実 SHA・DB/Edge/Cron・KPI を含む共有 alias と変更枠を再確認して既存の本番実行手順へ進む。

再実行時は適用済み 06 を再投入しない。deploy/run-qa/prepare-fresh-auth は状態変更を伴う実行用記録であり、単なる検証コマンドとして再実行しない。
