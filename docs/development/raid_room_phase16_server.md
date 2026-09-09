# Raid第16工程 サーバー実装

TASK: RAID-A-16 / IMPLEMENTED（親検証前）

## 判定の正本

本人の開催中累積貢献Damageが設定値を**超えた**ことと、Roomの討伐成功をANDで判定する。設定値と一致は対象外。作成者・通常参加者・救援参加者で分けない。本人Roomごとに1回。

開催中に確定した戦闘かどうかはSQL256がbossロック後に計算・上書き保存する `finalization_result.lateFinalization` のJSON boolean falseを使う。撃破を成立させた戦闘はfalseなので対象。終了前に開始しても終了後に確定した戦闘はtrueなので対象外。欠落・文字列falseも対象外とする。`finalized_at < outcome_finalized_at` にすると撃破打を除外するため、その比較は使用しない。

ログのraw_damageを合算する。共有HPへ適用したapplied_damageではない。確定済みRAID_SERVER Replay、本人・Instance・Room文脈、開始要求台帳、Room参加記録をjoinして集計し、別人や旧Raidのログを混ぜない。

## SQL262

| 対象 | 内容 |
|---|---|
| raid_room_clear_reward_rules | 難度別enabled=false、minimum_contribution_damage=null、rule_version=1。閾値は0以上。NULL時は未設定 |
| raid_room_clear_reward_items | 品目・数量は空。数量正数、難度×品目一意 |
| raid_room_clear_rewards | Room×User一意。発行時のrule_version・有効戦数・貢献合計・clear_gate（閾値を含む）・発行時刻・期限を保存 |
| raid_room_clear_reward_grants | Room×User×品目一意。Present IDを紐付け |
| _raid_room_clear_reward_progress_v1 | 読取専用の条件判定。strict raw > threshold AND CLEAR |
| _issue_raid_room_clear_rewards_v1 | bossロック下で条件を満たす全参加者へ自動発行。台帳のON CONFLICTで再送重複を抑止 |
| on_raid_room_clear_reward_finalized_v1 | Replay確定後trigger。撃破時に既に貢献条件を満たした別ユーザーも評価 |
| get_raid_room_clear_reward_v1 | 認証本人のみの報酬状態・明細参照。読取で発行しない |

全新規tableはRLS有効・PUBLIC/anon/authenticated/service_role権限を取り除く。公開するのは本人read RPCのauthenticated実行だけ。設定編集・発行helperを公開しない。

## Presentと救援報酬の関係

Present自動送付・送付から30日期限は、既存救援報酬と共通の実装前提として採用する。品目/数量は投入していない。Present `source_kind=RAID_ROOM_CLEAR` を使い、救援の `RAID_ROOM_RESCUE` と別台帳で共存させる。救援側のAND条件・終了前開始戦闘の終了後確定の扱いは変更しない。

報酬発行時に設定rowと品目rowを共有ロックし、同一発行処理では同じ品目JSON snapshotを使う。発行済み明細は設定変更後も台帳の内容を返す。Present書込み失敗は例外を握りつぶさず、その戦闘確定transaction全体をrollbackする。SQL260のRoom writer NO KEY UPDATEを前提にし、追加のusers強ロックは取得しない。

## API

`get_raid_room_clear_reward_v1(p_room_id uuid)` は次を返す。

- roomId
- status: unconfigured / not_eligible / pending / issued
- clearGate: status（unknown / not_succeeded / succeeded）、ruleVersion、contributionDamage、minimumContributionDamage（nullable）、cleared
- issuedAt / expiresAt（未発行null）
- items: itemId / quantity / presentId / presentStatus / claimedAt / expiresAt

設定無効・閾値NULL・品目未設定ではunconfiguredとして発行しない。既発行は保存gateと既存Presentの受取状態を返す。未設定時もruleVersionは1以上。未知RoomはP0002、非認証は42501。

## 検証・残件

CのPGlite限定SQL検証と親レビューへ引き渡す。実DB・実Cron・複数接続競合・実機試験は行っていない。閾値と品目数量の設定、実DB適用、実機調整は未完了。SQL262を新API呼出し画面より先に適用する。実DB/Deploy/Room運用flagは変更していない。
