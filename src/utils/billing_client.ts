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
export async function billingFetch(path: string, token: string, body?: unknown) {
  const response = await fetch(`/api/billing/${path}`, {
    method: body ? "POST" : "GET", cache: "no-store",
    headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "購入情報を確認できませんでした。");
  return data;
}
