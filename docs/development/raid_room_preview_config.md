# 実機確認用の報酬設定準備

2026-09-08 / 第17工程。SQL251・260・262の設定テーブルに対応するオフライン生成ツール。数値の妥当性審査・DB反映・公開を行うものではない。

## 入力

`config/raid-room/preview-settings.template.json`を複製し、独立PreviewのprojectRefと4難度の値を入力する。templateのnull/空配列は未入力を表し、そのままでは生成を拒否する。

| 入力 | 意味 |
|---|---|
| projectRef | 接続先候補。20文字の小文字英字。本番 `ktpolnkyyfkowxdmijww` は拒否 |
| version | 設定版、正整数。適用前に現行版と比較し新しい版を指定する |
| rescue.minimumBattles | 必要戦闘数、正整数 |
| rescue.minimumContributionDamage | 救援貢献下限、0以上の整数。既存AND判定の「以上」 |
| clear.minimumContributionDamage | 討伐貢献閾値、0以上の整数。「超過」で成立し、一致は不成立 |
| rescue.items / clear.items | それぞれの品目ID・正整数数量。各リストは1件以上、同品目の重複不可 |

4難度はbeginner/intermediate/advanced/expert。入力値はJavaScriptの安全な整数範囲内。品目IDは対象DBの既存品目と照合する。ツールは品目マスターやゲームバランスを判定しない。

## 生成

```sh
node scripts/raid-room/build-preview-config.mjs preview-settings.json > preview-settings.review.sql
node --test tests/raid-room/preview-config.test.mjs
```

生成SQLはBEGIN/timeout/設定テーブルのロック/4難度の設定/読戻し/ROLLBACKを含む。外部通信をせず、DB接続情報も受け取らない。projectRefは識別注記であり、実際の接続先を検証する仕組みではない。実行者が独立Previewへの接続を照合する。

生成結果は救援・討伐報酬をenabled=falseにして保持する。Room作成・戦闘開始・救援投稿の運用設定、総合力下限、HP/敵ステータス、過去台帳やPresentは変更しない。削除するのは対象難度の設定品目行のみで、設定の差し替え用。発行済み報酬の回収ではない。

## 実環境へ進む順序

1. 独立Previewの接続先・現在のmigrationと対象SHAを確認する。SQL262までの適用と既存品目の存在を確認。
2. 入力した設定版・閾値・品目数量と生成差分を確認する。進行中Roomがある場合は、適用で資格条件が変わるため、テストRoomを終了させてから新しいRoomで確認する。
3. ROLLBACKのまま実行し、エラーなし・期待値の読戻しを記録する。
4. 永続適用は別の作業として実行SQLを確定し、対象接続確認後にCOMMIT版を適用する。単に生成した時点を「設定反映済み」としない。
5. 旧生成・新規開始の停止処理、Edge/UIの接続を確認してから、独立Previewの必要な運用設定と報酬設定を有効化する。
6. 作成→救援→参加→戦闘→撃破→両報酬Present→受取を複数アカウントで確認し、実機受入へ進む。

本工程では値を仮承認していない。救援候補値は仕様書の候補のまま。報酬数量・討伐閾値・独立Preview接続の確認が残る。バランス研究を追加の開始条件にはしない。
