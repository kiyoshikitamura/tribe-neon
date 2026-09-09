# Raid UI cleanup — local only

Removed owner identity block from participation detail; four detail entrances with rescue dialog using existing request panel; removed 24-hour copy; active-list and enemy-selection headings use shared red-accent SectionHeader; refresh next to expert; removed list challenge button, leader skills summary, selection instruction. Top rescue displays one random entry, stable while browsing until candidate list changes or remount. Multiple participation remains allowed. Existing gameplay/RP/result/recovery behavior retained.

Verification: npm run typecheck PASS; npm run build PASS (local Mock environment); scripts/raid-room/verify-ui-cleanup.mjs PASS on actual UI at 390x844, including rescue open/close and inventory-independent mock requests. Screenshots captured after animations finish. No live rescue publication, DB changes, or deploy. Production unchanged.
