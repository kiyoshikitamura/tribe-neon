# Preparation validation record

This record describes this unified candidate; it is not Production deployment or human acceptance.

## Integration tests

- Mock build (`NEXT_PUBLIC_USE_MOCK_DB=true`, `NEXT_PUBLIC_APP_ENV=development`, `next build --webpack`) PASS; `tsc --noEmit` PASS.
- Street presentation 9, useBattle/Room 27, profile request races 10, Raid top 17, Raid browser 32, Raid detail 20, initial equipment bootstrap 8: 123 tests PASS. Character contract PASS.
- Browser 12 PASS: Character 8 (375/390/430px, low height, Party draft), normal Battle 3, Tutorial impact/result/continuation 1.
- `integration/preservation.json`: exact accepted Raid/Character/Card/hit implementation checks all PASS.
- `detail-run-tests.mjs.log` / `detail-rerun.log` contain initial fixture ENOENT failure; no product assertion was relaxed. After verifying the old fixture producer and display migration were unchanged, reusable artifact passed. C then started native PG17 and regenerated actual-display.json using the existing producer (4 groups PASS); `detail-fresh-pg.log` is final 20/20 against freshly generated fixture. Earlier logs retained for diagnosis.
- Tutorial screenshots and trace in integration/ are new candidate Mock evidence, not copied prior PASS and not real HTTP authentication.
- Older Character-only report describes the earlier64c7 candidate; this folder supersedes its statement that later Raid was not integrated. The new candidate preserves3ec0450.

## Constraints

No Production SQL writes, remote deploy, alias change, QA-user creation or account email sent. Local isolated database fixtures only. No paid actions. Local source commit will contain the accepted merge, audit, Bundle and verification scripts. Production source must be freshly built; local Mock .next is not a release artifact.

Same Production-reconstructed + immutable Bundle database lifecycle: 13 groups PASS_SQL_SYNTHETIC_RESULT, 3 replay IDs with resend stability, 2 issued/claimed Present IDs and duplicate claim rejection. Result is synthetic service input, not actual Edge execution. See rehearsal/same-bundle-lifecycle.json.
