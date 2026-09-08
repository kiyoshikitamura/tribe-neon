# 第14工程 — ランキング・別報酬の限定根拠照合

記録日: 2026-09-08 JST。担当: RAID-A-14。対象基準: 第13工程 `bb6782c5303fedcea1570f603538811b236f03b6`。

## 結論

新Roomの救援成功報酬は確定済み。一方、新Roomを既存ランキングへ含める条件、主催者・通常参加者への別報酬は、今回確認したRepository資料では新仕様への適用根拠を確認できなかった。未決定とは断定しない。旧レイドの報酬仕様があることと、新Roomでそのまま有効化できることを区別する。

数値調整やゲームバランスの再監査は行っていない。依存しない実装の継続を妨げるものではない。

## 確定済みの新Room条件

根拠: `specs/raid_room_rescue_v1.md`「2026-09-08 救援依頼の追加確定」「2026-09-08 救援報酬の追加確定」。

- 救援リンクから初めて参加登録したユーザーが救援資格対象。Room作成者と既に通常参加済みのユーザーは救援資格対象外。
- 救援経由・必要戦闘数・必要Contribution Damage・CLEARのAND条件を満たした本人へRoomごとに1回。
- Room終了前に開始した戦闘は、撃破後の確定で条件を満たしても対象。未撃破の期限終了はCLEAR不成立。
- Presentへ自動送付し、送付から30日で受取期限。
- 品目・数量・成功閾値は設定へ分離。未提示値を承認済みとして投入しない。
- 同節は「主催者/通常参加者の別報酬とランキング切替はこの承認に含めない」と明記している。

## 既存仕様として確認できた条件

以下は新Room以前の契約・履歴であり、新Roomへの引継ぎをこの文書で決定しない。

|資料・節|確認できた内容|新Roomへの適用上の限界|
|---|---|---|
|`specs/product_decisions.md`「PvP・レイド確定仕様（2026-08-05）」|レイドランキングを設ける。撃破・時間切れとも報酬マスタ管理|Room生成者、救援者、通常参加者の報酬区別はない|
|同「Production Specification Reconciliation（2026-08-17）」|通常Ranking Seasonは月次、日次境界は00:00 JST、カテゴリにRaidを含む|新Roomを集計に含めるか、切替時点や難度別集計は明記されていない|
|`specs/spec_guild_gvg_raid.md`冒頭「Ranking / Power Production Contract（2026-08-17）」|Raid DailyはInstance単位、Seasonは明示期間内の正規Instance横断|新Roomを正規Instanceへ含める条件はない|
|同第3章「報酬マスタと自動配布システム」|DAMAGE_ACCUM、DEFEAT、RANK_PERSONAL、RANK_GUILD。条件達成・討伐・Season集計で配布|新Roomでの累積範囲、主催者の別待遇、救援報酬との重複条件はない|
|`specs/production/gameplay_foundation/pvp_raid_ranking_production_freeze_20260822.md`「Raid」|参加、活発参加、5ポイント参加、CLEAR、個人/Guild順位報酬をPresentで一度配布。Guild帰属は戦闘開始時Snapshot。Guild順位報酬にはInstance終了時の所属と当該Guildへの貢献が必要|旧2エリア・5種ボスの文脈。新Roomの主催者・通常参加者報酬へ引き継ぐ記録は確認できない|
|同「Ranking」|競技順位（同得点は同順位）、得点降順・到達時刻・安定ID順、ページングと自己順位|表示順の既存契約であり、新Roomの集計資格を定めるものではない|
|`specs/spec_battle_system.md`第4章「レイド」|参加条件・報酬等はレイドマスタ管理|新Roomの対象者・付与単位・切替条件の詳細はない|

8月22日資料の「PRODUCTION FREEZE PASS / CLOSED」は、その文書の仕様凍結状態を示す。同資料末尾はProduction/Preview未適用と記載しており、現在の実DB配布状況の根拠には使用しない。

## 次の実装に必要な未提示条件

|対象|今回の確認では埋められない条件|
|---|---|
|ランキング対象|新Roomを既存の日次・Season個人/Guild順位へ合算するか、別集計か、対象外か。切替日以降の扱いと開始済み旧戦闘の扱い|
|主催者・通常参加者の別報酬|旧参加・累積・CLEAR報酬等を引き継ぐか。対象者、最低条件、Room/日次/Seasonの付与単位、救援報酬との重複資格|
|報酬設定|使用する品目・数量と設定版。設定可能な構造を実装済みであることと、値が承認済みであることは別|

既存の集計接続上の残件は `docs/development/raid_room_cutover_remaining.md` を参照する。本工程はそのSQL監査を再実施していない。

## 照合範囲と実施内容

- `specs/` のMarkdownに対して、Room/救援/主催とランキング/報酬の組合せ、レイド関連文書、`product_decisions.md`を限定検索。
- 上表の各節と `specs/specification_reconciliation.md` のRaidランキング記述を読んで照合。
- 新Room明示の報酬・ランキング記述は `raid_room_rescue_v1.md` に確認。他文書の旧仕様を新Room承認と読み替えない。
- 検索結果は取得済みローカルRepository資料の範囲。「全ての過去チャットに仕様が存在しない」という証明ではない。
- 変更は本書のみ。ゲーム仕様の追加確定、コード・SQL・DB変更、数値調整、Deploy、Git操作は行っていない。
