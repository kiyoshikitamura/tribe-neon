# POWER Season期間表示の修正候補

状態：Preview適用済み。実RPC 3項目PASS、検証はROLLBACK。実画面再確認・運営期間FIXは未完了。

## 確認事実（Preview READ ONLY）

- POWERは2026-08-01 00:00〜2026-09-01 00:00 JSTの行がACTIVE。
- `get_active_ranking_seasons`は時刻が期間内のACTIVEだけ返し、当該POWERを除外。
- `get_public_power_rankings(false,100,0)`は現在総合力を返し、season期間で絞らない。
- `get_ranking_self_context`のSeason日時はnull。この組合せにより、現在総合力一覧と「集計期間情報なし」が同居した。
- `ranking_period_bounds`はPVP/RAIDのみ。`advance_ranking_season`もPOWERを対象としない。単なる月次Cron実行漏れと断定できない。
- `specs/spec_ranking.md`および`specs/ranking_power_p0_foundation.md`は明示されたサーバー期間を正とし、クライアントの暦月推測を禁止。

## 候補差分

`20260912164556_ranking_power_period_context.sql`で既存self_contextのPOWER Season返却へ実在ACTIVE行のseason_id/starts_at/ends_at/statusを追加する。期間外でも値を隠さない。CLOSED行は現在総合力の期間に流用しない。
既存RankingTabはactive一覧に該当なしならself_contextを利用でき、既存`rankingPeriodText`の「集計期間終了・状態確認中」分岐が成立する。UIコード変更不要。

順位、自己順位、周辺順位、Daily期間、PVP、プレオープンGuild契約、報酬、season行、購入商品、期限は変更しない。既存関数の認証チェックと権限を維持する。

## 検証

- `scripts/verify_ranking_context_audit.mjs`：PASS。期間外ACTIVE実日時、CLOSED状態保持、取得失敗優先、Daily表示を追加。
- `tests/db/ranking-power-period-context.sql`：Preview実行済み、3項目PASS。全fixtureをROLLBACK。
- Preview実画面：候補適用後の再確認が必要。

## 残る運営判断

情報欠落の修正と、POWER Seasonの状態・運営期間の整合は別。期間を今月末まで延長したり、終了確定・新Season作成・報酬配布は行わない。
現在の総合力を常時比較する契約と、POWER Season開催期間・終了時処理との整合が未FIXであるため、この修正のみでランキング全体をPASSとは判定しない。
