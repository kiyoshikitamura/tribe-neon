import { BillingError, verifyStripeEvent, sessionMatchesMode } from "@/server/billing/contracts";
import { billingService, billingFailure, billingResponse } from "@/server/billing/service";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const billing = billingService();
    const raw = await request.text();
    const event = verifyStripeEvent(raw, request.headers.get("stripe-signature") ?? "", billing.config.webhookSecret);
    if (event.livemode !== (billing.config.mode === "live")) throw new BillingError("Webhook mode mismatch", 400);
    if (["checkout.session.completed", "checkout.session.async_payment_succeeded", "checkout.session.expired"].includes(event.type)) {
      // イベントの重複・遅延・順序逆転に備え、決済サービスの最新状態を再取得する。
      const id = event.data?.object?.id;
      if (!sessionMatchesMode(id, billing.config.mode)) throw new BillingError("Invalid session", 400);
      await billing.reconcile(await billing.stripe(`checkout/sessions/${encodeURIComponent(id)}`));
    }
    return billingResponse({ received: true });
  } catch (error) { return billingFailure(error); }
}
