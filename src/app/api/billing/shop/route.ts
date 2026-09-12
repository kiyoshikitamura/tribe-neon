import { BillingError, uuid } from "@/server/billing/contracts";
import { billingService, billingFailure, billingResponse } from "@/server/billing/service";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const billing = billingService();
    const userId = await billing.authenticatedUser(request);
    const input = await request.json();
    if (typeof input.productId !== "string" || input.productId.length > 80) throw new BillingError("商品が不正です。");
    return billingResponse(await billing.rpc("billing_buy_dia_product", {
      p_user_id: userId, p_request_id: uuid(input.requestId), p_product_id: input.productId,
    }));
  } catch (error) { return billingFailure(error); }
}
