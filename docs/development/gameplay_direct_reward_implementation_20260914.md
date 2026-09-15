# Gameplay報酬直接配送 — 実装報告

状態：コード完成・ローカルSQL/型検証済み。Preview DB適用と定義postflight済み。実機受入前。Production未実行。

## 対象

- Quest drop、Room Raid討伐／救援、Quest遭遇の追加報酬、Login Bonus、PvP Seasonランキング報酬を直接資産へ配送。
- Mission通常受取とDaily Rankingは既存直接付与を維持。PvP通常戦報酬も既存CASH直接付与を維持。
- 課金Pack／DIAのPresent、Daily Mission未受取補填、過去に発行済みの未受取Presentは変更しない。
- Guild tenureおよびSeason切替の仕様・時刻は今回変更しない。

## DB

Migration：`20260914110219_gameplay_direct_reward_delivery.sql`。

`20260914072512_raid_room_mission_finalization_hooks.sql`の後に適用する。既存関数の配送箇所だけを、文字列の単一一致を確認して置換する。相違時は全体を中断し、現定義を再確認する。既存のRoom資格判定、Mission hook、2倍倍率、battle finalizeを再定義しない。

直接配送専用ledgerを新設し、ユーザー／種別／source key／itemで一意化。既存`grant_present_payload`を変更せず再利用し、ledgerと資産を同一transactionで更新する。内部helperはPUBLIC／anon／authenticated／service_roleへ直接公開しない。

Room grantsは既存Present参照と直接配送ledger参照を排他的に保持する。既存行の配送先は変更しない。参照RPCは旧Presentと新DIRECTの両方を返し、DIRECTには受取期限を表示しない。

## UI

- Room討伐／救援／Encounter bonusはDIRECTなら「獲得しました」、旧Presentなら既存受取導線を保持。
- Login Bonusは配送種別に応じてMy Bag／Presentへ誘導。
- Room PanelはDIRECT受取取得時に任意`onDirectReward`を呼ぶ。接続側で資産再取得・エラー表示を担当し、callback参照を安定させる。
- GameContext／usePatrol／page側の接続は親系統が担当。

## 検証

- PGlite SQL実行PASS：実Quest claimの装備個体・Item・Cash、Room Clear／救援2倍、retry重複防止、付与失敗時の資産・ledger・資格rollback、旧Present保持と投影、Login1日1回、helper権限制限、同一key数量相違拒否。
- 既存報酬adapter6件PASS、新DIRECT adapter4件PASS。
- TypeScript `tsc --noEmit` PASS。
- SQLテストの資格判定等は既存fixture。ライブのMission hook・ロック順序・課金lot trigger・全実機受入を証明するものではない。

実行例：

```sh
PGLITE_RUNTIME=/path/to/@electric-sql/pglite/dist/index.js node tests/db/gameplay-direct-reward.test.mjs
node --experimental-strip-types --test tests/raid-room/clear-reward.test.mjs tests/raid-room/rescue-reward.test.mjs tests/raid-room/direct-reward.test.mjs
```
