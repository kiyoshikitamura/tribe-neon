import React from "react";
import CanonicalItemIcon from "./CanonicalItemIcon";
import "./RewardReceipt.css";

export interface RewardReceiptItem {
  id?: string;
  name: string;
  quantity: number;
  kind?: "ITEM" | "COSMETIC";
}

interface RewardReceiptProps {
  items: RewardReceiptItem[];
  delivery?: "PRESENT" | "INVENTORY";
  note?: string;
}

export default function RewardReceipt({ items, delivery = "INVENTORY", note }: RewardReceiptProps) {
  return (
    <div className="reward-receipt" data-delivery={delivery}>
      <div className="reward-receipt-list" aria-label="獲得報酬">
        {items.map((item, index) => (
          <div className={`reward-receipt-item ${item.kind === "COSMETIC" ? "is-cosmetic" : ""}`} data-reward-kind={item.kind || "ITEM"} key={`${item.id || item.name}-${index}`}>
            {item.kind === "COSMETIC"
              ? <span className="reward-receipt-cosmetic-mark" aria-hidden="true">装飾</span>
              : <CanonicalItemIcon itemId={item.id} alt="" className="reward-receipt-mark" />}
            <span className="reward-receipt-name">{item.name}</span>
            {item.kind === "COSMETIC" ? null : <strong className="reward-receipt-quantity">× {Number(item.quantity).toLocaleString()}</strong>}
          </div>
        ))}
      </div>
      <p className="reward-receipt-note">
        {note || (delivery === "PRESENT" ? "報酬はプレゼントへ送られました。" : "報酬を受け取りました。")}
      </p>
    </div>
  );
}
