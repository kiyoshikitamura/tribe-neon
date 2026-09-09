# Raid Room 第7工程 — 旧経路分離契約

2026-09-08。基準: `24fca1d58bf8ffab2687da8a70959b2f5670f34f`。新規Migration `20260908000254_raid_room_legacy_isolation.sql`。本工程はRoom用の戦闘・報酬を追加せず、旧入口への流入を防止する。生成設定は初期falseのまま変更しない。

## 再定義元と差分

|関数|元Migration|Roomの扱い／差分|
|---|---|---|
|start_raid_battle|00210|boss取得・ロック後、RP/初回無料フラグ消費前に55000で拒否。トランザクション中の先行回復もロールバック|
|finalize_raid_battle|00211|Replay・bossロック後、HP・ログ・progress・イベント・確定更新前に55000で拒否|
|finalize_expired_raid_instance|00210|bossロック後にreturn。旧CLEAR・TIMEOUT書込みや日次報酬を行わない|
|respawn_cleared_raid_slot|00210|bossロック後にnull。新Instance生成なし。既存ACTIVE判定もRoom除外|
|grant_canonical_raid_day_clear_reward|00210|bossロック後にeligible:false。旧clear台帳・Presentへ流さない|
|grant_canonical_raid_reward|00184|boss行ロックを追加し、Roomなら0。旧production報酬台帳・Present作成なし|
|grant_raid_reward|00146|boss行ロックを追加し、Roomならfalse。旧報酬台帳・Present作成なし|
|rotate_daily_raids|00210|終了候補・respawn候補・日次生成存在判定からRoomを除外|
|get_active_raids|00184|従来のrotation実行と返却形式を維持し、旧一覧からRoomを除外|

非Room本体は上記最新定義を再利用し、Master・報酬数量・RP・Replay形式を変更しない。公開実行権限は既存と同じ。新公開RPC・運用フラグ変更・既存データ更新はない。

## 判別と競合

判別正本は `raid_rooms.raid_boss_instance_id`。day key接頭辞やクライアント引数は使用しない。直接更新入口ではboss行ロック取得後、別SQLで台帳を再読込する。Room登録もboss行をロックするため、READ COMMITTEDでは登録待機後の最新台帳を確認できる。新規作成はboss・Roomを同一トランザクションで生成し、中間状態を他トランザクションへ公開しない。

startのuser→boss、finalizeのReplay→boss、respawnのadvisory→bossという既存順序を維持する。旧報酬2入口だけbossロックを追加する。rotationは候補抽出でも除外し、直接呼ばれる終了・respawn関数でも再判定する。

多接続競合は実測していない。READ COMMITTED以外の長寿命Snapshotに対する既存Instanceの後付けRoom登録は本工程の保証対象外。00252の登録関数はREAD COMMITTEDを要求するが、別の旧呼出し側の分離レベルまでは変更していない。既存Instanceの後付け登録・Backfill・開始済み戦闘の移行は実施しない。

## 確定済みReplayの再取得

`finalize_raid_battle` は元の `finalization_status='FINALIZED'` に対する保存結果returnを維持する。これは新確定・HP適用・報酬再発行ではない。Roomに属する未確定Replayは拒否する。既存非Roomの確定済み結果も引き続き返す。未来のRoom確定経路に対して旧入口を代替として使えることを意味しない。

## 未完了の接続

- 新Room公開参加・戦闘開始・戦闘確定・期限終了・救援・報酬資格と配送。
- `on_canonical_daily_activity_finalized` は現在全RAID確定を対象とする。今回、旧finalizeからRoom確定へ到達しないため変更しない。新Room確定を実装する前に、日次報酬triggerと集計対象、ランキング、ミッションの扱いを接続契約で整理する。
- `get_current_raid_battle_rewards` などの既存参照API・既存報酬履歴は変更しない。過去分の権利取消し・再計算は行わない。
- 旧日次自動生成は非Roomに対して継続する。新旧コンテンツの運用切替は未実施。
- 実DB適用、実Auth/JWT、PostgREST、多接続、実機確認は別工程。

機械検証はCの第7工程検証記録、親判定は第7工程統合記録を参照する。IMPLEMENTEDをVALIDATEDまたは全体完了と読み替えない。
