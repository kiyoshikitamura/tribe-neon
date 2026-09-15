export type AssetStatus = "loaded" | "fallback" | "failed";

export interface AssetRequest {
  src: string;
  fallbackSrc?: string;
  required?: boolean;
}

export interface AssetResult {
  requestedSrc: string;
  resolvedSrc: string | null;
  status: AssetStatus;
}

export type AssetTier = "BOOT_CRITICAL" | "TUTORIAL_CRITICAL" | "DEFERRED" | "DYNAMIC_RESULT";

export interface AssetTierMetric {
  tier: AssetTier;
  startedAt: number;
  settledAt?: number;
  durationMs?: number;
  loaded?: number;
  fallback?: number;
  failed?: string[];
}

declare global {
  interface Window {
    __TRIBE_ASSET_METRICS__?: {
      navigationStartedAt: number;
      titleReadyAt?: number;
      tiers: Partial<Record<AssetTier, AssetTierMetric>>;
      imagePopInCount: number;
    };
  }
}

function now() {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

export function beginAssetTierMetric(tier: AssetTier) {
  if (typeof window === "undefined") return;
  window.__TRIBE_ASSET_METRICS__ ||= {
    navigationStartedAt: now(),
    tiers: {},
    imagePopInCount: 0,
  };
  window.__TRIBE_ASSET_METRICS__.tiers[tier] = { tier, startedAt: now() };
}

export function finishAssetTierMetric(tier: AssetTier, results: AssetResult[]) {
  if (typeof window === "undefined") return;
  const metrics = window.__TRIBE_ASSET_METRICS__;
  if (!metrics) return;
  const metric = metrics.tiers[tier] || { tier, startedAt: now() };
  const settledAt = now();
  metrics.tiers[tier] = {
    ...metric,
    settledAt,
    durationMs: Math.round(settledAt - metric.startedAt),
    loaded: results.filter((result) => result.status === "loaded").length,
    fallback: results.filter((result) => result.status === "fallback").length,
    failed: results.filter((result) => result.status === "failed").map((result) => result.requestedSrc),
  };
}

export function markTitleAssetReady() {
  if (typeof window === "undefined") return;
  window.__TRIBE_ASSET_METRICS__ ||= {
    navigationStartedAt: now(),
    tiers: {},
    imagePopInCount: 0,
  };
  window.__TRIBE_ASSET_METRICS__.titleReadyAt = now();
}

const imagePromiseCache = new Map<string, Promise<boolean>>();

function loadImage(src: string, timeoutMs: number): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(true);
  const cached = imagePromiseCache.get(src);
  if (cached) return cached;

  const promise = new Promise<boolean>((resolve) => {
    const image = new Image();
    let settled = false;
    const finish = (loaded: boolean) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      resolve(loaded);
    };
    const timer = window.setTimeout(() => finish(false), timeoutMs);
    const finishAfterDecode = () => {
      if (typeof image.decode !== "function") {
        finish(image.naturalWidth > 0);
        return;
      }
      void image.decode()
        .then(() => finish(image.naturalWidth > 0))
        .catch(() => finish(image.naturalWidth > 0));
    };
    image.onload = finishAfterDecode;
    image.onerror = () => finish(false);
    image.src = src;
    if (image.complete && image.naturalWidth > 0) finishAfterDecode();
  });

  const tracked = promise.then((loaded) => {
    // A transient timeout/network failure must not poison every later screen
    // that requests the same asset during this session.
    if (!loaded) imagePromiseCache.delete(src);
    return loaded;
  });
  imagePromiseCache.set(src, tracked);
  return tracked;
}

export async function preloadAsset(asset: AssetRequest, timeoutMs = 12000): Promise<AssetResult> {
  if (await loadImage(asset.src, timeoutMs)) {
    return { requestedSrc: asset.src, resolvedSrc: asset.src, status: "loaded" };
  }
  if (asset.fallbackSrc && await loadImage(asset.fallbackSrc, timeoutMs)) {
    return { requestedSrc: asset.src, resolvedSrc: asset.fallbackSrc, status: "fallback" };
  }
  return { requestedSrc: asset.src, resolvedSrc: null, status: "failed" };
}

export function preloadAssetManifest(assets: AssetRequest[], timeoutMs = 12000) {
  const uniqueAssets = Array.from(new Map(assets.map((asset) => [asset.src, asset])).values());
  return Promise.all(uniqueAssets.map((asset) => preloadAsset(asset, timeoutMs)));
}

export function evictImageFromCache(src: string) {
  imagePromiseCache.delete(src);
}
