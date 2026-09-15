# GAME03 short Tutorial / Character setup — 2026-09-10

## Read-only audit

- Production `tutorial_progress` retains the canonical steps and triggers. At audit time the removed-step populations were `AUTO_FORMATION=51`, `DISPATCH=2`, `FREE_INSTANT=1`; `TUTORIAL_BATTLE=8`. A UI-only deletion would strand real resumes.
- `WORLD_INTRO` was presentation-only after `initialize_current_player`; profile creation and initial Equipment receipt are committed in the initialization RPC and remain intact.
- The accepted Tutorial formation RPC combined Growth validation, Party, PvP defense, Leader and starter Skill. The shortened flow therefore bypasses its UI contract while preserving Party/PvP/Leader state through existing authorities.
- `save_recommended_main_formation` is the accepted Party authority. The accepted Equipment ordering is exclusive compatibility, HP+ATK+DEF contribution, level, limit break and rarity.
- `apply_recommended_main_loadout` also changes Skills and requires exactly five Characters plus at least one Skill and Equipment, so it could not be called directly by the new Party+Equipment-only dialog.
- Tutorial Complete facts are trigger-owned by transitions to `tutorial_progress.step_id='COMPLETE'`; those triggers and KPI definitions are unchanged.

## DB decision

`SAFE_ADDITIVE`.

No table or column is added. Two lifetime milestones in the existing `user_funnel_milestones` authority distinguish new-flow eligibility and one-time consumption. Existing completed users are not backfilled. Public authenticated RPCs verify `auth.uid()` and the shared Equipment allocator is private and non-executable by client roles.

## Flow

- New setup opens directly at name entry and initializes at `FREE_GACHA`.
- After the tutorial gacha, `resume_short_tutorial()` atomically saves the recommended Party/PvP deck, creates and instantly prepares the existing tutorial Quest encounter, and returns `TUTORIAL_BATTLE`.
- Legacy `WORLD_INTRO`, `AUTO_FORMATION`, `DISPATCH`, `FREE_INSTANT`, and `RULE_GUIDE` resumes are idempotently advanced to the nearest retained step.
- Tutorial Battle advances directly to canonical `COMPLETE`, retaining existing completion/funnel/KPI triggers.
- New-flow completion alone creates dialog eligibility. `AUTO_SETUP` and `LATER` both consume the dialog exactly once. `AUTO_SETUP` atomically saves Party, assigns compatible Equipment, refreshes canonical power and records `first_main_loadout`; `LATER` does not pretend a loadout occurred.

## Validation

- `npm run typecheck`: PASS
- `npm run lint`: PASS (existing warnings only, zero errors)
- `NEXT_PUBLIC_USE_MOCK_DB=true npm run build`: PASS
- `npm run verify:game03-short-tutorial-character-setup`: PASS
- Existing post-tutorial loadout regression: PASS
- Focused Playwright: new setup/legacy resume PASS; Character dialog Primary/Later at 390x844 and Primary at 412x915 PASS
- Preview migration rollback parse: PASS
- Preview real RPC: fresh short flow, canonical completion, eligibility, Primary/Later, duplicate idempotency, Character shortage, Equipment shortage and actual Equipment assignment PASS
- Preview Security/Performance advisors: zero findings
- Temporary Preview QA identities and their public rows were removed and verified absent.

Production DB and Production deployment are intentionally unchanged. The migration and application build are ready for the normal Production release gate.
