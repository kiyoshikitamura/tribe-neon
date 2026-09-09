# Raid第15工程 サーバー実装

TASK: RAID-A-15 / IMPLEMENTED（親検証前）

## 決定と適用範囲

Product Ownerのレイドランキング廃止方針と継続指示に従う。SQL261の適用以降、レイドの個人/Guild・日次/Season順位と順位報酬の新規生成を停止する。実DB適用は行っていない。

## 変更関数

| 関数 | 変更 |
|---|---|
| get_raid_rankings(uuid,integer,integer) / (uuid) | 認証・pagination検証後、status RETIRED、individual/guild空配列、selfRank null。順位計算なし |
| get_raid_season_rankings(integer,integer) | 同じ空返却。Season日時/IDもnull |
| get_my_raid_contribution_v1(uuid) | 新規本人貢献専用read。auth.uid固定で他人・順位を返さない。旧Raidは従来表示と同じraid_day_key合算、Roomは当該Instanceだけ。raw_damage合計をcontributionへ返す |
| finalize_raid_season_rewards(uuid) | 0件返却。順位snapshot/Present/報酬台帳を新規生成しない |
| advance_ranking_season(text,timestamptz) | RAIDはnull返却し新Season生成/既存Season変更なし。PVP分は従来処理保持 |
| get_active_ranking_seasons() | RAIDのみ表示対象から除外。保存Seasonは変更しない |
| grant_canonical_ranking_season_reward(...) | RAID_PERSONAL/RAID_GUILDは0、PVPは233の処理保持 |
| grant_canonical_daily_ranking_reward(...) | RAID_PERSONALは0、他3カテゴリは234の処理保持 |
| finalize_daily_ranking_rewards(date) | Raid順位/受取者snapshot生成ブロックを除去。既存Raid受取者も新規付与loop対象外。POWER/GUILD_POWER/PVP生成維持 |
| capture_daily_ranking_participation() | 全Raid確定は早期return、PVP参加記録保持 |
| grant_canonical_raid_reward(...) | PERSONAL_RANK/GUILD_RANKの直接呼出しも0。他の旧報酬種別は保持 |
| grant_raid_reward(...) | reasonまたはmasterがRANK_PERSONAL/RANK_GUILD/PERSONAL_RANK/GUILD_RANKならfalse。他種別保持 |
| raid_season_reset() | 既存admin認証後noop。旧85のDamage削除・HP復活も実行しない |
| converge_ranking_lifecycle_safety(timestamptz) | PVP孤立Seasonの修復を保持。Raid孤立Season修復と境界書換えを除去 |

advance_all_ranking_seasonsは既存呼出しを保持し、RAID側は上記関数でnullとなる。旧finalize_raid_battleからのRAID advance呼出しも同じく無処理。最新finalize_expired_raid_instance（254）は既に順位計算なしで日次CLEAR報酬のみ。旧184にあったInstance順位計算は現行定義では実行されない。apply_raid_rewards/finalize_raid_instanceという関数名はRepository migrationに存在しない。

## 保持

既存Damage・進捗・Room参加者・報酬台帳・通知・Present・Season履歴を削除しない。過去に生成済みの日次監査はALREADY_FINALIZEDとして元件数を返す。発行済みPresentの受取経路は変更しない。順位以外の旧Raid報酬と新Room救援報酬は変更しない。未発行の旧順位報酬は遡及生成しない。

既存関数はCREATE OR REPLACEでACLを維持。本人専用readだけPUBLIC/anonをrevokeしauthenticated/service_roleへexecuteを許可する。

## 検証

子Cの限定PGlite実SQL検証と親レビューへ引き渡す。実DB/Cron・複数接続・ブラウザ実機の成立をこの文書では主張しない。

## 反映順と残件

新しい本人貢献readを使う画面より先にSQL261を適用する。261は250〜260導入済みスキーマを前提にする。この作業でDB適用・Deploy・Room運用flag変更は実施していない。討伐報酬・設定値投入・実DB/実機は別工程。
