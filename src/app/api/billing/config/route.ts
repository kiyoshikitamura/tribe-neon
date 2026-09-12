import { billingConfig } from "@/server/billing/contracts";
import { billingResponse } from "@/server/billing/service";
export const runtime = "nodejs";
export async function GET() {
  try { billingConfig(); return billingResponse({ available: true, mode: "sandbox" }); }
  catch { return billingResponse({ available: false }); }
}
