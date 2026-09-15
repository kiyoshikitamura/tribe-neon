# Production-base Battle TOP integration 2026-09-09

Base: 3bdefedd9b49fbbadac5ca2bbc832fe10c1b9716, verified live at dpl_73A7dsAKVLxBgFVuM9H4mLW6F3E6, codex/iphone14-presentation-hotfix-20260908. New branch created directly from this exact commit.
Source: 0711ca4cb9a31fefb3e6c4e1d4386a498bb58476. Only PvpTab.tsx/css and pvp/BattleTopPresentation.tsx/css extracted. Relevant E2E/fixture reused. Explicit follow-up requirements added only within TOP: unranked label 16px, Yokohama night / Koharu entry visual.
No conflicts. Tutorial/Gacha/Character/Battle/Result/Raid runtime/Formula/DB/Economy remain identical to 3bdefed. Former emergency fca0afc and its Quest CASH changes excluded.
Gate: live SHA still 3bdefed; product diff exactly four TOP files; critical checks PASS. New production environment build, Mock=false, QA=false. Real www smoke after deployment.
