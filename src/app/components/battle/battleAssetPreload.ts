/** Share decoded assets across setup visits; failed or stalled loads remain retryable. */
const decodedImages = new Map<string, Promise<void>>();
export function preloadBattleImage(src: string): Promise<void> {
  const cached = decodedImages.get(src);
  if (cached) return cached;
  const pending = new Promise<void>((resolve, reject) => {
    const image = new Image();
    const timer = setTimeout(() => {
      image.onload = null;
      image.onerror = null;
      reject(new Error('Battle image timed out'));
    }, 12000);
    const finish = (error?: unknown) => {
      clearTimeout(timer);
      if (error) reject(error); else resolve();
    };
    image.onload = () => image.decode().then(() => finish(), finish);
    image.onerror = () => finish(new Error('Battle image unavailable'));
    image.src = src;
  }).catch(error => { decodedImages.delete(src); throw error; });
  decodedImages.set(src, pending);
  return pending;
}
