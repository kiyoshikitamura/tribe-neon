"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AssetRequest, AssetResult, preloadAssetManifest } from "../lib/screenAssets";

export type ScreenReadinessStatus = "loading" | "ready" | "error";

interface ScreenReadinessOptions {
  assets?: readonly AssetRequest[];
  dataReady?: boolean;
  dataError?: unknown;
  timeoutMs?: number;
}

export function useScreenReadiness({ assets = [], dataReady = true, dataError, timeoutMs = 12000 }: ScreenReadinessOptions) {
  const manifestJson = JSON.stringify(assets);
  const manifest = useMemo<AssetRequest[]>(() => JSON.parse(manifestJson), [manifestJson]);
  const [attempt, setAttempt] = useState(0);
  const manifestKey = manifest.map((asset) => `${asset.src}:${asset.fallbackSrc || ""}:${asset.required !== false}`).join("|");
  const [result, setResult] = useState<{ key: string; assets: AssetResult[] } | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (manifest.length === 0) return;
    void preloadAssetManifest(manifest, timeoutMs).then((results) => {
      if (cancelled) return;
      setResult({ key: manifestKey, assets: results });
    });
    return () => { cancelled = true; };
  }, [manifest, manifestKey, attempt, timeoutMs]);

  const retry = useCallback(() => {
    setAttempt((value) => value + 1);
  }, []);

  const assetsSettled = manifest.length === 0 || result?.key === manifestKey;
  const assetResults = result?.key === manifestKey ? result.assets : [];

  const requiredAssetFailed = assetResults.some((result) => {
    const request = manifest.find((asset) => asset.src === result.requestedSrc);
    return request?.required !== false && result.status === "failed";
  });
  const status: ScreenReadinessStatus = dataError || requiredAssetFailed
    ? "error"
    : dataReady && assetsSettled
      ? "ready"
      : "loading";

  return { status, assetResults, retry };
}
