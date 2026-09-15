/** 通信失敗やリロード後も同じ注文を再利用し、二重購入を防ぐ。 */
export function billingRequestId(userId: string, productId: string, kind: "checkout" | "shop") {
  const key = `tn.billing.${kind}.${userId}.${productId}`;
  let id = localStorage.getItem(key);
  if (!id) { id = crypto.randomUUID(); localStorage.setItem(key, id); }
  return id;
}
export function clearBillingRequest(userId: string, productId: string, kind: "checkout" | "shop") {
  localStorage.removeItem(`tn.billing.${kind}.${userId}.${productId}`);
}
export class BillingClientError extends Error {
  code: string;
  constructor(message: string, code: string) { super(message); this.code = code; }
}
export async function billingFetch(path: string, token: string, body?: unknown) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    let response: Response;
    let data;
    try {
      response = await fetch(`/api/billing/${path}`, {
        method: body ? "POST" : "GET", cache: "no-store", signal: controller.signal,
        headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      });
      data = await response.json();
    } catch {
      // Timeoutでもサーバー側は完了している可能性がある。購入番号は保持する。
      throw new Error("通信結果を確認できませんでした。同じ商品から再試行するか、購入履歴で状況を確認してください。");
    }
    if (!response.ok) throw new BillingClientError(data.error || "購入情報を確認できませんでした.", data.errorCode || "BILLING_ERROR");
    return data;
  } finally {
    clearTimeout(timeout);
  }
}
