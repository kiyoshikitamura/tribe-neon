/** Public catalog readiness only; prices, limits and payment permission are checked by purchase APIs. */
export type BillingReadiness = { available: boolean; catalogVersion?: string; mode?: string; disabledProductIds?: string[] };
const TTL_MS = 30_000;
let cached: { value: BillingReadiness; expiresAt: number } | null = null;
let pending: Promise<BillingReadiness> | null = null;

export function peekBillingReadiness(): BillingReadiness | null {
  return cached && cached.expiresAt > Date.now() ? cached.value : null;
}

export function loadBillingReadiness(force = false): Promise<BillingReadiness> {
  if (pending) return pending;
  const fresh = !force && peekBillingReadiness();
  if (fresh) return Promise.resolve(fresh);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  pending = fetch('/api/billing/config', { cache: 'no-store', signal: controller.signal })
    .then(async response => {
      if (!response.ok) throw new Error('Purchase configuration unavailable');
      const value: BillingReadiness = await response.json();
      // Failures are not cached, so settings corrected by operations can recover immediately.
      cached = value.available === true && value.catalogVersion === '20260913'
        ? { value, expiresAt: Date.now() + TTL_MS } : null;
      return value;
    }).finally(() => { clearTimeout(timeout); pending = null; });
  return pending;
}
