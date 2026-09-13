import { BillingError, uuid, validateSession } from "@/server/billing/contracts";
import { billingService, billingFailure, billingResponse } from "@/server/billing/service";
import { catalogMatches, PAID_PACKS } from "@/server/billing/catalog";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const billing = billingService();
    const userId = await billing.authenticatedUser(request);
    const input = await request.json();
    const requestId = uuid(input.requestId);
    if (typeof input.productId !== "string" || input.productId.length > 80) throw new BillingError("商品が不正です。");
    if (!PAID_PACKS.some(item => item.id === input.productId)) throw new BillingError("この商品の販売準備中です。", 503);
    const { data: products, error: catalogError } = await billing.db.from("billing_products").select("id,amount_jpy,purchase_limit,validity_days,items");
    if (catalogError || !products || !catalogMatches(products)) throw new BillingError("商品の販売準備中です。", 503);
    const order = await billing.rpc("billing_reserve_order", {
      p_user_id: userId, p_request_id: requestId, p_product_id: input.productId, p_mode: billing.config.mode,
    });
    if (order.status === "GRANTED" || order.status === "EXPIRED") return billingResponse({ status: order.status, orderId: order.id });
    // 更新前に予約した注文は旧価格・旧内容のまま決済を再開しない。
    const snapshot = { ...order.product_snapshot, id: order.product_id };
    if (!catalogMatches(products.map(item => item.id === order.product_id ? snapshot : item)))
      throw new BillingError("この注文は商品更新前の内容です。お問い合わせください。", 409);
    let session;
    if (order.stripe_session_id) session = await billing.stripe(`checkout/sessions/${encodeURIComponent(order.stripe_session_id)}`);
    else {
      // Stripeの冪等性保存期限に備え、23時間以上前の未確定注文は再作成しない。
      if (Date.now() - Date.parse(order.created_at) >= 23 * 60 * 60 * 1000)
        throw new BillingError("この注文は確認が必要です。お問い合わせください。", 409);
      const body = new URLSearchParams({ mode: "payment", "payment_method_types[0]": "card",
        client_reference_id: order.id, "metadata[order_id]": order.id,
        "metadata[user_id]": userId, "metadata[product_id]": order.product_id,
        "line_items[0][price_data][currency]": "jpy",
        "line_items[0][price_data][unit_amount]": String(order.amount_jpy),
        "line_items[0][price_data][product_data][name]": order.product_snapshot.title,
        "line_items[0][quantity]": "1",
        success_url: `${billing.config.origin}/billing/return?order=${order.id}`,
        cancel_url: `${billing.config.origin}/billing/return?order=${order.id}&cancel=1`,
      });
      session = await billing.stripe("checkout/sessions", body, `tn-${billing.config.mode}-${order.id}`);
      validateSession(session, order, billing.config.mode);
      await billing.rpc("billing_attach_session", { p_order_id: order.id, p_session_id: session.id });
    }
    validateSession(session, order, billing.config.mode);
    if (session.status !== "open") return billingResponse(await billing.reconcile(session, order));
    if (!session.url || new URL(session.url).origin !== "https://checkout.stripe.com") throw new BillingError("決済ページを確認できません。", 503);
    return billingResponse({ status: "PENDING", orderId: order.id, url: session.url });
  } catch (error) { return billingFailure(error); }
}
