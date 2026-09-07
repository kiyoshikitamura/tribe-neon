import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import {
  consumeRememberedOAuthReturnTo,
  getOAuthCallbackUrl,
  getOAuthReturnUrl,
  rememberOAuthReturnTo,
} from "../src/utils/browserDetection.ts";

const previewOrigin = "https://tribe-neon-mobile-preview.vercel.app";
const productionOrigin = "https://tirbe-neon.vercel.app";
const productionSupabaseRef = "ktpolnkyyfkowxdmijww";
const branchPreviewOrigin = "https://tribe-neon-git-codex-human-ng-remediati-49702c-kiyoshi-kitamura.vercel.app";
const kpiOrigins = ["https://kpi.tribe-neon.com", "https://kpi-preview.tribe-neon.com"];

for (const origin of [previewOrigin, branchPreviewOrigin, productionOrigin, ...kpiOrigins, "http://localhost:3000"]) {
  const callback = getOAuthCallbackUrl(`${origin}/?invite=ORIGIN-GATE`);
  assert.equal(callback, `${origin}/auth/callback?invite=ORIGIN-GATE`);
  assert.equal(getOAuthReturnUrl(`${callback}&code=redacted`), `${origin}/?invite=ORIGIN-GATE`);
  assert.equal(
    getOAuthReturnUrl(`${origin}/auth/callback?return_to=%2Fadmin%2Fkpi&code=redacted`),
    `${origin}/admin/kpi`,
  );
  for (const unsafeReturnTo of [
    "https://example.com/admin/kpi",
    "//example.com/admin/kpi",
    "/\\example.com/admin/kpi",
  ]) {
    const unsafeCallback = new URL("/auth/callback", origin);
    unsafeCallback.searchParams.set("return_to", unsafeReturnTo);
    unsafeCallback.searchParams.set("code", "redacted");
    assert.equal(getOAuthReturnUrl(unsafeCallback.toString()), `${origin}/`);
  }
}

const previewConfigSource = await readFile("scripts/configure_mobile_preview_auth.mjs", "utf8");
assert.match(previewConfigSource, /https:\/\/tribe-neon-\*-kiyoshi-kitamura\.vercel\.app\/\*\*/);

const sourceFiles = [
  "src/app/context/hooks/useAuth.ts",
  "src/app/components/TutorialAuthentication.tsx",
  "src/app/auth/callback/page.tsx",
];
for (const file of sourceFiles) {
  const source = await readFile(file, "utf8");
  assert.doesNotMatch(source, /tirbe-neon\.vercel\.app/);
  assert.doesNotMatch(source, /VERCEL_PROJECT_PRODUCTION_URL|NEXT_PUBLIC_SITE_URL|NEXT_PUBLIC_APP_URL/);
}

const originalWindow = globalThis.window;
const storedValues = new Map();
globalThis.window = {
  location: { origin: previewOrigin },
  localStorage: {
    getItem: (key) => storedValues.get(key) ?? null,
    removeItem: (key) => storedValues.delete(key),
    setItem: (key, value) => storedValues.set(key, value),
  },
};
rememberOAuthReturnTo("/admin/kpi");
assert.equal(consumeRememberedOAuthReturnTo(), "/admin/kpi");
assert.equal(consumeRememberedOAuthReturnTo(), null);
rememberOAuthReturnTo("https://example.com/admin/kpi");
assert.equal(consumeRememberedOAuthReturnTo(), null);
globalThis.window = originalWindow;

const callbackSource = await readFile("src/app/auth/callback/page.tsx", "utf8");
assert.doesNotMatch(
  callbackSource,
  /onAuthStateChange/,
  "OAuth callback must not register an auth listener while Supabase is initializing",
);
assert.match(callbackSource, /AUTH_CALLBACK_TIMEOUT_MS\s*=\s*15_000/);
assert.match(callbackSource, /Googleログインの確認がタイムアウトしました/);
assert.match(callbackSource, /consumeRememberedOAuthReturnTo/);

const kpiDashboardSource = await readFile("src/app/admin/kpi/KpiDashboard.tsx", "utf8");
assert.doesNotMatch(kpiDashboardSource, /signInWithPassword/);
assert.doesNotMatch(kpiDashboardSource, /signInWithOAuth/);

const bundleDirectory = process.env.OAUTH_BUNDLE_DIR?.trim();
if (bundleDirectory) {
  const files = [];
  const visit = async (directory) => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(fullPath);
      else if (/\.(?:js|html|json)$/.test(entry.name)) files.push(fullPath);
    }
  };
  await visit(bundleDirectory);
  const bundle = (await Promise.all(files.map((file) => readFile(file, "utf8")))).join("\n");
  if (process.env.NEXT_PUBLIC_APP_ENV === "preview") {
    assert.doesNotMatch(bundle, new RegExp(productionSupabaseRef));
    assert.doesNotMatch(bundle, /https:\/\/tirbe-neon\.vercel\.app\/auth\/callback/);
  }
}

console.log(JSON.stringify({
  previewCallback: `${previewOrigin}/auth/callback`,
  productionCallback: `${productionOrigin}/auth/callback`,
  runtimeOriginPreserved: true,
  hardcodedProductionOAuthOrigin: false,
}));
