# Raid Production 公開実行記録

製品sourceは c844534f5ce160fb3e713a58aed8377190aaa209 のまま。公開Bundleと実行証跡commitは別記録。
ユーザーが公開報酬設定を承認し、Characterの固定Preview統合受入の確認にも「問題ありません」と回答した。メール認証処理の変更なし、既存受入を引継ぐ。V3の未実装追加調整を今回の公開へ混ぜない。

配信担当はこの親task 01a08683-a33e-7523-b19f-8f0f32ec087f 一名。Character/KPI/告知担当の並行writerなしを直前に確認。告知担当7af465b3は未配信、バナーはユーザー指示でオミット。告知・System通知は本番確認後に結果引継ぎし、ここでは実行しない。

現本番550c022 / dpl_A53gBsmTqXXBiUVDpXwQxpigJJMx / 75 alias。KPIの2関数・1履歴追加だけを実定義で確認。KPI担当の報告hashと一致。旧guardを無条件に緩めず、新baselineと保持postflightを別Bundleとして生成した。ほか7分類のカタログguardは原本どおり。KPI専用2aliasは変更対象外。

最新本番catalog406関数/202relationを隔離PG17へ再構成し、固定BundleのROLLBACK/COMMIT、28Profile、承認設定/受付ON/停止、KPI関数とACL保持PASS。既存c844の実Auth/Edge/報酬/再送/表示検証を再利用し、広域戦闘は追加しない。

## 実行順

bundle/apply-db.sql → 固定5ファイルのresolve-battle（JWT必須）→ 03期限Cron → c844を新規Production build（skip-domain）→ 実配信接続照合 → 08承認設定 → 09新受付ON/旧受付OFF → ゲームwww/apexの2aliasだけ切替 → 本番smoke。
本番にRoom/Profileは未存在、旧RAID PENDINGは0。適用済みSQLを再投入しない。各phaseはoutcome記録が存在したら再実行を拒否し、SQL/HTTP不確実時は実状態を調べる。

## 保持と復旧

28編成・HP・装備・Skillはc844原本06/07をbyte同一で使用。公開報酬はapproved-settings.json。両報酬撃破必須、既存対象期間・救援資格・exactly-onceを維持。属性×2/Guild×2は追加有効化なし。QAユーザー・短縮HP・seed・テスト報酬は公開Bundleに含めない。
不具合は05-stop-new-operationsで作成/開始/救援/旧受付を停止し、互換DB/Edgeと既存Replay/Present台帳を残す。既存資産/HPの巻戻しや旧ランキング再開はしない。フロントは互換性を確認した配信へ2aliasだけ復旧し、KPI aliasは触らない。

適用日時・結果は各 *-applied.json、配信とsmokeは完了後に追加する。未実施をPASSとして扱わない。
