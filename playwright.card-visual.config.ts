import { defineConfig } from '@playwright/test';
import base from './playwright.config';

// Room UI is enabled in the integration Preview. Normal local Character/Gacha
// fixtures have no outstanding Raid battle; use the existing explicit Mock
// projection instead of changing the real recovery handler or dismissing errors.
export default defineConfig({
 ...base,
 use: {
  ...base.use,
  storageState: {
   cookies: [],
   origins: [{origin:`http://127.0.0.1:${process.env.PLAYWRIGHT_PORT || '3100'}`,localStorage:[{name:'mock_rpc_fixture:empty_raid_recoveries',value:'true'}]}],
  },
 },
});
