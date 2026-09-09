import assert from "node:assert/strict";

const EXPECTED_ORIGIN = "https://www.tribe-neon.com";
const EXPECTED_TITLE = "TRIBE NEON｜現代東京を舞台にしたブラウザRPG";
const EXPECTED_DESCRIPTION =
  "現代東京を舞台に、キャラクターを育成し、仲間とギルドで競うブラウザRPG『TRIBE NEON』。アプリのダウンロード不要でプレイできます。";

function option(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const baseUrl = option("--base-url", "http://127.0.0.1:3000");
const mode = option("--mode", "preview");
assert.match(mode, /^(preview|production)$/, "--mode must be preview or production");

function decodeHtml(value) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#x27;", "'")
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

function attributes(tag) {
  return Object.fromEntries(
    [...tag.matchAll(/([:\w-]+)=["']([^"']*)["']/g)].map((match) => [
      match[1],
      decodeHtml(match[2]),
    ]),
  );
}

function metaContent(html, key, value) {
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attrs = attributes(match[0]);
    if (attrs[key] === value) return attrs.content;
  }
  return undefined;
}

function linkHref(html, rel) {
  for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
    const attrs = attributes(match[0]);
    if (attrs.rel === rel) return attrs.href;
  }
  return undefined;
}

async function get(path, init) {
  const response = await fetch(new URL(path, baseUrl), init);
  assert.equal(response.status, 200, `${path} must return HTTP 200`);
  return response;
}

const root = await get("/", { headers: { "user-agent": "Twitterbot/1.0" } });
const html = await root.text();
const title = decodeHtml(html.match(/<title>(.*?)<\/title>/i)?.[1] ?? "");
assert.equal(title, EXPECTED_TITLE);
assert.equal(metaContent(html, "name", "description"), EXPECTED_DESCRIPTION);
assert.equal(linkHref(html, "canonical"), EXPECTED_ORIGIN);
assert.equal(metaContent(html, "property", "og:title"), EXPECTED_TITLE);
assert.equal(metaContent(html, "property", "og:description"), EXPECTED_DESCRIPTION);
assert.equal(metaContent(html, "property", "og:url"), EXPECTED_ORIGIN);
assert.equal(metaContent(html, "property", "og:type"), "website");
assert.equal(metaContent(html, "property", "og:locale"), "ja_JP");
assert.equal(metaContent(html, "property", "og:image"), `${EXPECTED_ORIGIN}/ogp-image.png`);
assert.equal(metaContent(html, "property", "og:image:width"), "1200");
assert.equal(metaContent(html, "property", "og:image:height"), "630");
assert.equal(metaContent(html, "name", "twitter:card"), "summary_large_image");
assert.equal(metaContent(html, "name", "twitter:title"), EXPECTED_TITLE);
assert.equal(metaContent(html, "name", "twitter:description"), EXPECTED_DESCRIPTION);
assert.equal(metaContent(html, "name", "twitter:image"), `${EXPECTED_ORIGIN}/ogp-image.png`);

const robotsMeta = metaContent(html, "name", "robots");
assert.equal(
  robotsMeta,
  mode === "production" ? "index, follow" : "noindex, nofollow, noarchive",
);

const robots = await (await get("/robots.txt")).text();
if (mode === "production") {
  assert.match(robots, /Allow: \//);
  assert.doesNotMatch(robots, /Disallow: \//);
  assert.match(robots, new RegExp(`Sitemap: ${EXPECTED_ORIGIN}/sitemap\\.xml`));
  assert.match(robots, new RegExp(`Host: ${EXPECTED_ORIGIN}`));
} else {
  assert.match(robots, /Disallow: \//);
  assert.doesNotMatch(robots, /Allow: \//);
}

const sitemap = await (await get("/sitemap.xml")).text();
if (mode === "production") {
  assert.match(sitemap, new RegExp(`<loc>${EXPECTED_ORIGIN}/</loc>`));
} else {
  assert.doesNotMatch(sitemap, /<loc>/);
}

const manifest = await (await get("/manifest.webmanifest")).json();
assert.equal(manifest.description, EXPECTED_DESCRIPTION);

const socialImage = await get("/ogp-image.png");
assert.match(socialImage.headers.get("content-type") ?? "", /^image\/png/);
const png = Buffer.from(await socialImage.arrayBuffer());
assert.equal(png.readUInt32BE(16), 1200);
assert.equal(png.readUInt32BE(20), 630);

console.log(`Crawler metadata verification passed (${mode}): ${baseUrl}`);
