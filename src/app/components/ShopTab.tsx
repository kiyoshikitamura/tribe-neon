"use client";

import React, { useState, useEffect } from "react";
import { useGame } from "../context/GameContext";
import { SHOP_PRODUCTS_MASTER, ShopProduct, ShopProductItem, remainingShopPurchases } from "@/utils/shop_master_data";
import "./ShopTab.css";
import SectionHeader from "./ui/SectionHeader";
import SubTabNav from "./ui/SubTabNav";
import OutlawCard from "./ui/OutlawCard";
import OutlawButton from "./ui/OutlawButton";
import BillingHistory from "./BillingHistory";
import PaidAssetExpiry from "./PaidAssetExpiry";

const PACK_EXPIRY_NOTICE = "パックの未使用アイテム・CASHは付与から120日で失効します。プレゼント受取による期限延長はありません。";

function Bundle({ product }: { product: ShopProduct }) {
  return <div className="shop-item-bundle-grid">
    {product.items.map(item => <div key={item.itemId} className="bundle-item-chip">
      <span className="bundle-item-name">{item.itemName}</span>
      <span className="bundle-item-qty">×{item.quantity.toLocaleString("ja-JP")}</span>
    </div>)}
  </div>;
}

export default function ShopTab() {
  const [availability, setAvailability] = useState<"loading" | "available" | "unavailable">("loading");
  const [sandbox, setSandbox] = useState(false);
  const [disabledProductIds, setDisabledProductIds] = useState<string[]>([]);
  useEffect(() => {
    let active = true;
    fetch("/api/billing/config", { cache: "no-store" })
      .then(response => response.ok ? response.json() : Promise.reject())
      .then(data => {
        if (!active) return;
        setAvailability(data.available === true && data.catalogVersion === "20260913" ? "available" : "unavailable");
        setDisabledProductIds(Array.isArray(data.disabledProductIds) ? data.disabledProductIds : []);
        setSandbox(data.mode === "sandbox");
      }).catch(() => { if (active) setAvailability("unavailable"); });
    return () => { active = false; };
  }, []);
  const {
    shopSubTab, setShopSubTab, userShopPurchases, boughtResultModal,
    setBoughtResultModal, handleBuyNormalProduct, handleBuyStripeProduct,
    profileLoading, upgradeLoading, setConfirmDialogConfig
  } = useGame();
  const busy = profileLoading || upgradeLoading;
  const disabled = busy || availability !== "available";
  const packs = SHOP_PRODUCTS_MASTER.filter(p => p.shopType === "LIMITED" && p.category !== "DIAMOND").sort((a,b) => a.sortOrder-b.sortOrder);
  const diamonds = SHOP_PRODUCTS_MASTER.filter(p => p.category === "DIAMOND").sort((a,b) => a.sortOrder-b.sortOrder);
  const normal = SHOP_PRODUCTS_MASTER.filter(p => p.shopType === "NORMAL").sort((a,b) => a.sortOrder-b.sortOrder);

  useEffect(() => {
    if (!boughtResultModal) return;
    const close = () => { setConfirmDialogConfig({ isOpen: false }); setBoughtResultModal(null); };
    setConfirmDialogConfig({
      isOpen: true, title: "購入完了",
      message: <div>
        {boughtResultModal.items.map((item: ShopProductItem) => <div key={item.itemId} className="bundle-item-chip">
          <span>{item.itemName}</span><span>×{item.quantity.toLocaleString("ja-JP")}</span>
        </div>)}
        <p className="shop-card-desc">プレゼントBOXに届きました。</p>
      </div>,
      confirmText: "確認する", onConfirm: close, onCancel: close
    });
  }, [boughtResultModal, setConfirmDialogConfig, setBoughtResultModal]);

  const confirmPurchase = (product: ShopProduct) => {
    if (disabled || disabledProductIds.includes(product.id) || remainingShopPurchases(product, userShopPurchases[product.id] || 0) === 0) return;
    const paid = product.shopType === "LIMITED";
    const isPack = paid && product.category !== "DIAMOND";
    const remaining = remainingShopPurchases(product, userShopPurchases[product.id] || 0);
    setConfirmDialogConfig({
      isOpen: true, title: product.title,
      message: <div>
        <Bundle product={product} />
        <p className="shop-price">{paid ? `¥${product.priceJpy?.toLocaleString("ja-JP")}（税込）` : `${product.priceDiamond?.toLocaleString("ja-JP")} ダイア`}</p>
        {!paid && <p className="shop-expiry-notice">有償ダイアで交換した分は、元の有効期限を引き継ぎます。</p>}
        {remaining !== null && <p className="shop-card-desc">残り{remaining} / {product.purchaseLimit}回</p>}
        {isPack && <p className="shop-expiry-notice">{PACK_EXPIRY_NOTICE}</p>}
        {paid && !isPack && <p className="shop-expiry-notice">有償{product.priceJpy?.toLocaleString("ja-JP")}＋無償{((product.items[0]?.quantity ?? 0)-(product.priceJpy ?? 0)).toLocaleString("ja-JP")} ダイア。有償分は付与から120日、無償分は無期限です。</p>}
      </div>,
      confirmText: paid ? "お支払いへ" : "購入する",
      onConfirm: async () => {
        setConfirmDialogConfig({ isOpen: false });
        if (paid) await handleBuyStripeProduct(product.id);
        else await handleBuyNormalProduct(product.id, "DIAMOND");
      },
      onCancel: () => setConfirmDialogConfig({ isOpen: false })
    });
  };

  const productCard = (product: ShopProduct) => {
    const remaining = remainingShopPurchases(product, userShopPurchases[product.id] || 0);
    const soldOut = remaining === 0;
    return <OutlawCard key={product.id} glowLine="left" className="shop-product-card">
      <div className="shop-card-heading">
        <div className="shop-card-title">{product.title}</div>
        {remaining !== null && <span className="shop-limit-badge">{soldOut ? "購入済み" : `残り${remaining} / ${product.purchaseLimit}回`}</span>}
      </div>
      {product.category === "DIAMOND" && <p className="shop-card-desc">有償{product.priceJpy?.toLocaleString("ja-JP")}＋無償{((product.items[0]?.quantity ?? 0)-(product.priceJpy ?? 0)).toLocaleString("ja-JP")} ダイア</p>}
      {product.category !== "DIAMOND" && product.shopType === "LIMITED" && <Bundle product={product} />}
      <OutlawButton variant="primary" fullWidth className="mt-4"
        disabled={disabled || soldOut || disabledProductIds.includes(product.id)} onClick={() => confirmPurchase(product)}>
        {busy ? <span className="shop-btn-spinner" aria-label="処理中" /> : soldOut ? "購入済み" : disabledProductIds.includes(product.id) ? "準備中" : product.priceJpy !== undefined
          ? `¥${product.priceJpy.toLocaleString("ja-JP")}（税込）`
          : `${product.priceDiamond?.toLocaleString("ja-JP")} ダイア`}
      </OutlawButton>
    </OutlawCard>;
  };

  return <div className="view-container shop-tab-container">
    <SectionHeader title="ショップ" />
    {sandbox && availability === "available" && <p className="shop-billing-notice">テスト決済環境</p>}
    {availability === "available" && <><BillingHistory /><PaidAssetExpiry /></>}
    <SubTabNav tabs={[{id:"LIMITED",label:"パック・ダイア"},{id:"NORMAL",label:"通常ショップ"}]}
      activeTabId={shopSubTab} onSelect={setShopSubTab} />
    {availability === "loading" && <div className="shop-status"><span className="shop-btn-spinner" aria-label="購入情報を確認中" /></div>}
    {availability === "unavailable" && <p className="shop-status">ただいま購入できません。</p>}
    <div className="scroll-container flex-1 shop-scroll-body">
      {shopSubTab === "LIMITED" ? <>
        <section className="shop-section" aria-label="パック">
          {packs.map(productCard)}
          <p className="shop-expiry-notice">{PACK_EXPIRY_NOTICE}</p>
        </section>
        <section className="shop-section" aria-label="ダイア">
          <div className="shop-section-title">ダイア</div>
          {diamonds.map(productCard)}
        </section>
      </> : <section className="shop-section" aria-label="通常ショップ">{normal.map(productCard)}</section>}
    </div>
  </div>;
}
