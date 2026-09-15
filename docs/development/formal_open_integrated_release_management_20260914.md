# GAME03 / TRIBE NEON
# 正式オープン統合リリース管理

更新日：2026-09-15
ステータス：実装・Preview受入管理用  
対象：正式オープン本体、Season切替、報酬付与、告知、Formal Open前正常化10項目

> この文書は、現在の正式オープン仕様と、添付「貼り付けたテキスト（1）.txt」の内容を統合した引継ぎ用Authorityである。
> 「確定仕様」「実装時確認」「提案・保留」を区別し、未確認の値を推測で埋めない。

## 1. Go / No-Go

### 1.1 予定日

- 正式オープン予定：2026-09-15
- 9/15は予定日であり、絶対固定日ではない。
- Release Gateが未達の場合は、品質を優先して延期する。
- 延期時は、日時、Season期間、メンテナンス告知、正式オープン告知、X投稿、ゲーム内お知らせを同時に更新する。

### 1.2 現在の判定

- 判定：Release Gate確認後にGo / No-Goを決定
- Formal Open前正常化10項目：全件Preview受入を目標とする
- Production反映：本管理文書の作成時点では実施しない

Blockerを残したままの日付優先リリースは禁止する。特に育成、報酬、編成、Mission、Leader Authority、Present表示に関わる不具合は、課金開始後の資産認識と商品価値に影響するためFormal Open Blockerとする。

## 2. Release Authority / 作業ルール

### 2.1 統合基準（2026-09-14 本流の最新承認で更新）

- 作業基準: `661dfd3d4ed2de3ca0420185f18537be5e34baa9` + 受入Authorityを確認したProduction差分。
- Production照合先: `dpl_6DFs3ee9hzRqQdC6D8nensQdNZ4y` / `44e43ee43c358b3bbe0b5dce64e538453581ba36`（ユーザー提供）。
- 本番Git objectを取得できないため、本番SHAのancestor条件を再開条件にしない。代替方式はユーザー承認済み。
- 本番で配信されている事実だけで受入Authorityとしない。未確認差分は「本番上では確認できるが未確認」として統合しない。
- Activity/Bannerは依存するRPC/DB/Feature Flag等まで照合する。コードだけの一致で本番同等と断定しない。
- 候補SHA・継承した差分・未確認差分を `preview_integration_authority_20260914.md` および本流報告に記録する。

### 2.2 Preview first

- 上記承認基準を祖先に持つ専用Candidateで作業する。
- 専用PreviewとPreview DBで実装・実UI Acceptanceを行う。
- Production DBは変更しない。Production反映は別途明示承認まで実施しない。
- 最近受入済みのRaid / Activity / Banner / Chat / Rankingを巻き戻さない。
- 既存のTrigger / RPC / RLSを意図せずdropしない。
- 今回必要なMigrationだけを追加し、既存ユーザー資産を没収・勝手に補正しない。
- 自動テスト・fixtureブラウザ確認と、実ゲーム動作・本人実機デザイン受入を区別する。

### 2.3 作業開始時の記録

```text
BASE PRODUCTION SHA:
DEPLOYMENT ID:
BRANCH / REF:
BRANCH ANCESTRY:
WORKING TREE:
PREVIEW URL:
PREVIEW DEPLOYMENT:
PREVIEW DB REF:
```

## 3. 正式オープンの確定仕様

### 3.1 Formal Openで公開する機能

- Monetization / Shop / Pack
- Raid Encounter
- Guild Emblem
- 専用Skill / Equipment
- AP MAX変更：100 → 50
- Season Close / Reset
- プレオープン総合力Ranking 1位報酬
- ギルバト準備Mission終了と30日Claim
- Formal Open新Season
- ゲーム内告知、メンテナンス告知、X告知

### 3.2 AP MAX 100 → 50

正式オープン時にAP MAXを100から50へ引き下げる。

- Quest消費：初級3 / 中級10 / 上級20を維持
- 無料時短：5回/日を維持
- 既存ユーザーのAPが50を超えていても、強制的に50へ切り捨てない
- 既存残量は保持し、50以下になった後からMAX50を適用する
- メンテナンス中のAcceptanceで、AP表示、消費、回復、上限判定を確認する
- AP回復課金がある場合、既存残量の切捨てが発生しないことを確認する

### 3.3 Season Close / Reward / New Season

