export const ACQUISITION_METADATA_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "referrer",
  "landing_path",
  "fbclid",
  "x_click_id",
] as const;

export type AcquisitionSource = "x" | "meta" | "organic" | "direct" | "unknown";

export type AcquisitionLandingMetadata = {
  utm_source: AcquisitionSource;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
  referrer: string | null;
  landing_path: string | null;
  fbclid: string | null;
  x_click_id: string | null;
};

const FIELD_LIMIT = 256;
const REFERRER_LIMIT = 1024;
const PATH_LIMIT = 1024;

function bounded(value: string | null, limit = FIELD_LIMIT): string | null {
  const normalized = value?.trim();
  return normalized ? normalized.slice(0, limit) : null;
}

function normalizeSource(
  rawSource: string | null,
  referrer: string | null,
  currentOrigin: string,
  fbclid: string | null,
  xClickId: string | null,
): AcquisitionSource {
  if (fbclid) return "meta";
  if (xClickId) return "x";

  const source = rawSource?.trim().toLowerCase() || "";
  if (["x", "twitter"].includes(source)) return "x";
  if (["meta", "facebook", "instagram", "fb", "ig"].includes(source)) return "meta";
  if (source === "organic") return "organic";
  if (source === "direct") return "direct";
  if (source) return "unknown";
  if (!referrer) return "direct";

  try {
    return new URL(referrer).origin === currentOrigin ? "direct" : "organic";
  } catch {
    return "unknown";
  }
}

export function captureAcquisitionLandingMetadata(
  href: string,
  documentReferrer: string,
): AcquisitionLandingMetadata {
  const url = new URL(href);
  const referrer = bounded(documentReferrer, REFERRER_LIMIT);
  const fbclid = bounded(url.searchParams.get("fbclid"));
  const xClickId = bounded(url.searchParams.get("x_click_id") || url.searchParams.get("twclid"));

  return {
    utm_source: normalizeSource(url.searchParams.get("utm_source"), referrer, url.origin, fbclid, xClickId),
    utm_medium: bounded(url.searchParams.get("utm_medium")),
    utm_campaign: bounded(url.searchParams.get("utm_campaign")),
    utm_content: bounded(url.searchParams.get("utm_content")),
    utm_term: bounded(url.searchParams.get("utm_term")),
    referrer,
    landing_path: bounded(url.pathname, PATH_LIMIT),
    fbclid,
    x_click_id: xClickId,
  };
}
