# CARD-VISUAL-GATE2

OWNER: main Codex
PRIORITY: P0 preservation / visual integration
STATUS: IN PROGRESS
SCOPE: exact 26 normalized PNG exports; scoped static rarity CSS cleanup; item Limit Break text; mobile/browser regression; dedicated Preview
DO NOT TOUCH: DB, Master, resolver mappings, economic/gameplay logic, CharacterGachaPresentation, legacy Reveal PNG/CSS, public/frames, Production deployment
DEPENDENCIES: edb560c1b30bbbbd035622b5e35fff5f32eab7bf; normalized production manifest in sibling card-visual-system
ACCEPTANCE CRITERIA: all 26 hashes match authority; item pairs identical; no frame distortion; +1..+10 item text; preserve accepted UX; Preview/mobile validation
VALIDATION: asset integrity, source allowlist, build/typecheck, focused regression, 390x844 and 412x915 real screen screenshots
EXPECTED OUTPUT: implementation commit, Preview ID/URL/SHA, evidence and known failures
BRANCH: codex/card-visual-integration-base-20260909
COMMIT: pending
BLOCKERS: none at start; two known Tutorial selector failures preserved from Gate 1
