# POWER／GUILD_POWER 次Season接続候補

## Authority棚卸し

`specs/TRIBE_NEON_Season_Ranking_Reward_Master_20260914.md` Scopeは「正式OPEN後のMonthly Season終了報酬」、RuntimeもMonthly終了を定義している。毎月継続を新しい未決事項とする必要はなかった。

`specs/spec_ranking.md` と `specs/ranking_power_p0_foundation.md` は期間をserver `ranking_seasons` に明示し、clientの暦月推測を禁止する。候補もserverで開始／終了を保存する。Preview実関数 `ranking_period_bounds('PVP',now)` にJST暦月境界が既に実装されているため、時刻計算だけを再利用する。

現 `advance_ranking_season` はPVP／RAIDのみで、RAIDは退役no-op。`advance_all_ranking_seasons` もPOWERを扱わず、`reset_seasonal_power_rankings` はstub。新しい総合力resetは行わない。

## 実装

CLI生成: `supabase/migrations/20260915000741_monthly_power_rollover_definition.sql`

定義だけのMigration。既存Migration再適用・関数の実呼出し・Season切替・cron変更は含まない。

新service_role専用 `advance_monthly_power_seasons_v1()`:

- 初回正式OPENは既存専用startのみ。登録済みSeasonがなければNOT_STARTEDで終了。
- 登録済みPOWER／GUILD_POWERの最新2件だけを起点とし、境界・資格・version不一致を拒否。
- 終了前のACTIVEはno-op。
- 直前終了が現JST月初と一致する場合のみ、既存終了runnerによるfinalize→両カテゴリCLOSED→同じトランザクションで次月開始。
- 月を丸ごと跨いだ未処理は「過去境界の監査が必要」として拒否し、現在総合力で欠けた月を捏造しない。
- 次Seasonはserver暦月境界、直前の承認Master version／連続7日資格を継承。Item数量・名誉ID・Master自体は変更しない。
- 次Season登録失敗も、先行した旧Season報酬・状態更新ごとrollback。
- 再送は作成済みACTIVEを返す。閉鎖済み行の復活、未登録PREOPENの採用、PvPのadvance／reset呼出しをしない。

## Preview試験

Migrationの末尾COMMITを外し `tests/db/monthly_power_rollover_preview_rollback.sql` と連結、全ROLLBACKでPASS。

未開始、2カテゴリ境界不一致、月次境界逸脱拒否、旧報酬→次Season作成、次Guild行INSERT故意失敗の全rollback、version／資格継承、再送、他カテゴリ全行保持、client ACLを確認。

FixtureのためPREOPEN行の状態・期間をtransaction内だけで変更して対象外に置いた。PREOPEN本来の運用finalizeを試験したものではない。永続Season変更なし。実時計境界・複数session競合・実機受入は別工程。

## 接続点

既存inactive job `ranking-power-monthly-finalize-v1` をそのまま使用し、commandだけを旧 `select public.finalize_due_monthly_power_seasons_v1();` から `select public.advance_monthly_power_seasons_v1();` へ変更する。5分周期／inactiveを保持。jobを増やさない。

`supabase/operations/20260915_monthly_power_runner_preview_candidate.sql` は旧／新の期待commandを持つinactive jobだけを受理し、新commandへ接続するよう更新済み。既定ROLLBACK。親が新定義の適用後に内容を確認して実操作する。

PvPの既存 `ranking-pvp-monthly-jst` は保持し、新jobからPvPの終了・次Season生成を呼ばない。

## ステータス

担当引渡し時点: 新定義未適用、job差替え未実行。親が定義だけをPreviewに適用しinactive commandを接続する予定。実正式OPEN日時・操作停止日時・Mission Claim起算は運用入力として残る。第2Season自動生成は今回候補に実装済みで、ユーザー未決扱いから除外する。

## 親側適用済み

Repository 20260915000741 → Preview実version **20260915000930**。定義のみ適用済み・再適用禁止。既存jobのcommandをadvance_monthly_power_seasons_v1へ変更しinactive維持。現データでNOT_STARTEDを確認しROLLBACK。正式OPENや実報酬付与は行っていない。
