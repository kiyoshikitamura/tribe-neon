import { billingResponse, billingService } from "@/server/billing/service";
import { catalogMatches, CATALOG_VERSION } from "@/server/billing/catalog";
export const runtime = "nodejs";
export async function GET() {
  try {
    const billing = billingService();
    const { data, error } = await billing.db.from("billing_products").select("id,amount_jpy,purchase_limit,validity_days,items");
    if (error || !data || !catalogMatches(data)) return billingResponse({ available: false });
    return billingResponse({ available: true, mode: billing.config.mode, catalogVersion: CATALOG_VERSION, disabledProductIds: [] });
  }
  catch { return billingResponse({ available: false }); }
}
