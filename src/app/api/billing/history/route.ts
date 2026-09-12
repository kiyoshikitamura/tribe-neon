import { billingService, billingFailure, billingResponse } from "@/server/billing/service";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    const billing = billingService();
    const userId = await billing.authenticatedUser(request);
    const { data, error } = await billing.db.from("billing_orders")
      .select("id,product_id,amount_jpy,status,created_at,granted_at")
      .eq("user_id", userId).order("created_at", { ascending: false }).limit(50);
    if (error) throw error;
    return billingResponse({ orders: data });
  } catch (error) { return billingFailure(error); }
}
