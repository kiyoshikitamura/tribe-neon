TASK ID: RAID-APPROVED-A
OWNER: top worker
PRIORITY: P1
STATUS: VALIDATED
SCOPE: RaidTop.tsx / RaidTop.css only. Approved four sections, compact joined row enemy/challenger/HP/time Continue, rescues requestor/enemy/state/participants, daily2 self challenge, browse auxiliary. Text 挑戦者：あなた／名前, ほかの挑戦者に加勢する. Existing types/data/callbacks/unknown logic retained. Use shared UserAvatar now imported by parent; may import it with src of resolved leader. No renderer metadata edits.
DO NOT TOUCH: shared files, API, DB, battle/rewards, external connections, deploy, commit
DEPENDENCIES: base 065e77a; shared UserAvatar from 894bcb6 imported by parent
ACCEPTANCE CRITERIA: 390/600px readable, 44px actions, no inferred owner/membership, preserve rescueId, daily choice callback only
VALIDATION: parent tests/screens
EXPECTED OUTPUT: two files and brief rationale
BRANCH: codex/raid-approved-top-20260909
COMMIT: parent only
BLOCKERS: notify parent