正式オープンメンテナンスで、開催中のSeason-scoped状態を一度閉じる。プレイヤー資産の初期化ではなく、競争・ランキングのSeasonを切り替える。

#### 終了・Reset対象

- PvP Season Rank / Score / Wins
- 個人・Guild総合力RankingのSeason集計
- Season Snapshot / Reward State
- その他、Season Authorityに紐づくCompetition値

#### 維持するもの

- Character / Skill / Equipment
- Level / Awakening
- 所持Item / CASH / DIA
- Guild所属、Guild Level等の恒久Progress
- Guild Emblem Unlock
- Missionの恒久Achievement
- User Account情報

旧Seasonは履歴を残して `CLOSED` とし、新Season IDを発行する。物理DELETEや履歴消去を既定動作にしない。

#### プレオープン最終Ranking

- メンテナンス開始後、ユーザー操作停止を確認して最終Snapshotを取得する。
- プレオープン総合力Ranking 1位Guildのみを報酬対象とする。
- 2位以下へのRanking Emblem報酬はない。
- 報酬はGuild単位の限定Guild Emblemとし、個人所有にはしない。
- Reward RecipientのMember Snapshotは保存する。
- `season_id × guild_id × cosmetic_id` 等の既存Authorityを使い、Idempotentにする。
- 二重Unlock、二重Grant、二重通知を許可しない。
- 既存のGuild cosmetic / reward grant / recipient / ranking snapshot系テーブルを再利用できるか先に確認する。

#### ギルバト準備Mission

- 正式オープンメンテナンス時点で新規Progressを停止する。
- 完了済み・未受取の報酬は失効させない。
- 終了後30日間はClaimのみ可能とする。
- 9/15終了の場合の基本期限は10/15。正確な `claim_deadline` はメンテナンス完了時刻とDB時刻を基準に設定する。
- 期限後は受取不可・非表示とする。

#### New Season

- PvP／個人総合力／Guild総合力の3カテゴリを正式オープンと同時開始。
- 開始：運用時に確定した `p_open_at`。固定9/16開始・インターバル案は後続承認で廃止。
- 終了：2026-09-30 23:59:59 JST
- 半開区間を使う場合の `ends_at`：2026-10-01 00:00:00 JST（2026-09-30 15:00:00 UTC）
- DB時刻、UI表示、告知文を一致させる。
- Raid Rankingを廃止方向から復活させない。新Season対象は既存Season Authorityに従う。
- 正式オープンと同時の開始直後にNew Season ACTIVE、旧Season CLOSED、Ranking初期値、Guild Ranking、Season Mission、UI期間を自動確認する。

## 4. Formal Open前正常化10項目

添付仕様は「9件」と記載されているが、実際の番号付き対象は10項目である。管理対象は10項目すべてとする。

### 1. Skill Level表示完全廃止

確定仕様：SkillにLevelは存在しない。育成値は `plus_val`、表示は `+0` ～ `+10` のみ。

- Skill Lv / Skill Level / `skill.level` / `skillLevel` / `Lv.` 表示を全画面から除去
- 不要なClient stateを削除
- `SKILL_LEVEL_TOTAL_INCREASE` は、実態が `plus_val` 増加ならcanonical triggerへ意味を統一
- 既存ユーザーの進捗は失わない

### 2. Character / Equipment EXP正常化

Canonical Item MasterのeffectValueをAuthorityとし、素材個数ではなくEXP加算でLevel Upする。

- Character EXP：S=100 / M=500 / L=2000
- Equipment EXP：S=100 / M=500 / L=2500
- 必要EXP曲線は既存の正式Master / Repository Authorityを使用する
- 正式required EXP masterが存在しない場合は `BLOCKED: REQUIRED EXP MASTER NOT DEFINED` とし、勝手な数値を作らない
- 既存Levelと所持素材は維持する
- 新規XP列を追加する場合、既存データは `xp=0` から開始し、資産を没収・補正しない
- S/M/L混合投入、複数Level Up、上限、余剰EXP、CASH不足時のatomic rollbackを確認
- UIに現在Lv、現在EXP/次Lv必要EXP、獲得予定EXP、予測Lv/EXP、CASH費用を表示

### 3. Room Raid → Mission進捗正常化

`finalize_raid_room_battle_v1()` の正式finalize成功時にMission eventを1回だけ発火する。

