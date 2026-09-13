"use client";

import { useRef, useState } from "react";
import { supabase } from "@/utils/supabase";
import { ITEMS_MASTER_DATA } from "@/utils/items_master_data";
import OutlawButton from "./ui/OutlawButton";

type PaidAssetLot = {
  item_id: string;
  quantity: number;
  expires_at: string;
  claimed: boolean;
};

const itemName = (id: string) => id === "CASH" ? "CASH"
  : id === "DIAMOND" ? "ダイア"
  : ITEMS_MASTER_DATA.find(item => item.id === id)?.name ?? id;

/** 販売catalogの接続確認後のみShopから表示する。期限の判定・失効はRPC側。 */
export default function PaidAssetExpiry() {
  const [lots, setLots] = useState<PaidAssetLot[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inFlight = useRef(false);

  const load = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const { data, error: rpcError } = await supabase.rpc("billing_refresh_paid_assets");
      if (rpcError || !data || !Array.isArray(data.lots)) throw new Error("購入分の有効期限を確認できませんでした。");
      const result = data.lots as PaidAssetLot[];
      if (result.some(lot => typeof lot.item_id !== "string" || !Number.isFinite(lot.quantity)
        || lot.quantity <= 0 || typeof lot.claimed !== "boolean" || !Number.isFinite(Date.parse(lot.expires_at)))) {
        throw new Error("購入分の有効期限を確認できませんでした。");
      }
      setLots([...result].sort((a, b) => Date.parse(a.expires_at) - Date.parse(b.expires_at)));
    } catch {
      setLots(null);
      setError("購入分の有効期限を確認できませんでした。もう一度お試しください。");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  return <section className="shop-paid-expiry" aria-label="購入分の有効期限">
    <OutlawButton variant="secondary" disabled={busy} onClick={() => void load()}>
      {busy ? <span className="shop-btn-spinner" aria-label="確認中" /> : "購入分の有効期限"}
    </OutlawButton>
    {error && <p className="shop-expiry-notice" role="alert">{error}</p>}
    {lots?.length === 0 && <p className="shop-expiry-notice">期限のある未使用の購入分はありません。</p>}
    {lots && lots.length > 0 && <>
      <p className="shop-expiry-notice">未使用の購入分のみ表示しています。日時は日本時間です。</p>
      <ul className="shop-paid-expiry-list">
        {lots.map((lot, index) => <li key={`${lot.item_id}-${lot.expires_at}-${lot.claimed}-${index}`}>
          <div className="shop-card-heading">
            <span>{itemName(lot.item_id)} ×{lot.quantity.toLocaleString("ja-JP")}</span>
            <span className="shop-limit-badge">{lot.claimed ? "受取済み" : "未受取"}</span>
          </div>
          <time dateTime={lot.expires_at}>{new Date(lot.expires_at).toLocaleString("ja-JP", {
            timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit",
            hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false
          })} まで</time>
        </li>)}
      </ul>
    </>}
  </section>;
}
