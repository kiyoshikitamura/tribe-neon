# Tutorial completion UNION — 2026-09-07

The daily dashboard previously replaced the entire legacy cohort with FIRST_MYPAGE_ACCESS_CONFIRMED once any such fact existed. The transition-period rule now unions valid kpi_tutorial_completion_facts, tutorial_complete user_funnel_milestones, and MyPage confirmations through the existing user/subject relationship. A user counts once. The earliest valid evidence remains the completion timestamp, so a later MyPage observation does not remove prior Guild eligibility or move the completion into another reporting period.

Daily, Tutorial summary/validation, and completion-based downstream cohorts use the same reader. D1-D5, Community, Mission, Gameplay, writers, migrations, and production data are unchanged. The UI labels the aggregate 統合計測（既存完了＋MyPage・重複除外） and labels the separate MyPage step as MyPage到達確認.

Validation: required 5 cases; milestone-only; empty; exclusion; user aliases; earliest valid evidence; source failure; >1000 rows; reporting boundary. TypeScript, changed-file ESLint, optimized build, existing KPI contracts, and mobile/desktop UI tests passed.

Read-only Production check before deployment: fixed original 74 subjects retain 38 completions; MyPage 2/2 overlap. Current 80 subjects have 41 completions; MyPage 3/3 overlap. Daily Guild is 6/41. Independent SQL and application reader match. D1-D5 and Community match the pre-change implementation after ignoring response generation timestamps.

Deployment targets the existing KPI-only branch/domain. No Game deployment, migration, backfill, data repair, or refresh is required. Authenticated Production UI acceptance is owned by the user, per their instruction. Deployment record and final read-only values are recorded in the task release report.

Rollback: restore the previous KPI deployment dpl_Du75KWMwUmBCSLxKZ314ewvE6fdT alias, or revert this code commit on the KPI branch. No DB rollback is needed. Reverting reintroduces the known aggregation error and is for emergency rollback only.

Separate issue: fast-input Tutorial Growth preparation/formation race remains tracked in P1_INVESTIGATION_REPORT.md in the investigation workspace; no Gameplay changes are included here. It requires its own investigation/fix task.
