import { uuid } from "@/server/billing/contracts";
import { billingService, billingFailure, billingResponse } from "@/server/billing/service";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const billing = billingService();
    const userId = await billing.authenticatedUser(request);
    const input = await request.json();
    const order = await billing.order(uuid(input.orderId), userId);
    if (order.status === "GRANTED") return billingResponse({ status: "GRANTED", order_id: order.id });
    if (!order.stripe_session_id) return billingResponse({ status: "PENDING", order_id: order.id });
    const session = await billing.stripe(`checkout/sessions/${encodeURIComponent(order.stripe_session_id)}`);
    return billingResponse(await billing.reconcile(session, order));
  } catch (error) { return billingFailure(error); }
}
