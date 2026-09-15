import { billingResponse, billingService } from "@/server/billing/service";
import { previewBillingDiagnostics } from "@/server/billing/contracts";
import { catalogMatches, CATALOG_VERSION } from "@/server/billing/catalog";
export const runtime = "nodejs";
export async function GET(request: Request) {
  const requestOrigin = new URL(request.url).origin;
  let billing: ReturnType<typeof billingService>;
  try { billing = billingService(); }
  catch { return billingResponse({ available: false, ...previewBillingDiagnostics("ENVIRONMENT_INVALID", requestOrigin) }); }
  try {
    const { data, error } = await billing.db.from("billing_products").select("id,amount_jpy,purchase_limit,validity_days,items");
    if (error || !data) return billingResponse({ available: false, ...previewBillingDiagnostics("CATALOG_QUERY_FAILED", requestOrigin) });
    if (!catalogMatches(data)) return billingResponse({ available: false, ...previewBillingDiagnostics("CATALOG_MISMATCH", requestOrigin) });
    return billingResponse({ available: true, mode: billing.config.mode, catalogVersion: CATALOG_VERSION, disabledProductIds: [], ...previewBillingDiagnostics("READY", requestOrigin) });
  }
  catch { return billingResponse({ available: false, ...previewBillingDiagnostics("SERVICE_FAILED", requestOrigin) }); }
}
