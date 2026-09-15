# 探索→Raid Encounter 実装候補

基点：a70421643702e47a88366ef9eea952f435ef2990（受入済みリーダー修正を保持）。

## 実装

- 新しい探索完了・勝利だけをサーバーで捕捉。通常報酬の後、別RPCで抽選/生成。
- 探索級に依存せず初級〜上級を参加資格とweightで抽選。初回・連続未遭遇保証。
- 既存Raid登録/HP/期限/参加/戦闘Authorityに接続。通常の手動開催RPCは変更なし。
- 抽選結果・追加報酬内容を保存し、生成失敗後も同じ対象へ再試行。
- Clear/Rescue確定受取記録を入口として追加Presentを配送。Room×user台帳で重複防止。
- 発見画面、今すぐ挑む/あとで、Raid/探索から再訪、詳細の追加報酬表示。
- Missionとの排他、遷移中操作ブロック、既存保存Leader/編成を保持。

## 設定と非公開状態

Migration 20260913105642_quest_raid_encounter.sql。
enabled=false、追加報酬品目なしで出荷。30%/保証5回/50:35:15/個人1件は未FIX候補値で、有効化していない。
当日対象外許可もfalse。設定・報酬表FIX後にPreview設定を別途投入する。
上限で抽選できない探索は抽選外れ回数を増やさず終了し、初回/保証権利は次の探索へ保持する。発見できなかった過去探索を大量に再開催する仕様にはしない。
生成途中エラーはDRAWNを残して再試行。RPや戦闘開始は発見時に実行しない。

## 検証

- Typecheck、変更ファイルESLint（0 errors）、protocol/演出排他検証。
- PGlite新SQL実行：disabled、勝利、初回/保証、級独立、他人探索拒否、上限、再送、報酬snapshot、Clear+Rescue二重追加防止、救援者付与、ack再送。
- 生成失敗の部分rollback、抽選難度固定の再試行。
- PGliteの既存Raid登録・資格・日次対象はcontract double。実Raid登録との統合PASSとは区別する。
- Quest Result liveness / PvP Leader回帰を実行。

## 未完了・受入Gate

Preview実DBへの適用と現在定義照合、既存Raid実登録・救援・撃破・Present受取、画面素材/遷移実確認、実iPhone Safari。
初回ロードと探索完了時に未解決を再取得する。通信障害中の発見再提示・ログイン復帰は実画面で確認する。
数値・追加報酬表のFIX、当日対象外開催方針も未FIX。Production/alias/環境変数/稼働DBは未変更。
実機確認依頼：まだ不可。機能完成/正式公開可能とは報告しない。
