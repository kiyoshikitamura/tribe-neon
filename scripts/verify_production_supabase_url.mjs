import assert from "node:assert/strict";
import { getSupabaseProjectRef, isValidSupabaseUrl } from "../src/utils/supabaseUrl.ts";

const productionRef = "ktpolnkyyfkowxdmijww";
const previewRef = "sufvuqdnqohpfzkwxohq";
const productionUrls = [
  "https://api.tribe-neon.com",
  `https://${productionRef}.supabase.co`,
];

for (const url of productionUrls) {
  assert.equal(isValidSupabaseUrl(url, "production"), true, `${url} must be allowed in Production`);
  assert.equal(isValidSupabaseUrl(`${url}/`, "production"), true, `${url}/ must be allowed in Production`);
  assert.equal(getSupabaseProjectRef(url), productionRef, `${url} must resolve to the Production project ref`);
}

const rejectedProductionUrls = [
  "http://api.tribe-neon.com",
  "https://api.tribe-neon.com.evil.example",
  "https://www.tribe-neon.com",
  `https://${previewRef}.supabase.co`,
  "https://api.tribe-neon.com/path",
  "https://api.tribe-neon.com?query=1",
  "https://api.tribe-neon.com#hash",
  "https://api.tribe-neon.com:443",
  "https://api.tribe-neon.com:8443",
  "https://user@api.tribe-neon.com",
  "https://api.tribe-neon.com//",
];

for (const url of rejectedProductionUrls) {
  assert.equal(isValidSupabaseUrl(url, "production"), false, `${url} must be rejected in Production`);
}

assert.equal(isValidSupabaseUrl(`https://${previewRef}.supabase.co`, "preview"), true);
assert.equal(isValidSupabaseUrl("https://api.tribe-neon.com", "preview"), false);
assert.equal(getSupabaseProjectRef(`https://${previewRef}.supabase.co`), previewRef);

console.log(JSON.stringify({
  acceptedProductionOrigins: productionUrls,
  rejectedProductionUrlCount: rejectedProductionUrls.length,
  customDomainProjectRef: productionRef,
}));
