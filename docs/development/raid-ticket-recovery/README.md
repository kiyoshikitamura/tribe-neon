# RP0 ticket recovery

RP0 and no free entry: 出撃準備 checks server resources and ticket inventory, then opens レイドチケットで回復しますか？ with 回復する / 閉じる. One ticket restores one RP using the existing atomic RPC. No ticket disables recovery. Success updates shared Header resources; press 出撃準備 again to continue. Already charged pending battles resume before this gate. No automatic battle start or automatic retry of ticket use.

Validation: actual RaidTab handler/props tests with mocked transport (6 cases PASS); typecheck PASS; previous actual result/Header browser regression 18 cases PASS. This is not a real-account ticket-consumption acceptance result.

No SQL, Edge, Cron, reward, HP, formation or multiplier changes. Production frontend build/readback recorded separately after deployment.

Production: e4edeadefac27371a532740b42189cc166703a5e; dpl_9imw6iSPPMz1jk25tu6oCRUygm5K; https://www.tribe-neon.com/ . Vercel Production build READY; compiled frontend feature and Auth settings connection PASS; only www/apex aliases changed, KPI and 73 other aliases preserved. Real-account RP0 ticket use remains user acceptance; no real inventory was consumed in tests.
