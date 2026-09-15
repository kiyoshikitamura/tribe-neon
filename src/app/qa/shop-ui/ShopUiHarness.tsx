"use client";

import { useEffect, useState, type ReactNode } from "react";
import { GameContext } from "@/app/context/GameContext";
import ShopTab from "@/app/components/ShopTab";
import InboxPanel from "@/app/components/InboxPanel";
import CanonicalDialog from "@/app/components/ui/CanonicalDialog";
import { supabase } from "@/utils/supabase";

const newsFixture = [{ id: "qa-news", title: "正式オープンのお知らせ（表示確認用）", content: "これは表示確認用の文面です。実際のお知らせ・ユーザーデータには接続しません。", start_at: "2026-09-15T00:00:00Z", date: "2026/9/15", category: "IMPORTANT" }];
type Dialog = { isOpen: boolean; title?: string; message?: ReactNode; confirmText?: string; onConfirm?: () => unknown; onCancel?: () => unknown };

/** Real components with isolated in-memory transport; no sign-in, checkout or DB writes. */
export default function ShopUiHarness() {
  const [ready, setReady] = useState(false);
  const [shopSubTab, setShopSubTab] = useState("LIMITED");
  const [showInboxPanel, setShowInboxPanel] = useState(false);
  const [inboxPanelTab, setInboxPanelTab] = useState("presents");
  const [newsList, setNewsList] = useState(newsFixture);
  const [presents, setPresents] = useState([{ id: "qa-present", title: "ビギナーパック（表示確認用）", itemId: "CASH", qty: 5000, status: "UNCLAIMED" }]);
  const [dialog, setDialog] = useState<Dialog>({ isOpen: false });

  useEffect(() => {
    const originalFetch = window.fetch;
    const originalSession = supabase.auth.getSession;
    const originalRpc = supabase.rpc;
    // Session is never persisted and the token is a literal fixture, not a credential.
    supabase.auth.getSession = (async () => ({ data: { session: { access_token: "qa-ui-fixture", user: { id: "qa-ui" } } }, error: null })) as typeof originalSession;
    supabase.rpc = ((name: string) => {
      if (name !== "billing_refresh_paid_assets") return Promise.reject(new Error("QA harness blocks database operations"));
      return Promise.resolve({ data: { dia_paid: 1000, dia_total: 1030, lots: [{ item_id: "DIAMOND", quantity: 1000, claimed: true, expires_at: "2027-01-13T00:00:00Z" }] }, error: null });
    }) as unknown as typeof originalRpc;
    window.fetch = async (input, init) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, window.location.origin);
      if (url.pathname === "/api/billing/config") return Response.json({ available: true, mode: "sandbox", catalogVersion: "20260913", disabledProductIds: [] });
      if (url.pathname === "/api/billing/history") return Response.json({ orders: [{ id: "qa-order", product_id: "beginner_pack_01", amount_jpy: 100, status: "GRANTED", created_at: "2026-09-15T00:00:00Z" }] });
      if (url.pathname === "/rest/v1/news") return Response.json(newsFixture);
      if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/rest/") || url.pathname.startsWith("/auth/") || url.origin !== window.location.origin) throw new Error("QA harness blocks real API access");
      return originalFetch(input, init);
    };
    // Mount real components only after the isolated transport has been installed.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReady(true);
    return () => { window.fetch = originalFetch; supabase.auth.getSession = originalSession; supabase.rpc = originalRpc; };
  }, []);

  if (!ready) return <p>表示確認を準備中</p>;
  const blockedPurchase = () => setDialog({ isOpen: true, title: "表示確認", message: "表示確認用です。決済・商品付与は実行しません。", confirmText: "閉じる", onConfirm: () => setDialog({ isOpen: false }) });
  return <GameContext.Provider value={{
    shopSubTab, setShopSubTab, userShopPurchases: {}, boughtResultModal: null,
    setBoughtResultModal: () => {}, handleBuyNormalProduct: blockedPurchase, handleBuyStripeProduct: blockedPurchase,
    profileLoading: false, upgradeLoading: false, setConfirmDialogConfig: setDialog,
    showInboxPanel, setShowInboxPanel, inboxPanelTab, setInboxPanelTab, newsList, setNewsList,
    markNewsRead: () => {}, presents, handleClaimPresent: () => setPresents([]), handleClaimAllPresents: () => setPresents([]),
    presentClaimLoading: false, playCyberSe: () => {},
  }}>
    <main style={{ width: "100%", maxWidth: 390, height: "100dvh", margin: "0 auto", padding: 12, display: "flex", flexDirection: "column", background: "#0b101b", color: "#f1f5f9" }}>
      <div style={{ fontSize: 11, display: "flex", gap: 8, paddingBottom: 8 }}>
        <span>QA 表示確認・実決済なし</span>
        <button onClick={() => { setInboxPanelTab("presents"); setShowInboxPanel(true); }}>プレゼントBOX</button>
        <button onClick={() => { setInboxPanelTab("news"); setShowInboxPanel(true); }}>お知らせ</button>
      </div>
      <ShopTab />
    </main>
    <InboxPanel />
    {dialog.isOpen && <CanonicalDialog title={dialog.title} onClose={() => setDialog({ isOpen: false })} actions={[{ label: dialog.confirmText ?? "閉じる", onClick: dialog.onConfirm ?? (() => setDialog({ isOpen: false })) }]}>{dialog.message}</CanonicalDialog>}
  </GameContext.Provider>;
}
