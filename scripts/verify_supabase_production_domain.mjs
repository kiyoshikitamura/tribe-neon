import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

// Client生成前の実際の環境検証を、通信せずに実行する。
const source = readFileSync(new URL("../src/utils/supabase.ts", import.meta.url), "utf8");
const guards = source.slice(source.indexOf("const appEnvironment"), source.indexOf("export const usingMockSupabase"));
const run = (url, environment = "production", extra = {}) => runInNewContext(guards, {
  process: { env: { NEXT_PUBLIC_APP_ENV: environment, NEXT_PUBLIC_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-publishable-key", ...extra } },
});
for (const url of ["https://api.tribe-neon.com", "https://api.tribe-neon.com/", "https://ktpolnkyyfkowxdmijww.supabase.co"]) {
  assert.doesNotThrow(() => run(url));
}
for (const url of ["http://api.tribe-neon.com", "https://api.tribe-neon.com.evil.example", "https://api.tribe-neon.com/path", "https://unrelated.example", "https://api.tribe-neon.com@evil.example"]) {
  assert.throws(() => run(url), /not a valid Supabase project URL/);
}
assert.throws(() => run("https://api.tribe-neon.com", "preview"), /not a valid Supabase project URL/);
assert.throws(() => run("https://api.tribe-neon.com", "production", { NEXT_PUBLIC_USE_MOCK_DB: "true" }), /must not be enabled/);
assert.throws(() => run("https://api.tribe-neon.com", "production", { NEXT_PUBLIC_SUPABASE_ANON_KEY: "dummy-key" }), /dummy/);
console.log("Production custom domain and URL rejection guards: PASS");
