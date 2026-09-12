import { createHmac, timingSafeEqual } from "node:crypto";

export const PREVIEW_PROJECT_REF = "sufvuqdnqohpfzkwxohq";
export class BillingError extends Error {
  status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}
export type CheckoutSession = {
  id: string; url?: string | null; livemode: boolean; status: string;
  payment_status: string; amount_total: number; currency: string;
  client_reference_id: string; metadata: Record<string, string>;
};
export type BillingOrder = {
  id: string; user_id: string; product_id: string; amount_jpy: number;
  status: string; stripe_session_id: string | null; created_at: string;
  product_snapshot: { title: string; items: { itemId: string; quantity: number }[] };
};

/** Preview専用。本番DBのPAYMENTを開いてもこのAPIは有効にならない。 */
export function billingConfig(env: NodeJS.ProcessEnv = process.env) {
  const databaseUrl = env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  if (env.BILLING_SANDBOX_ENABLED !== "true" || env.VERCEL_ENV === "production" ||
      databaseUrl !== `https://${PREVIEW_PROJECT_REF}.supabase.co` ||
      !env.STRIPE_SECRET_KEY?.startsWith("sk_test_") ||
      !env.STRIPE_WEBHOOK_SECRET?.startsWith("whsec_") ||
      !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new BillingError("決済のテスト環境は準備中です。", 503);
  }
  let origin: URL;
  try { origin = new URL(env.BILLING_RETURN_ORIGIN ?? ""); }
  catch { throw new BillingError("決済の戻り先が未設定です。", 503); }
  if (origin.protocol !== "https:" || origin.username || origin.password ||
      origin.pathname !== "/" || origin.search || origin.hash ||
      ["tribe-neon.com", "www.tribe-neon.com"].includes(origin.hostname)) {
    throw new BillingError("決済の戻り先が不正です。", 503);
  }
  return { databaseUrl, serviceKey: env.SUPABASE_SERVICE_ROLE_KEY,
    stripeKey: env.STRIPE_SECRET_KEY, webhookSecret: env.STRIPE_WEBHOOK_SECRET,
    origin: origin.origin };
}

export function uuid(value: unknown): string {
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value))
    throw new BillingError("購入番号が不正です。");
  return value;
}

/** JSON解析前の未加工UTF-8本文で署名を検証する。 */
export function verifyStripeEvent(raw: string, signature: string, secret: string, now = Date.now()) {
  const fields = signature.split(",").map(value => value.split("="));
  const time = fields.find(([key]) => key === "t")?.[1];
  if (!time || !/^\d+$/.test(time) || Math.abs(now / 1000 - Number(time)) > 300)
    throw new BillingError("Invalid webhook signature", 400);
  const expected = createHmac("sha256", secret).update(`${time}.${raw}`).digest();
  const valid = fields.some(([key, value]) => key === "v1" && /^[a-f0-9]{64}$/i.test(value ?? "") &&
    timingSafeEqual(expected, Buffer.from(value, "hex")));
  if (!valid) throw new BillingError("Invalid webhook signature", 400);
  try { return JSON.parse(raw); }
  catch { throw new BillingError("Invalid webhook payload", 400); }
}

export function validateSession(session: CheckoutSession, order: BillingOrder) {
  if (session.livemode !== false || !session.id?.startsWith("cs_test_") ||
      session.client_reference_id !== order.id || session.metadata?.order_id !== order.id ||
      session.metadata?.user_id !== order.user_id || session.metadata?.product_id !== order.product_id ||
      session.amount_total !== order.amount_jpy || session.currency !== "jpy" ||
      (order.stripe_session_id && order.stripe_session_id !== session.id))
    throw new BillingError("決済情報と注文内容が一致しません。", 409);
  return session.status === "complete" && session.payment_status === "paid";
}
