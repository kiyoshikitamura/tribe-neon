import { createClient } from "@supabase/supabase-js";
import { BillingError, billingConfig, validateSession } from "./contracts";
import type { BillingOrder, CheckoutSession } from "./contracts";

export function billingService() {
  const config = billingConfig();
  const db = createClient(config.databaseUrl, config.serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  async function authenticatedUser(request: Request) {
    const match = /^Bearer (\S+)$/.exec(request.headers.get("authorization") ?? "");
    if (!match) throw new BillingError("ログインし直してください。", 401);
    const { data, error } = await db.auth.getUser(match[1]);
    if (error || !data.user) throw new BillingError("ログインし直してください。", 401);
    return data.user.id;
  }
  async function rpc(name: string, args: Record<string, unknown>) {
    const { data, error } = await db.rpc(name, args);
    if (error) {
      if (error.message.includes("PURCHASE_LIMIT")) throw new BillingError("この商品は購入済み、またはお支払いの途中です。", 409);
      if (error.message.includes("INSUFFICIENT_DIA")) throw new BillingError("DIAが不足しています。", 409);
      throw new BillingError("購入を確認できませんでした。同じ注文から再確認してください。", 503);
    }
    return data;
  }
  async function stripe(path: string, body?: URLSearchParams, idempotencyKey?: string): Promise<CheckoutSession> {
    let response: Response;
    try {
      response = await fetch(`https://api.stripe.com/v1/${path}`, {
        method: body ? "POST" : "GET", cache: "no-store", signal: AbortSignal.timeout(15000),
        headers: { Authorization: `Bearer ${config.stripeKey}`,
          ...(body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
          ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}) }, body,
      });
    } catch { throw new BillingError("決済サービスへの接続を確認できません。同じ注文から再試行してください。", 503); }
    if (!response.ok) throw new BillingError("決済サービスへの接続を確認できません。同じ注文から再試行してください。", 503);
    return response.json();
  }
  async function order(id: string, userId?: string): Promise<BillingOrder> {
    let query = db.from("billing_orders").select("*").eq("id", id);
    if (userId) query = query.eq("user_id", userId);
    const { data, error } = await query.single();
    if (error || !data) throw new BillingError("注文が見つかりません。", 404);
    return data;
  }
  async function reconcile(session: CheckoutSession, existing?: BillingOrder) {
    const item = existing ?? await order(session.client_reference_id);
    const paid = validateSession(session, item);
    if (paid) return rpc("billing_grant_order", { p_order_id: item.id, p_session_id: session.id,
      p_amount_jpy: session.amount_total, p_currency: session.currency });
    if (session.status === "expired") {
      await rpc("billing_expire_order", { p_order_id: item.id, p_session_id: session.id });
      return { status: "EXPIRED", order_id: item.id };
    }
    return { status: item.status === "GRANTED" ? "GRANTED" : "PENDING", order_id: item.id };
  }
  return { config, db, authenticatedUser, rpc, stripe, order, reconcile };
}

export function billingResponse(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}
export function billingFailure(error: unknown) {
  return billingResponse({ error: error instanceof BillingError ? error.message : "購入処理を確認できませんでした。" },
    error instanceof BillingError ? error.status : 500);
}
