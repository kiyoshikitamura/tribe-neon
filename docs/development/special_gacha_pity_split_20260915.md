# Special Gacha Preview: banner-scoped pity

- Scope: Preview `sufvuqdnqohpfzkwxohq`, branch `codex/formal-open-integration-preview-20260914`; base `eb0ca07`.
- New migration applied to Preview: `20260915113959_special_gacha_pity_per_banner.sql`. Do not reapply. Production not applied.
- Four point buckets: justice/evil, order/chaos, skill, equipment. Existing ticket types remain unchanged (character ticket works with either character banner).
- Test1 legacy 51 points migrated from completed draw history: 10 / 0 / 21 / 20. No points duplicated or discarded. Legacy common bucket retained at zero. Other existing common balances reconciled by the same guard.
- Migration rejects unreconciled histories or legacy exchange receipts and refuses a second application; it briefly locks relevant tables to prevent concurrent spending while moving balances.
- Draw price, probability, pool, Normal/Tutorial behavior and saved replay payloads are retained. New accrual uses only the selected banner.
- Four-argument exchange validates the selected banner's SSR pool before debiting 100 points. Old three-argument exchange requires reload. Private helper is not executable by anon/authenticated.
- `get_special_gacha_catalog_v2` supplies banner-specific points; UI fails closed against the legacy contract. Each banner has its own SSR exchange and restricted reward list.
- Japanese CTA/description updated as requested; special draw payment text uses ダイヤ.

## Verification

- TypeScript: PASS.
- Real Preview SQL, rollback-only: four banners' ticket/diamond ten-pulls, isolated accrual, same-request draw replay, 100-point exchange/replay, insufficient-point rejection, foreign-banner reward rejection: PASS.
- Test fixture changes were rolled back; no test pull consumed Test1 resources.
- Post-migration read: Test1 10 / 0 / 21 / 20, legacy common 0.
- Privileges: authenticated cannot execute internal helper, anon cannot exchange, authenticated can use validated exchange RPC.
- Security advisor inspected: authenticated SECURITY DEFINER catalog warning is intentional; query uses auth.uid() for owned points, fixed search_path and fixed public catalog. Unrelated existing advisories were not changed.
- No Production, Stripe, Google replacement flags, shop UI or unrelated operating state changes.

The rollback SQL is intended for the named Preview test account only, not Production. iPhone visual/animation acceptance remains a separate manual check.
