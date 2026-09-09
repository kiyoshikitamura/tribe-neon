# Task contract

TASK ID: CARD-VISUAL-INTEGRATION-GATE1
OWNER: main Codex
PRIORITY: P0 preservation
STATUS: VALIDATED FOR LOCAL INTEGRATION COMMIT
SCOPE: Raid-based selective Character HOME/Equipment/Party integration, preservation comparison and tests
DO NOT TOUCH: public assets, DB, Master, Gacha, Battle, Raid product implementation, Production deployment
DEPENDENCIES: frozen Raid 2d2d2b1563e92f1471f9c86fa8a7cc59040ec726, Character 91f7a7d937fbbf427bfbaada0547f38c244e9a11, Production 550c02225cbecb6ba6f174ee3fb952bcaae2f6dd
ACCEPTANCE CRITERIA: three-way and adopted hunks documented; requested UX retained; no unrelated runtime diff; typecheck/build/focused tests pass
VALIDATION: Git blob comparison, draft unit tests, Character/Gacha/Battle/Raid/Tutorial regression
EXPECTED OUTPUT: local integration commit and Gate 1 evidence
BRANCH: codex/card-visual-integration-base-20260909
COMMIT: containing integration commit, single parent Raid 2d2d2b1
BLOCKERS: none for Gate 1; two pre-existing Tutorial Battle-selector test failures reproduced on clean Raid, Human Visual Acceptance remains pending before release
