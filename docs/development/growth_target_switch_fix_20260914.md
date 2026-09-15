# 覚醒・LB 対象切替修正 — 2026-09-14

BASE: 767b6f4540409d1f6aae02df9424fc2294f1baf0
STATUS: implementation and automated validation complete; Preview device acceptance pending.

## 原因と修正
- 覚醒: UIが渡す所持IDを無視し、旧選択IDとプロフィールLeader由来の覚醒値で判定。渡された所持行を対象・上限判定に使用。
- 装備LB: 旧global段階と、実RPCにないCASH費用で誤判定。所持行・canonical cost curveへ統一。必要パーツ1〜4を表示。現RPCの同名個体1個、CASH不要を維持。
- スキルLB: A処理中にBへ切替後、Aの結果をB選択stateへ書く不具合。捕捉した対象IDと一致するときだけ応答を反映。装備も同様。
- 失敗を無表示で終了せず、結果不明時はreload確認を案内。既存操作中ロックを維持。

## 検証
- scripts/verify_awakening_target_switch.mjs: PASS
- scripts/verify_lb_target_switch.mjs: PASS
- scripts/verify_character_awakening_copy_equivalent.mjs: PASS
- Typecheck: PASS
- tests/db/growth_target_switch_preview_rollback.sql: Preview実RPCで覚醒A/B・装備A/B(CASH 0)・スキルA/B・CASH不足atomic rollback PASS。全fixture操作をROLLBACK。
- 通信応答喪失後のサーバーexactly-onceは今回追加・保証していない。
- Build/配信結果は最終commit statusと報告で確認。Mock環境でのローカルbuildを実接続E2Eとみなさない。

DB migrations: none. Preview永続データ変更: none. Production: NOT EXECUTED.
