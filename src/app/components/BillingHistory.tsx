"use client";
import { useState } from "react";
import { supabase } from "@/utils/supabase";
import { billingFetch, clearBillingRequest } from "@/utils/billing_client";
import { SHOP_PRODUCTS_MASTER } from "@/utils/shop_master_data";
import OutlawButton from "./ui/OutlawButton";
import OutlawCard from "./ui/OutlawCard";

type Order = { id:string; product_id:string; amount_jpy:number; status:string; created_at:string };
export default function BillingHistory() {
  const [orders,setOrders] = useState<Order[] | null>(null);
  const [busy,setBusy] = useState(false);
  const [message,setMessage] = useState("");
  const load = async (order?: Order) => {
    if (busy) return;
    setBusy(true); setMessage("");
    try {
      const {data} = await supabase.auth.getSession();
      if (!data.session) throw new Error("ログインし直してください。");
      if (order) {
        const result = await billingFetch("restore",data.session.access_token,{orderId:order.id});
        if (["GRANTED","EXPIRED"].includes(result.status)) clearBillingRequest(data.session.user.id,order.product_id,"checkout");
        setMessage(result.status === "GRANTED" ? "購入済みです。プレゼントBOXをご確認ください。" : result.status === "EXPIRED" ? "お支払い期限が終了しました。" : "お支払いはまだ確定していません。");
      }
      setOrders((await billingFetch("history",data.session.access_token)).orders);
    } catch(error) { setMessage(error instanceof Error ? error.message : "購入履歴を確認できませんでした。"); }
    finally { setBusy(false); }
  };
  return <section aria-label="購入履歴">
    <OutlawButton variant="secondary" onClick={()=>void load()} disabled={busy}>購入履歴</OutlawButton>
    {busy && <span className="shop-btn-spinner" aria-label="処理中" />}
    {message && <p role="status">{message}</p>}
    {orders?.length === 0 && <p>購入履歴はありません。</p>}
    {orders?.map(order=><OutlawCard key={order.id}>
      <p>{SHOP_PRODUCTS_MASTER.find(p=>p.id===order.product_id)?.title ?? order.product_id} / {order.amount_jpy.toLocaleString("ja-JP")}円</p>
      <p>{new Date(order.created_at).toLocaleString("ja-JP",{timeZone:"Asia/Tokyo"})} / {order.status==="GRANTED"?"配送済み":order.status==="EXPIRED"?"期限終了":"お支払い待ち"}</p>
      {order.status==="PENDING" && <OutlawButton variant="secondary" disabled={busy} onClick={()=>void load(order)}>購入状況を再確認</OutlawButton>}
    </OutlawCard>)}
  </section>;
}
