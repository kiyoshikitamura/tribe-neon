"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/utils/supabase";
import { billingFetch, clearBillingRequest } from "@/utils/billing_client";
import CanonicalDialog from "./ui/CanonicalDialog";

export default function BillingStatusDialog({ orderId, onClose }: {
  orderId: string;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState("購入状況を確認しています。");
  const checking = useRef(false);
  const mounted = useRef(false);
  const check = useCallback(async () => {
    if (checking.current) return;
    checking.current = true;
    setBusy(true);
    try {
      if (!orderId) throw new Error("注文が見つかりません。購入履歴からご確認ください。");
      const { data } = await supabase.auth.getSession();
      if (!data.session) throw new Error("ログインし直し、ショップの購入履歴から再確認してください。");
      // Only the authenticated server response determines delivery, never the
      // return URL, Stripe success redirect, or a client-side assumption.
      const result = await billingFetch("restore", data.session.access_token, { orderId });
      if (!mounted.current) return;
      setMessage(result.status === "GRANTED"
        ? "購入が完了しました。プレゼントBOXで商品をお受け取りください。"
        : result.status === "EXPIRED"
          ? "お支払い期限が終了しました。ショップから商品を選び直してください。"
          : "お支払いはまだ確定していません。中断した場合は、ショップで同じ商品を選ぶと再開できます。");
      if (["GRANTED", "EXPIRED"].includes(result.status)) {
        // Failure to refresh history must not turn confirmed delivery into an
        // apparent payment failure. A retry retains the server's idempotency.
        try {
          const history = await billingFetch("history", data.session.access_token);
          const order = history.orders.find((item: { id: string }) => item.id === orderId);
          if (order) clearBillingRequest(data.session.user.id, order.product_id, "checkout");
        } catch { /* Purchase status above remains authoritative. */ }
      }
    } catch (error) {
      if (mounted.current) setMessage(error instanceof Error ? error.message : "購入を確認できませんでした。");
    } finally {
      checking.current = false;
      if (mounted.current) setBusy(false);
    }
  }, [orderId]);

  useEffect(() => {
    mounted.current = true;
    queueMicrotask(() => { if (mounted.current) void check(); });
    return () => { mounted.current = false; };
  }, [check]);

  return <CanonicalDialog title="購入状況" onClose={onClose} actions={[
    { label: "購入状況を再確認", semantic: "secondary", disabled: busy, onClick: check },
    { label: "閉じる", semantic: "primary", onClick: onClose },
  ]}>
    <p role="status" aria-live="polite">{message}</p>
    {busy && <span role="status">確認中…</span>}
  </CanonicalDialog>;
}
