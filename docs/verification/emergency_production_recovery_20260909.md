# Emergency Production recovery 2026-09-09

## Base and scope
- Rolled-back live deployment: b722f6e6d60c89a58c4cdd9cb945ede0da265850 / dpl_6TVTedpFhixiwvbWJd1fktAtRXy9. Main auto-deployment replaced the accepted presentation deployment.
- Accepted base: 502c41f22d66a1d3df74db490e2a7284b925326b, origin/codex/iphone14-presentation-hotfix-20260908.
- Previously shipped accepted deployment: 3bdefedd9b49fbbadac5ca2bbc832fe10c1b9716 / dpl_73A7dsAKVLxBgFVuM9H4mLW6F3E6. Product source identical to eff2f35491efb078cf6f6495dfadadc97f071063.
- Battle TOP final product commit: 0711ca4cb9a31fefb3e6c4e1d4386a498bb58476. Continued from integrated 2d3b799, not old main.

## Accepted presentation audit
All rows below are included in the current TOP base. Rolled-back Production lacks the latest versions. Accepted branch is the iPhone14 presentation hotfix branch above.

| Area | Accepted implementation / shipped checkpoint |
| --- | --- |
| Ready and compact mobile CTA | eff2f35 / shipped 3bdefed |
| Normal / Skill / Impact / Damage / HP timing / Defeat / tempo | 17fa2ce integration, eff2f35 final mobile polish / shipped 3bdefed |
| Result background / MVP / animation / rewards / return | 17fa2ce integration, eff2f35 final mobile polish / shipped 3bdefed |
| Tutorial / Gacha / Home | 502c41f product tree, identical to shipped 3bdefed |
| Raid | Existing shipped canonical Raid, latest RaidTab change 80ebca1b32b83eb1a9277c8386f876a9dd9b6b2f |

## Conflict decisions
No textual merge conflict. Semantic conflict: accepted base contains old Quest CASH fallback. Preserve the already-live b722f6e quest JSON byte-for-byte and its three GameContext query/fallback hunks. This retains current Production Economy; no reward rebalance. Accepted Supabase URL validator already supports the current custom Production API domain.

Unshipped parallel Raid 4e50a45 requires isolated database / aggregate API work and has not completed Preview approval. It is excluded, along with new Character polish. No migration, RPC, Edge or DB application performed. No Battle Formula, RNG or reward authority edits. Existing accepted historical migration files are not executed by this frontend recovery.

## Verification
TypeScript PASS; lint 0 errors (existing warnings); production build PASS. Battle presentation / MVP / PvP R8 contracts PASS. Critical browser and real Preview journey results are recorded separately under scratch; deployment only after critical paths pass.
