# 第18工程 親統合記録

2026-09-08。基準SHA `f65e7c460d42bd1dcbc71411a6c0a602a49de015`。RAID-A/B/C/P-18はVALIDATED。実DB・実機・全体開発の完了ではない。

## 変更とレビュー

旧一覧取得からも生成が起こるため、画面だけの切替では旧日次生成と新規出撃が残る問題を解消する。SQL263は `raid_legacy_settings.enabled` を追加し、初期trueで従来動作を維持。false時に旧rotate/respawn/get_active_raids/startを停止する。開始済みReplay確定と既存Present受取は変更しない。

設定共有lockを業務lockより前に取得し、停止更新との順序を定める。旧確定からrespawn呼出しがないことを確認。設定変更は設定だけを更新する管理transactionで行う。実多接続の待機/timeout試験は残る。旧rotate内の期限巡回も止まるため、残る旧期限確定は既存サービス関数で別途扱う。

Room UI flag trueでは旧画面と旧初期取得を置換。bootstrapはRoom参照を使い、失敗時も旧生成を伴うRPCへ戻らない。開催通知は旧HPと分離し、期限と認証切替を扱う。既存救援/出撃準備/Present callback、useBattleを保持。旧取得中・出撃準備の文字ラベルをスピナーへ修正。

Aはmigration、Bは画面/共有状態、Cは独立検証、親は契約・差分レビュー・環境復元・再検証・統合を担当。SQL263全文、SQL254との本体差、RaidTab/GameContext/helperと試験double範囲をレビューした。

## 親再検証

|対象|結果|
|---|---|
|SQL263と旧開始/生成/確定|11件PASS|
|実開催通知helper|4件PASS|
|実RaidTab切替|3件PASS|
|既存Room画面|28件PASS|
|実useBattleのRoom開始/復帰|17件PASS|
|全体TypeScript（build前・後）|PASS|
|Room flag trueのMock全体build|PASS|
|git diff --check|PASS|

SQL263 SHA256: `e9ad475d7afb5e6ed97da918d74b71e0acd875e2f41db794d8e69dc0999a7a75`。

コードは固定headからsparse checkoutへ復元。アプリ型/build依存は既存package-lockをnpm ciで復元し、package/lock変更なし。追加テスト依存は別一時runtime。Node v24.19.0。buildは `NEXT_PUBLIC_APP_ENV=preview NEXT_PUBLIC_USE_MOCK_DB=true NEXT_PUBLIC_RAID_ROOM_UI_ENABLED=true npm run build`、型は `npm run typecheck`。試験コマンドとfixture限界はraid_room_phase18_validation.md。

## 残件

実環境のSQL適用/旧運用停止、独立Preview DB・Auth・Edge・UI接続、報酬品目数量/成功閾値、実Cron・複数接続競合・実機受入。SQL255〜262と263を全て含むDBの通し検証は未実施。Room作成/他ユーザー撃破後の開催通知は次のbootstrapまで遅れる場合がある。表示通知を参加/報酬Authorityとして使わない。

この工程はコードと試験だけであり、実DB更新・Deploy・merge・運用設定変更なし。実機確認可能Previewやレイド全体完成とは通知しない。次は設定・Preview接続の準備と残る参照整合を進める。
