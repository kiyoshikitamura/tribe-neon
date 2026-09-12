"use client";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/utils/supabase";
import { billingFetch, clearBillingRequest } from "@/utils/billing_client";
import "@/app/components/ui/OutlawButton.css";
import OutlawCard from "@/app/components/ui/OutlawCard";
import SectionHeader from "@/app/components/ui/SectionHeader";
import "./return.css";

export default function BillingReturnPage() {
  const [busy,setBusy] = useState(false);
  const [message,setMessage] = useState("");
  const checking = useRef(false);
  const check = async () => {
    if (checking.current) return;
    checking.current = true;
    setBusy(true);
    try {
      const orderId = new URLSearchParams(window.location.search).get("order");
      if (!orderId) throw new Error("注文が見つかりません。");
      const {data} = await supabase.auth.getSession();
      if (!data.session) throw new Error("ゲームでログインし直し、ショップの購入履歴から再確認してください。");
      const result = await billingFetch("restore",data.session.access_token,{orderId});
      if (["GRANTED","EXPIRED"].includes(result.status)) {
        const history = await billingFetch("history",data.session.access_token);
        const order = history.orders.find((item:{id:string})=>item.id===orderId);
        if (order) clearBillingRequest(data.session.user.id,order.product_id,"checkout");
      }
      setMessage(result.status === "GRANTED" ? "購入が完了しました。プレゼントBOXで商品をお受け取りください。" : result.status === "EXPIRED" ? "お支払い期限が終了しました。ショップから商品を選び直してください。" : "お支払いはまだ確定していません。お支払いを中断した場合は、ショップで同じ商品を選ぶと再開できます。");
    } catch(error) { setMessage(error instanceof Error ? error.message : "購入を確認できませんでした。"); }
    finally { checking.current = false; setBusy(false); }
  };
  useEffect(()=>{ void check(); },[]);
  return <main className="billing-return">
    <SectionHeader title="購入状況" />
    <OutlawCard><p role="status">{message}</p>{busy && <span className="shop-btn-spinner" aria-label="処理中" />}</OutlawCard>
    {/* この独立ページはGameProviderを起動せず、共通ボタンCSSを再利用する。 */}
    <button className="outlaw-button semantic-cta semantic-cta--primary variant-primary active-scale-effect" disabled={busy} onClick={()=>void check()}>購入状況を再確認</button>
    <button className="outlaw-button semantic-cta semantic-cta--secondary variant-secondary active-scale-effect" onClick={()=>window.location.assign("/")}>ゲームへ戻る</button>
  </main>;
}
