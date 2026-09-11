const TUTORIAL_COMPLETION_ASSETS = [
  "/branding/tutorial/tutorial_final_guide_bg.png",
] as const;

export type TutorialCompletionAssetStatus = "idle" | "loading" | "ready" | "degraded";

let preloadPromise: Promise<TutorialCompletionAssetStatus> | null = null;
let preloadStatus: TutorialCompletionAssetStatus = "idle";

async function loadAndDecode(src: string): Promise<boolean> {
  if (typeof window === "undefined") return true;

  return new Promise<boolean>((resolve) => {
    const image = new Image();
    let settled = false;
    const finish = (loaded: boolean) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      resolve(loaded);
    };
    const timeout = window.setTimeout(() => finish(false), 8000);
    image.onload = () => {
      if (typeof image.decode !== "function") {
        finish(true);
        return;
      }
      void image.decode().then(() => finish(true)).catch(() => finish(image.naturalWidth > 0));
    };
    image.onerror = () => finish(false);
    image.decoding = "async";
    image.src = src;
    if (image.complete && image.naturalWidth > 0) {
      void image.decode().then(() => finish(true)).catch(() => finish(true));
    }
  });
}

export function preloadTutorialCompletionAssets(): Promise<TutorialCompletionAssetStatus> {
  if (preloadPromise) return preloadPromise;
  preloadStatus = "loading";
  preloadPromise = Promise.all(TUTORIAL_COMPLETION_ASSETS.map(loadAndDecode)).then((results) => {
    preloadStatus = results.every(Boolean) ? "ready" : "degraded";
    return preloadStatus;
  });
  return preloadPromise;
}

export function getTutorialCompletionAssetStatus() {
  return preloadStatus;
}

export { TUTORIAL_COMPLETION_ASSETS };
