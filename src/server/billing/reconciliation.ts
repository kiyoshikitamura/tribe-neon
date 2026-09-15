import type { BillingOrder, CheckoutSession } from "./contracts";

type Dependencies = {
  order: (id: string) => Promise<BillingOrder>;
  rpc: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  validate: (session: CheckoutSession, order: BillingOrder) => boolean;
};

export function terminalOrderResult(order: BillingOrder) {
  return order.status === "GRANTED" || order.status === "EXPIRED"
    ? { status: order.status, order_id: order.id }
    : null;
}

/** Webhookとブラウザ復帰が競合しても、DBで確定した配送状態を優先する。 */
export async function reconcileCheckout(
  session: CheckoutSession, deps: Dependencies, existing?: BillingOrder,
) {
  const item = existing ?? await deps.order(session.client_reference_id);
  const paid = deps.validate(session, item);
  // 遅延イベントから配送済みを期限切れや処理中へ戻さない。
  if (item.status === "GRANTED") return terminalOrderResult(item);
  if (paid) return deps.rpc("billing_grant_order", {
    p_order_id: item.id, p_session_id: session.id,
    p_amount_jpy: session.amount_total, p_currency: session.currency,
  });
  if (session.status === "expired") {
    await deps.rpc("billing_expire_order", { p_order_id: item.id, p_session_id: session.id });
    // 読取後に別リクエストが付与済みにした場合も、更新結果を再確認する。
    const latest = await deps.order(item.id);
    return terminalOrderResult(latest) ?? { status: "PENDING", order_id: item.id };
  }
  const latest = await deps.order(item.id);
  return terminalOrderResult(latest) ?? { status: "PENDING", order_id: item.id };
}