- 対象：`RAID_FINALIZED_BATTLE_COUNT`
- finalized battleのみ加算
- retryで二重加算しない
- cancel / failed start / Tutorial等の別経路は加算しない
- `RAID_CLEAR_ELIGIBLE_COUNT` はRoom reward finalizeのAuthorityと一致させる

### 4. Guild在籍日数Mission正常化

現在Guild membershipの開始日から、JST日単位で継続在籍日数を算出する。ログイン日数ではない。

- 対象：`GUILD_TENURE_DAYS`（30日 / 90日）
- Mission同期時にauthoritative valueを計算する方式を優先
- 毎日全ユーザーへ加算するcronを既定にしない
- 脱退で停止、再加入はmembership history Authorityに従う
- 2026-09-14本流承認：加入日をDay1とする。現在membershipの開始日からJST日付差+1で算出する。

### 5. Quest難度選択 / 初級Default正常化

各街に初級・中級・上級を表示する。

- 初級：常時開放
- 中級：初級First Clear後
- 上級：中級First Clear後
- clearedは再プレイ不可を意味しない。クリア済みも選択可能
- lockedのみdisabled
- Quest画面入場時、街の初級を自動選択
- 街変更時も、その街の初級をdefault選択
- 同一画面でユーザーが中級・上級を選択した後は不必要に初級へ戻さない

### 6. MyPage小Raidアイコン削除

MyPageの小アイコン列からRaidを削除する。大Raid導線、Raid Banner、Activity救援、Primary CTAは保持する。

- 変更前：Mission / Ranking / Raid
- 変更後：Mission / Ranking
- DB変更なし

### 7. 通常Gameplay報酬をMy Bagへ直接付与

通常Gameplay報酬はPresent Boxを経由せず、即時にユーザー資産へ反映する。

- 対象を棚卸し：Quest drop / Raid reward / PvP reward / Mission reward / Ranking reward / Login Bonus
- Item → `user_items`
- Equipment → `user_equipments` 個体生成
- CASH → `users.cash`
- DIA → `users.neon_diamonds`
- Result表示は「獲得しました」。Present送付文言を出さない
- 1 reward = 1回、retry二重付与なし、ledger保持、Resultと実資産一致
- Present Boxは運営配布、補填、キャンペーン、特殊期限付き配布に限定する

### 8. 「アンケートのお礼」Present再表示修正

DB行を削除して対応せず、再表示のExact Sourceを特定する。

- legacy Mock Present / fallback state / hardcoded present / bootstrap fallback / static fixture / stale差分を調査
- 旧Mock `p_swr` 系互換コードを確認
- ProductionではMock / test / survey placeholderをinjectしない
- Mock fixtureは明示的Mock gate内に隔離
- 新規・既存・reload・Inbox open・bootstrap refreshをProduction-equivalent Previewで確認
- 正規Presentは表示し、「アンケートのお礼」は表示しない

### 9. Quest BattleのPartyをMain Formation Authorityへ統一

正式BattleのPlayer Main PartyはMain Formationを単一Authorityとする。

- 対象：Quest / PvP / Raid
- GvGは既存official snapshot契約を維持
- Quest開始時にも `get_current_main_formation()` を取得
- 5人のCharacter / Skill / Equipmentを保存済み編成から構築
- Quest派遣キャラクターとBattle Partyを混同しない
- Party変更、reload後もQuest / PvP / Raidが同じ編成になることを確認

### 10. MyPage / Character Leader Authority統一

Favorite / Profile LeaderとParty slot1を分離する。

- Favorite / Profile Leader Authority：`users.favorite_character_id`
- 用途：MyPage、Public Profile、Character画面のLeader表示
- Party slot1はBattle上の先頭メンバーであり、「Leader」と呼ばない
- `partyIndex === 0 → LEADER` 表示を廃止
- Party slot1表示は「先頭」「1st」「SLOT 1」等にする
- DBの`favorite_character_id`をMain Formation slot1へ勝手に書き換えない

## 5. Release Gate

### 5.1 Formal Open Blocker

以下の未達は日付より優先して延期判断する。

- Character / Equipment EXP正常化
- Room Raid → Mission進捗
- Quest Battle Party Authority
- Gameplay Direct Reward
- Leader Authority
- Skill Level誤表示除去
- 「アンケートのお礼」Present除去
- Season Snapshot / Ranking確定 / Reward Idempotency
- AP MAX 50の安全な適用
- 課金→素材→育成→編成→Battle→報酬の一気通貫

