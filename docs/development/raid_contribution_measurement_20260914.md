# Raid 上級・超級 Contribution 実測

STATUS: READ ONLY AUDIT COMPLETE / THRESHOLD HUMAN FIX REQUIRED

- 対象: Production Supabase `ktpolnkyyfkowxdmijww`。
- 計測: 2026-09-14 17:38 UTC（2026-09-15 02:38 JST）。文書名の日付は改修起票日。
- 全照会を `BEGIN READ ONLY`、statement timeout 15–20秒、lock timeout 2秒、`ROLLBACK` で実行。Production変更なし。
- 個人名・ユーザーIDを出力しない集計。QAアカウントの確定除外リストがないため、QAを除いた一般ユーザー標本とは断定しない。

## 集計 Authority

`raid_rooms` → `raid_bosses` → `battle_replay_sessions` → `raid_damage_logs` を結合。正式 Room Battle のみを対象とする。参加単位の比較には、既存 clear gate と同じ start request / membership / official_context.roomId の一致、`RAID_SERVER`、`FINALIZED`、`lateFinalization=false` を要求した。

- raw_damage: バトルで算出したダメージ。残HPを超える分も含む。
- applied_damage: 実際にInstance HPへ適用したダメージ。残HPで上限。
- 総合力: 現在値を遡及参照せず、開始時 `official_context.formationPower` を使用。今回対象で欠損0。
- 参加回数: 同一ユーザー×同一Instanceのfinalized Battle数。報酬判定の集計からlate finalizationを除外。

## 1戦実測

全193戦。全難度でlate finalizationの観測0。実測期間は2026-09-09 18:02 UTC～2026-09-14 15:11 UTC。

|難度|正式戦闘|参加UU|Instance数／撃破数|観測HP範囲|raw damage P10／中央値／P90|開始時総合力 中央値|
|---|---:|---:|---:|---:|---:|---:|
|初級|57|11|38／25|180,000–36,000,000|186,000／220,561／2,369,061|624,966|
|中級|30|6|15／12|2,100,000–4,300,000|1,009,904／1,811,263／3,477,344|578,705|
|上級|63|7|9／7|5,700,000–15,800,000|393,801／1,211,512／3,813,939|525,707|
|超級|43|6|3／1|15,100,000–31,300,000|745,770／1,252,245／2,015,977|448,766|

Instance数は戦闘なしも含む。初級HP範囲に大きな差があり、過去の設定変更・QAの影響を含み得る。新Profileだけの実績ではない。

|難度|1戦 raw damage / Instance最大HP P10／中央値／P90|開始時総合力 P10／P90|開始時総合力 最小／最大|
|---|---:|---:|---:|
|上級|2.49%／7.97%／28.54%|248,809／939,500|248,809／1,364,634|
|超級|2.43%／4.03%／9.24%|325,357／625,860|245,680／652,878|

上級1戦のapplied damage P10／中央値／P90は277,424／1,210,064／3,813,939、超級は745,770／1,252,245／2,006,556。

## 参加回数と候補の影響

|難度|ユーザー×Instance数|参加回数 P10／中央値／P90|最大参加回数|1戦のみの組数|
|---|---:|---:|---:|---:|
|初級|35|1／1／3|12|29|
|中級|21|1／1／2|5|16|
|上級|27|1／2／4.4|10|12|
|超級|10|1／4／7.5|12|3|

撃破済みInstanceに限り、各ユーザーの累積applied damageを最大HP比で比較した。条件は `>=` を使った候補シミュレーションであり、現在の実装を変更したものではない。

|難度|撃破済み参加組数|1%以上|2%以上|3%以上|5%以上|10%以上|2戦以上|
|---|---:|---:|---:|---:|---:|---:|---:|
|上級|25|25|25|24|23|19|13|
|超級|1|1|1|1|1|1|1|

上級で5%をraw damageに適用すると24/25通過、applied damageなら23/25。上級で「1戦のみ、開始時残HP5%未満」の観測は1組。raw damage条件は残HPにかかわらず大きな数値を獲得できるため、撃破直前の参加対策として限界がある。

## 現行 clear / cancel / late の定義

Productionの `_raid_room_clear_reward_progress_v1()` は、Room membershipと正規start requestを確認し、正式finalizedかつlate=falseのraw damageを合計する。

現在の条件は、1戦以上、`sum(raw_damage) > minimum_contribution_damage`（厳密な大なり）、`outcome=DEFEAT_SUCCESS`。現在の閾値は初級10,000／中級50,000／上級60,000／超級75,000。この既存数値を新仕様のFIX値とは扱わない。

`finalize_raid_room_battle_v1()` は、同じReplayがFINALIZEDなら保存済み結果を返す。cancel / failed startは正式finalizationへ進めない。期限前に正規開始した戦闘は遅延finalizeされ得るが、撃破後・期限後はlate扱いとなりapplied damage=0、clear gate対象外。今回lateの実データは0件で、この挙動は関数定義から確認したもの。

初級・中級の新仕様「撃破前の正式finalize 1戦以上」を実装する際、既存のダメージ閾値を残さないこと。上級・超級の未確定値を既存60,000／75,000で黙って代用しないこと。

## 閾値の検討案（未FIX）

候補として **Instance最大HPに対する累積applied damage比率** を比較する。これは新しい判定Authority案なので、人の仕様決定が必要。

- 上級: 3%または5%。旧実績では24/25または23/25組が通過し、2戦必須の13/25より強い1戦参加を許容できる。
- 超級: 5%を検証開始候補とする。1戦中央値4.03%に対して多くの参加者は複数戦が必要になる想定。ただし撃破済みが1組しかなく、採用を裏づける成功標本は不足。
- applied基準は残HP不足で後参加者が達成不能になる。参加前に資格進捗・残HPを見せる必要がある。raw基準を維持する場合、この制約は弱まるが、撃破直前参加対策も弱まる。
- 2戦以上を一律必須にすると上級の既存成功参加の約半数を除外する。今回の目的だけを理由に暗黙追加しない。

今回、敵Stats / Skill / Difficulty強度も変えるため、旧Production分布だけでは新Profileの難度を保証できない。新ProfileのPreview戦闘で、260,000前後を含む同条件の編成を用いて再測定してから閾値をFIXする。

## 残る人の判断

1. 上級・超級それぞれのContribution閾値。
2. 判定を現行raw damageのままにするか、applied damageへ変更するか。
3. 達成比較の境界（候補集計は `>=`、現行は `>`）。

この報告は監査結果と比較候補のみ。Migration適用・報酬付与・Production設定変更は実施していない。
