import { createClient } from "@supabase/supabase-js";
import { BillingError, billingConfig, validateSession, assertPurchaseOperatingStates } from "./contracts";
import type { BillingOrder, CheckoutSession } from "./contracts";
import { reconcileCheckout } from "./reconciliation";

export function billingService() {
  const config = billingConfig();
  const db = createClient(config.databaseUrl, config.serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  async function authenticatedUser(request: Request) {
    const match = /^Bearer (\S+)$/.exec(request.headers.get("authorization") ?? "");
    if (!match) throw new BillingError("ログインし直してください。", 401, "AUTH_REQUIRED");
    const { data, error } = await db.auth.getUser(match[1]);
    if (error || !data.user) throw new BillingError("ログインし直してください。", 401, "AUTH_REQUIRED");
    return data.user.id;
  }
  async function authenticatedPurchaseUser(request: Request) {
    const authRequired = (): never => { throw new BillingError("購入前にアカウント連携をお願いします。", 401, "PURCHASE_AUTH_REQUIRED"); };
    const match = /^Bearer (\S+)$/.exec(request.headers.get("authorization") ?? "");
    if (!match) authRequired();
    const { data, error } = await db.auth.getUser(match[1]);
    if (error || !data.user) throw new BillingError("ログインし直してください。", 401, "AUTH_REQUIRED");
    const user = data.user;
    if (user.is_anonymous === true) authRequired();

    // Supabase anonymous users use the authenticated Postgres role too. A
    // valid payment subject therefore requires the same binding authority as
    // get_current_onboarding_state, before any order/RPC side effect.
    const [{ data: profile, error: profileError }, { data: method, error: methodError }] = await Promise.all([
      db.from("users").select("id").eq("id", user.id).maybeSingle(),
      db.from("user_account_auth_methods").select("auth_method").eq("user_id", user.id).maybeSingle(),
    ]);
    const providers = (user.identities ?? []).map((identity: { provider?: string }) => identity.provider?.toLowerCase()).filter(Boolean);
    const provider = providers[0];
    const bindingValid = !profileError && !methodError
      && profile?.id === user.id
      && providers.length === 1
      && (provider === "google" || provider === "email")
      && (!method?.auth_method || method.auth_method.toLowerCase() === provider);
    if (!bindingValid) authRequired();
    return user.id;
  }
  async function assertPurchasingAllowed(feature: "PAYMENT" | "SHOP", userId: string) {
    const { data, error } = await db.from("feature_operating_states")
      .select("feature_key,state,mutation_allowed").in("feature_key", ["MAINTENANCE", feature]);
    if (error) throw new BillingError("購入受付状況を確認できません。時間をおいて再度お試しください。", 503);
    let tester = false;
    if (data?.some(row => row.feature_key === "MAINTENANCE" && row.state === "MAINTENANCE")) {
      const access = await db.from("operations_maintenance_testers").select("user_id")
        .eq("user_id", userId).gt("expires_at", new Date().toISOString()).maybeSingle();
      tester = !access.error && access.data?.user_id === userId;
    }
    assertPurchaseOperatingStates(data, feature, tester);
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
    return reconcileCheckout(session, { order, rpc, validate: (value, item) => validateSession(value, item, config.mode) }, existing);
  }
  return { config, db, authenticatedUser, authenticatedPurchaseUser, assertPurchasingAllowed, rpc, stripe, order, reconcile };
}

export function billingResponse(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}
export function billingFailure(error: unknown) {
  return billingResponse({
    error: error instanceof BillingError ? error.message : "購入処理を確認できませんでした。",
    errorCode: error instanceof BillingError ? error.code : "BILLING_ERROR",
  },
    error instanceof BillingError ? error.status : 500);
}
