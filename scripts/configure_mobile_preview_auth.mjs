const PREVIEW_REF = "sufvuqdnqohpfzkwxohq";
const MOBILE_PREVIEW_URL = "https://tribe-neon-mobile-preview.vercel.app";
const VERCEL_BRANCH_PREVIEW_PATTERN = "https://tribe-neon-*-kiyoshi-kitamura.vercel.app/**";
const PRODUCTION_URL = "https://tirbe-neon.vercel.app";

if (typeof process.loadEnvFile === "function") {
  try {
    process.loadEnvFile(".env.preview.local");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

const token = process.env.SUPABASE_ACCESS_TOKEN?.trim();
const expectedRef = process.env.SUPABASE_EXPECTED_PROJECT_REF?.trim();
const previewRef = process.env.SUPABASE_PREVIEW_PROJECT_REF?.trim();

if (!token) throw new Error("SUPABASE_ACCESS_TOKEN is required.");
if (expectedRef !== PREVIEW_REF || previewRef !== PREVIEW_REF) {
  throw new Error("Ref guard rejected the Preview Auth configuration update.");
}

const endpoint = `https://api.supabase.com/v1/projects/${PREVIEW_REF}/config/auth`;
const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
const currentResponse = await fetch(endpoint, { headers });
if (!currentResponse.ok) {
  throw new Error(`Could not read Preview Auth config: ${currentResponse.status} ${await currentResponse.text()}`);
}

const current = await currentResponse.json();
const allowList = new Set(
  String(current.uri_allow_list || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
);
allowList.add(`${MOBILE_PREVIEW_URL}/**`);
allowList.add(VERCEL_BRANCH_PREVIEW_PATTERN);
allowList.add("http://localhost:3000/**");
allowList.add("http://localhost:3100/**");
allowList.delete(`${PRODUCTION_URL}/**`);

const updateResponse = await fetch(endpoint, {
  method: "PATCH",
  headers,
  body: JSON.stringify({
    site_url: MOBILE_PREVIEW_URL,
    uri_allow_list: [...allowList].join(","),
  }),
});
if (!updateResponse.ok) {
  throw new Error(`Could not update Preview Auth config: ${updateResponse.status} ${await updateResponse.text()}`);
}

const updated = await updateResponse.json();
const updatedAllowList = String(updated.uri_allow_list || "").split(",").map((value) => value.trim());
if (
  updated.site_url !== MOBILE_PREVIEW_URL
  || !updatedAllowList.includes(`${MOBILE_PREVIEW_URL}/**`)
  || !updatedAllowList.includes(VERCEL_BRANCH_PREVIEW_PATTERN)
) {
  throw new Error("Preview Auth config verification failed after update.");
}
if (updatedAllowList.includes(`${PRODUCTION_URL}/**`)) {
  throw new Error("Preview Auth config must not allow the Production application origin.");
}

console.log(JSON.stringify({
  projectRef: PREVIEW_REF,
  siteUrl: updated.site_url,
  mobileRedirectAllowed: true,
  branchPreviewRedirectAllowed: true,
  productionRedirectAllowed: false,
  localhostRedirectsRetained: true,
}));