### 5.2 重要だが相対的に低いGate

- Quest難度UX / 初級Default
- MyPage小Raid削除
- Guild在籍日数Mission

原則は全10項目のPreview受入であり、低いGateだから省略してよいという意味ではない。

### 5.3 Acceptance

#### メンテナンス中

- User操作停止
- Production READ ONLY最終監査
- 全Season最終Snapshot
- 1位Guild確定
- 限定Guild Emblem付与
- Reward Recipient Snapshot保存
- Grant二重付与検査
- 旧Season CLOSED、履歴保持
- Season-scoped状態Reset
- ギルバト準備Missionの新規進捗停止、30日Claim設定
- Application / DB / AP / Monetization / Raid / Guild Emblem / Skill / Equipment公開確認

#### Production反映前の専用Preview

- Skill：Lv表示0件、+値のみ
- Growth：S/M/L差、混合投入、複数Lv、cap、余剰EXP、atomic rollback
- Mission：Room Raid 1戦、retry、Raid累積、Guild tenure
- Quest：初/中/上、cleared再選択、lockedのみdisabled、初級Default
- Party：Main Party変更後のQuest / PvP / Raid一致
- Leader：MyPage / Character / Public identity一致
- MyPage：小Raidなし、大Raid導線維持
- Reward：即時Bag、Presentなし、Result一致、duplicateなし
- Present：「アンケートのお礼」なし、正規Present正常
- AP：MAX50、既存50超の残量保持、Quest消費、無料時短、回復
- Season：旧CLOSED、新ACTIVE、期間表示、旧Reward再付与なし
- 課金：Pack購入、素材付与、育成、Battle、報酬

#### Regression

- Tutorial
- Character / Growth
- Quest / Battle
- PvP
- Raid Room → Preparation → Battle → Result → Room
- Mission / Guild
- MyPage / Present / Bag / Login Bonus
- Ranking
- Activity / Raid Banner / Chat

## 6. 統合Release Sequence

1. 確認できるProduction SHA・Deploymentと、統合branch・working treeを記録
2. 承認済み基準661dfd3＋確認済みProduction差分を継承するCandidateを作成
3. Formal Open前正常化10項目を実装
4. Preview DBへMigration / RPC / UIを反映
5. 10項目の実UI AcceptanceとRegression
6. Monetization、Pack、Raid Encounter、Guild Emblem、専用Skill / Equipmentを統合
7. AP MAX 100 → 50を統合（既存APの切捨てなし）
8. 統合Candidateの承認済み基準からの継承と、追加差分の受入Authorityを再確認
9. メンテナンス開始、User操作停止
10. Production READ ONLY最終監査
11. 全開催中Seasonの最終Snapshot
12. プレオープン総合力Ranking 1位Guild確定
13. ギルバト準備Missionの新規Progress停止
14. 旧SeasonをCLOSED、履歴保存
15. 1位Guildへ限定Guild Emblem Unlock
16. Reward Recipient Snapshot保存、Grant Idempotency検査
17. Season-scoped状態Reset、新Season row準備
18. Application / DB / Monetization / Raid / Guild Emblem / Skill / Equipment / AP更新
19. Production Smoke / Acceptance
20. ゲーム内正式オープン告知公開
21. メンテナンス解除
22. X正式オープン告知
23. 正式オープンと同時に3カテゴリのNew Season開始を確認（事前工程で開始済みの場合は再実行しない）
24. New Season開始直後Smoke

Production deployは、全BlockerがPASSし、Go判定が出た場合だけ実行する。

## 7. 告知文（確定方針に基づくドラフト）

日付・時刻はRelease Gate通過後の実施時刻と一致させる。延期時は全媒体を同時更新する。

### 7.1 ゲーム内：メンテナンス告知

```text
【正式オープンに伴うメンテナンスのお知らせ】

正式オープン準備のため、以下の日時でメンテナンスを実施します。

日時：2026年9月15日（火） [開始時刻] ～ [終了時刻]

メンテナンス中はゲームをプレイできません。

主な更新内容：
・正式オープン機能の公開
・Raid Encounterの公開
・Guild Emblemの公開
・専用Skill / Equipmentの公開
・AP最大値の100から50への変更
・プレオープンSeasonの終了とRanking確定
・プレオープン総合力Ranking 1位Guildへの限定Guild Emblem付与
・ギルバト準備Missionの新規進捗終了

達成済みで未受取のギルバト準備Mission報酬は、終了後30日間受け取れます。
新Seasonは正式オープンと同時に開始予定です。

※内容・日時はRelease Gateおよび作業状況により変更となる場合があります。
```

