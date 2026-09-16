# Raid 第7工程 — 旧経路分離の機械検証

2026-09-08 JST。RAID-C-07 の実装・自己検証記録。状態: IMPLEMENTED（親レビュー前）。基準24fca1d58bf8ffab2687da8a70959b2f5670f34f。全体の受理状態は親統合記録を参照。

## 実行対象と結果

PGlite 0.5.8 / PostgreSQL 18.3、一時メモリDB。14件 PASS、0 FAIL。

```bash
RAID_TEST_RUNTIME_DIR=/workspace/scratch/be0ce4e059a1/raid-typecheck-runtime node tests/db/raid-room-legacy-isolation-run.mjs
```

実Migration 00250〜00254を無改変適用。00254のSHA-256は `62e224d0b09862978ff8ce7ad93c3559a577d70ade623c0230102dc38115c4e1`。
旧00210から `canonical_raid_rotation_pair` と `on_canonical_daily_activity_finalized` の定義を本文無改変で抽出し、実AFTER UPDATEトリガーを接続する。00254で置換される9関数は実Migrationそのものを実行する。

|検証|結果|
|---|---|
|生成設定は初期false|PASS|
|Roomの旧開始を初回無料・通常RPとも55000拒否、全対象台帳不変|PASS|
|Roomの旧確定を通常・致死Damageとも55000拒否、日次trigger含め副作用なし|PASS|
|既確定Replay再取得は保存結果のみ、副作用なし|PASS|
|Roomの期限・HP0・既撃破に旧終了/respawnを適用しない|PASS|
|Roomへの日次clear・旧canonical・旧reward直接呼出しで付与0|PASS|
|旧Instance開始の初回無料・RP1・Snapshot返却|PASS|
|旧開始の認証・Lv・RP・期限拒否|PASS|
|旧確定のHP/log/progress/event・ミッション呼出し・実日次triggerと再送冪等|PASS|
|旧日次3戦・RP5報酬triggerの維持|PASS|
|旧撃破のclipping・clear台帳・respawnと重複防止|PASS|
|旧期限終了・旧2種grantの1回付与|PASS|
|rotation/旧一覧でRoom除外、同エリアRoomが旧2枠生成を塞がない|PASS|
|旧writerのauthenticated拒否・service_role権限メタデータ|PASS|

副作用比較はusers、boss、Room/参加、Replay/events、Damage/progress、Present、各報酬台帳と依存呼出し記録をJSON比較。各ケースをBEGIN/ROLLBACKで隔離する。

## 依存fixtureと限界

既存projection/lifecycle/creation fixtureを拡張し、実関数で参照する列・台帳・制約のみを作成。全schema・全RLS・全triggerを再現する試験ではない。

- Auth UIDは設定値から返すdouble。実Auth/JWT/PostgRESTは未検証。
- 回復、Snapshot構築、結果検証、ミッション、報酬item解決はdouble。呼出しの維持・拒否時の副作用なしを検証し、それぞれの業務処理や計算公式を検証したとは扱わない。
- 敵構成は1体の最小fixture。実7種5体や戦闘計算の回帰試験ではない。
- usersのRP9は既存creation fixture由来の資産変更検出用sentinelであり、ゲーム上限の設定ではない。
- 実行した日次報酬triggerは00210の1本。全既存trigger、Productionでの直接付与/Present経路の一致は未確認。
- 真の複数接続ロック競合、実DB適用、ブラウザ、実機、配信は未検証。

## 後続の条件

新Roomの戦闘確定は拒否を維持する工程であり、新Room戦闘・救援・報酬が完成したとは扱わない。実運用で新Roomの確定済戦闘が存在しないことが前提。既確定Replay再取得試験のRoom行は副作用のない互換動作を確認する人工fixtureのみ。

将来、新Roomの確定を有効にする際は既存日次trigger・集計にRoom戦闘を混入させない分離が必要。今回その将来の集計変更を実装・検証済みとはしない。生成フラグはfalseのまま。

公開範囲、Main Formationと出撃編成が異なる場合の判定、期限後確定は新仕様上の未確認事項を維持。バランス研究・マスター変更は行わない。
