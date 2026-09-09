# Raid Room 初回の型契約

対象: RAID-A-01。正本: `specs/raid_room_rescue_v1.md`。
本書と `src/domain/raidRoom.ts` は未接続の表示用契約であり、既存RPCの返却形式や本番APIを変更しない。

## 総合力

`RAID_DIFFICULTIES` は4難度の内部ID・日本語名・確定下限と推奨目安を保持する。サーバー接続時は設定マスターとの一致を保証する。今回DBや既存Canonical Masterを変更しない。

`evaluateRaidPowerGate(difficultyId, power)` は総合力条件だけを判定する。初級は制限なし、中級160000、上級200000、超級240000、境界一致は `passed`。

- 初級は総合力が取得できなくても `passed / no_power_restriction`。参加可否全体は別判定。
- 中級以上の `null` / `undefined` は `unknown / power_unavailable`。
- 有限かつ非負のnumber以外（文字列、NaN、Infinity、負数等）は `unknown / invalid_power`。
- 未知難度は `unknown / invalid_difficulty`。入力の数値変換や0埋めをしない。
- 推奨値は判定で参照しない。

## サーバー参加資格と未取得

`RaidServerEligibility` は `unknown`、`eligible`（evaluatedAt）、`ineligible`（evaluatedAt/reasons）の判別共用体。総合力の `passed` から `eligible` を生成してはいけない。RP・Room状態・定員等を含む最終参加資格はサーバーが返す。資格判定時刻はISO 8601形式を接続側で保証する。書込み時にはサーバーで再検証する。

`reasons` は機械識別子の配列。コード集合はサーバー処理の契約確定時に追加し、未知コードは不許可のまま汎用表示する。

`RaidObserved<T>` の `unknown` は未取得、`available` は取得済み。`available` の0は実測ゼロ、nullは確認済みの不在。未取得を0・空配列・falseへ変換しない。

## DTO一覧

| export | 用途 |
|---|---|
| RaidRoomDto | Room識別、難度、Owner、状態、時刻、HP、参加者数、サーバー参加資格 |
| RaidParticipantDto | プレイヤー、現在Guild、戦闘時Guild、確定戦数、raw/applied |
| RaidRescueDto | 救援識別、Room参照、依頼者、Activity/Guild Chatの出所、遷移可否 |
| RaidResultDto | Room/Replay、状態、Damage、残HP、サーバー救援成功・報酬資格・報酬明細 |
| RaidRewardDto | 品目、数量、付与状態、Present参照 |

`RaidRoomState` の active/cleared/expired は既存状態との接続候補。新Roomの状態遷移・期限をここでは確定しない。未取得は `RaidObserved` で包む。

Guildの現在値と戦闘時Snapshotは別項目。どちらを資格判定や画面表示へ採用するかは仕様確認後に決める。救援成功のAND条件はサーバーが計算し、DTOは結果のみ保持する。

## 次の接続工程で確定する内容

RPC名・HTTP経路、生成/参加/救援/戦闘操作の入力、再送キー、ページング、取得APIの副作用、判定対象編成、救援帰属・集計開始時点、報酬一意境界は今回定めない。Room上限の未確認集計範囲もDTOで決めない。

当ファイルは型契約であり、ランタイム入力検証の代替ではない。接続時にはID・ISO時刻・有限非負の数値・enumを検証し、不明値を参加許可・報酬資格へ昇格させない。