### 7.2 ゲーム内：正式オープン告知

```text
【TRIBE NEON 正式オープン】

TRIBE NEONは正式オープンしました。

プレオープンSeasonは正式オープンに伴い終了しました。
プレオープン総合力ランキング1位のTRIBEには、限定Guild Emblemを付与しました。
新Seasonは正式オープンから2026年9月30日 23:59まで開催します。
ギルバト準備Missionの達成済み報酬は、終了後30日間受け取ることができます。

新たに、Raid Encounter、Guild Emblem、専用Skill / Equipment、Packなどが利用できます。
AP最大値は正式オープンに伴い50へ変更されています。
```

### 7.3 X：メンテナンス告知

```text
【メンテナンスのお知らせ】
TRIBE NEON正式オープン準備のため、2026年9月15日（火）[開始時刻]よりメンテナンスを実施します。
終了時刻は[終了時刻]を予定していますが、作業状況により変更となる場合があります。
メンテナンス中はゲームをプレイできません。
```

### 7.4 X：正式オープン告知

```text
【TRIBE NEON 正式オープン】
TRIBE NEONは正式オープンしました。
Raid Encounter、Guild Emblem、専用Skill / Equipment、Packなど新要素をお楽しみいただけます。
プレオープン総合力Ranking 1位Guildには限定Guild Emblemを付与しました。
新Seasonは正式オープンから9月30日まで開催します。
```

## 8. DB / UI / 運営 / 課金への影響

### DB

- Character / Equipment EXP保持・加算Authority
- Room Raid Mission hook
- Guild tenure projection / membership history参照
- Direct reward ledger / idempotency
- Season close / snapshot / reward grant / recipient / new Season
- AP上限判定
- 既存Schema、RPC、Trigger、RLSとの整合

### UI

- Skill表示、Growth表示、Mission進捗
- Quest難度とDefault
- MyPage小Raidナビ
- Reward Result / My Bag
- Present一覧
- Quest Battle Party
- MyPage / Character Leader
- Season期間、Reward通知、AP表示

### 運営

- Present Boxを運営配布・補填・Campaign用途へ整理
- Season最終SnapshotとReward監査
- 30日Claim対応
- 告知の全媒体同期
- 延期時の日時・文言差し替え
- Preview結果、Production SHA、Migration、Acceptance結果を引継ぎ記録

### 課金

- 商品価格の直接変更はない
- Character / Equipment EXP正常化により既存素材の実効価値が変わる
- 所持素材を没収・自動補正しない
- Pack購入 → 素材獲得 → 育成 → 編成 → Battle → 報酬まで確認する
- AP MAX50によりAP回復の価値とFree Loopを確認する

## 9. 引継ぎ報告フォーマット

```text
STATUS:
GO / NO-GO:
BASE PRODUCTION SHA:
DEPLOYMENT ID:
BRANCH ANCESTRY:
FILES CHANGED:
MIGRATIONS:

FORMAL OPEN NORMALIZATION:
1. Skill:
2. Character / Equipment EXP:
3. Raid Mission:
4. Guild Tenure:
5. Quest Difficulty / Default:
6. MyPage Raid Mini:
7. Direct Bag Reward:
8. Survey Present:
9. Quest Party:
10. Leader Authority:

SEASON:
- Snapshot:
- Close:
- Ranking 1 Guild:
- Guild Emblem Grant:
- Mission Claim Deadline:
- New Season:

ACCEPTANCE:
REGRESSION:
TYPECHECK:
BUILD:
DIFF CHECK:
PREVIEW URL:
PREVIEW DEPLOYMENT:
PREVIEW DB REF:

PRODUCTION:
NOT EXECUTED / EXECUTED AFTER GO APPROVAL
```

## 10. 最終判断

正式オープンは、次の3系統を一つのRelease Gateで扱う。

1. 正式オープン新機能群
2. Formal Open前正常化10項目
3. Season Close → Reward → Reset → New Season

9/15は目標日として進めるが、Release Gate未達時は延期する。Production反映はPreviewでの実UI Acceptance、Regression、DB安全性、課金から報酬までの一気通貫確認が完了してから行う。
