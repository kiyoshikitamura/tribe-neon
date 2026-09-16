# クエスト進捗型 仮Master・ミッション接続

## 仮設定

正本JSON: `src/domain/gameplay/canonical/data/quest_progression_20260916.json`。
全値は実装・Preview確認用で、正式バランスではない。無料時短の現行回数は変更しない。

- 21ステージのAP: 3〜23（1ずつ増加）。探索時間: 60〜1260秒（60秒ずつ増加）。
- 通常CASH: 300〜2300、通常ユーザーXP: 100〜1100。
- 初回CASH: 300〜1300、初回ユーザーXP: 100〜600。
- 通常素材: `CHAR_EXP_M` と `EQUIP_EXP_M` 各1〜3。初回素材: 同じ2種を各1〜7。
- ボス基礎HP/ATK/DEFはステージごとに増加。SPD/LUKは一定。基礎値と倍率はMaster変更可能。
- 通常報酬は探索完了、初回報酬はボス勝利という仮の付与タイミング。通常報酬は初回攻略時のみボス勝利まで遅延する設定にも対応する。周回はボス戦がないため常に探索完了。初回突破報酬はボス勝利に固定し、探索完了時に渡したい分は通常報酬へ設定する。報酬本体の重複付与はしない。

既存 `canonical_quest_master` の `progression_*` 列に隔離し、既存AP・時間・報酬列は変更しない。
報酬poolも `QP_NORMAL_q_*` と `QP_FIRST_q_*` の新IDのみ追加する。
進捗型を有効にしたユーザーだけが新値を使う。旧未受取精算には従来値を利用できる。

再生成: `node scripts/generate_quest_progression_master.mjs <出力SQLパス>`。
未適用時のみ既存Migrationを再生成し、適用後の変更は新Migrationとして出力する。

## 初回報酬

`_grant_quest_progression_first_reward_v1(uuid,text,uuid)` は内部関数。
勝利と初回クリア保存の同一トランザクションから呼ぶ。
`quest_progression_first_reward_receipts` のuser/quest一意制約でCASH・XPを含む二重付与を防止する。
クライアントから直接実行できない。アイテムは既存Gameplay直接付与を再利用する。
受取済み結果は再送時にも同じJSONを返す。

## ミッション条件

| trigger_type | condition_params | target_value |
|---|---|---|
| QUEST_STAGE_CLEAR | `{"quest_id":"q_shinjuku_1"}` | 1 |
| QUEST_TOWN_CLEAR | `{"town_id":"shinjuku"}` | 1 |
| QUEST_STAGE_CLEAR_COUNT | `{}` | 必要な異なるステージ数 |
| QUEST_ALL_STAGES_CLEAR | `{}` | 1 |

新進行version `2026-09-16` のユーザーだけ `user_quest_first_clears` を参照。LEGACYは評価しない。周回では加算しない。
NORMALとSPECIALで利用可能。SPECIALはイベント期間が有効な場合のみ評価する。
累積クリア判定のため、過去に達成していれば後からミッションを追加しても達成可能。
指定街が未定義の場合は達成させない。全クリアは対象Masterが21件揃っていることも検証する。

初回クリアINSERTで既存の未達行を更新し、ミッション同期／受取後の共通hookでも再評価する。
CLAIMED・CLEARをPROGRESSへ戻さず、既存ミッション受取ledger・受取日時は変更しない。
設定例4件は `qp_template_*` として無効状態で登録する。正式ミッション追加は別途Master設定で実施可能。

## 検証

`tests/db/quest_progression_missions_rollback.sql` をPreviewで実行。トランザクション最後にROLLBACKする。
専用QAユーザー `6ea6c81c-e169-457f-9206-92ff85f1495e` を明示指定し、クリアの新設・後付けミッション・周回相当再評価・CLAIMED保持・全クリアを確認する。
