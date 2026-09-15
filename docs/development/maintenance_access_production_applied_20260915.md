# 本番本人限定アクセス：DB適用済み・コード配信待ち

ユーザー承認：一般停止を維持し、本人限定DB/対応コード反映と2時間許可。

- Production ref: ktpolnkyyfkowxdmijww
- 適用済みMigration: 20260915115637_operations_maintenance_test_access（再適用禁止）
- 許可開始: 2026-09-15 20:56:56 JST
- 許可終了: 2026-09-15 22:56:56 JST
- 許可1件、対象Googleアカウントは本スレッドで本人指定・Auth照合済み。
- authenticated本人コンテキストでis_operations_maintenance_tester()=true、本人なしfalse、MAINTENANCE維持を確認。
- 課金基盤・販売フラグ・Season・既存資産は変更していない。

## コード配信の阻害

実Production: SHA 44e43ee43c358b3bbe0b5dce64e538453581ba36 / dpl_6SxzqHvirUdJ1m1iP3s1jiQBqHLs。
Git fetchはnot our ref、GitHub commit APIは404。この環境にVercel CLI、Token、CLIログイン情報はない。
したがって既存本番ソースを保持したUI限定パッチと本番配信を完了できていない。
Preview統合候補全体の本番反映は今回の本人限定アクセス承認に含めず、未反映DBに依存する版で上書きしない。

## PC Codexへの実行指示

本番を配信した作業フォルダで続行する。本番SHAまたは同等ソースを確認し、Activity/Banner等を保持する。
目的は本人限定メンテナンスアクセスだけ。課金本体・ガチャ・Seasonを混ぜない。

1. src/app/context/hooks/useMaintenanceTestAccess.tsを取り込み、GameContextに同hookのimport・現在session user ID＋maintenance判定による呼出・maintenanceEnabledから許可者を除外する3変更のみ追加する。
2. 添付maintenance_access_ui_only_20260915.patchは3ade18eに対するUI差分で、旧本番へ無条件git applyせず文脈を合わせる。ローカル統合commit全体をcherry-pickしない。
3. 型/build確認後、既存本番環境設定を使用してProductionとしてbuild/deploy。Preview用Supabase値を本番へPromoteしない。
4. 本人Googleログイン→新規チュートリアル開始を確認し、本人以外は停止を確認する。
5. DB Migration・許可行は適用済みなので再適用しない。メンテナンスを解除しない。許可期限は22:56:56 JST。
6. 配信SHA/Deployment ID/実画面結果を返す。今回は本番課金検証が可能になったとは宣言しない。

コード・配信・本人実機は未完了。DB許可だけでタイトルから進めると案内しない。
