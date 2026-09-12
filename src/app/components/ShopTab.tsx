"use client";

import React, { useState, useEffect } from "react";
import { useGame } from "../context/GameContext";
import { SHOP_PRODUCTS_MASTER, ShopProduct, ShopProductItem } from "@/utils/shop_master_data";
import "./ShopTab.css";
import SectionHeader from "./ui/SectionHeader";
import SubTabNav from "./ui/SubTabNav";
import OutlawCard from "./ui/OutlawCard";
import OutlawButton from "./ui/OutlawButton";
import BillingHistory from "./BillingHistory";

export default function ShopTab() {
  const [monetizationAvailable, setMonetizationAvailable] = useState(false);
  useEffect(() => {
    let active = true;
    fetch("/api/billing/config", {cache:"no-store"}).then(r => r.json())
      .then(data => { if (active) setMonetizationAvailable(data.available === true); }).catch(() => {});
    return () => { active = false; };
  }, []);
  const {
    shopSubTab,
    setShopSubTab,
    userShopPurchases,
    boughtResultModal,
    setBoughtResultModal,
    handleBuyNormalProduct,
    handleBuyStripeProduct,
    playCyberSe,
    profileLoading,
    upgradeLoading,
    setConfirmDialogConfig
  } = useGame();

  const timeLeftStr = "";
  const isBeginnerAvailable = (userShopPurchases["beginner_pack_01"] || 0) < 1;

  // 商品フィルタリング
  const beginnerProducts = SHOP_PRODUCTS_MASTER.filter(p => p.category === "BEGINNER" && isBeginnerAvailable);
  const vipProducts = SHOP_PRODUCTS_MASTER.filter(p => p.category === "VIP");
  const limitedNProducts = SHOP_PRODUCTS_MASTER.filter(p => p.category === "LIMITED_N" && ((userShopPurchases[p.id] || 0) < (p.purchaseLimit || 999)));
  const diamondProducts = SHOP_PRODUCTS_MASTER.filter(p => p.category === "DIAMOND").sort((a, b) => a.sortOrder - b.sortOrder);
  const normalItemProducts = SHOP_PRODUCTS_MASTER.filter(p => p.shopType === "NORMAL").sort((a, b) => a.sortOrder - b.sortOrder);

  const isLoading = profileLoading || upgradeLoading || !monetizationAvailable;

  // 購入完了モーダルの表示（GameContextのboughtResultModalを監視）
  useEffect(() => {
    if (boughtResultModal) {
      setConfirmDialogConfig({
        isOpen: true,
        title: "購入完了",
        message: (
          <div className="flex flex-col gap-2">
            {boughtResultModal.items.map((it: ShopProductItem, idx: number) => (
              <div key={idx} className="flex justify-between items-center bg-gray-900/50 p-2 rounded">
                <span>{it.itemName}</span>
                <span className="text-gold font-bold">+{it.quantity.toLocaleString()}</span>
              </div>
            ))}
            <p className="mt-4 text-sm text-gray-400">
              獲得したアイテムは<span className="text-gold font-bold mx-1">プレゼントBOX</span>に転送されました。
            </p>
          </div>
        ),
        confirmText: "OK",
        onConfirm: () => {
          setConfirmDialogConfig({ isOpen: false });
          setBoughtResultModal(null);
        },
        onCancel: () => {
          setConfirmDialogConfig({ isOpen: false });
          setBoughtResultModal(null);
        }
      });
    }
  }, [boughtResultModal, setConfirmDialogConfig, setBoughtResultModal]);

  const handleBuyClick = (product: ShopProduct, currencyType: "CASH" | "DIAMOND") => {
    setConfirmDialogConfig({
      isOpen: true,
      title: "購入の確認",
      message: (
        <p>
          {product.title} を
          <span className="font-bold text-gold mx-1">
            {currencyType === "CASH" 
              ? `${product.priceCash?.toLocaleString()} キャッシュ`
              : `${product.priceDiamond?.toLocaleString()} ダイヤ`}
          </span>
          で購入しますか？
        </p>
      ),
      confirmText: "購入する",
      onConfirm: async () => {
        setConfirmDialogConfig({ isOpen: false });
        await handleBuyNormalProduct(product.id, currencyType);
      },
      onCancel: () => {
        setConfirmDialogConfig({ isOpen: false });
      }
    });
  };

  const handleBuyStripeClick = async (productId: string) => {
    await handleBuyStripeProduct(productId);
  };

  return (
    <div className="view-container shop-tab-container">
      <SectionHeader title="ショップ" />
      {monetizationAvailable && <p className="shop-billing-notice">テスト決済環境</p>}
      {monetizationAvailable && <BillingHistory />}

      {/* サブタブ切替 */}
      <SubTabNav
        tabs={[
          { id: "LIMITED", label: monetizationAvailable ? "有償商品" : "有償商品（準備中）", disabled: !monetizationAvailable },
          { id: "NORMAL", label: "通常ショップ" },
        ]}
        activeTabId={shopSubTab}
        onSelect={setShopSubTab}
      />

      <div className="scroll-container flex-1 shop-scroll-body">
        
        {/* ==================================================== */}
        {/* ■ 限定ショップ (Stripe課金)                          */}
        {/* ==================================================== */}
        {shopSubTab === "LIMITED" && (
          <div className="flex-col-gap-3">

            {/* 1. 初心者限定商材 */}
            {beginnerProducts.length > 0 && (
              <div className="shop-section">
                <div className="shop-section-header">
                  <span className="shop-section-title text-gold">初心者限定商材</span>
                  {timeLeftStr && (
                    <span className="shop-timer-badge">
                      残り {timeLeftStr}
                    </span>
                  )}
                </div>

                {beginnerProducts.map(product => (
                  <OutlawCard key={product.id} glowLine="left" className="mb-4">
                    {/* 販促バナー */}
                    {product.bannerUrl && (
                      <div className="shop-banner-wrapper">
                        <img src={product.bannerUrl} alt={product.title} className="shop-banner-img" />
                        <div className="shop-banner-overlay-badge">1回限定パック</div>
                      </div>
                    )}

                    <div className="shop-card-content">
                      <div className="shop-card-title">{product.title}</div>
                      <div className="shop-card-desc">{product.description}</div>

                      {/* 獲得コンテンツ内訳 */}
                      <div className="shop-item-bundle-grid">
                        {product.items.map((it, idx) => (
                          <div key={idx} className="bundle-item-chip">
                            <span className="bundle-item-name">{it.itemName}</span>
                            <span className="bundle-item-qty">x{it.quantity.toLocaleString()}</span>
                          </div>
                        ))}
                      </div>

                      <OutlawButton
                        variant="primary"
                        fullWidth
                        className="mt-4"
                        disabled={isLoading}
                        onClick={() => handleBuyStripeClick(product.id)}
                      >
                        {isLoading ? (
                          <span className="shop-btn-spinner" />
                        ) : (
                          `¥${product.priceJpy?.toLocaleString()} (税抜)`
                        )}
                      </OutlawButton>
                    </div>
                  </OutlawCard>
                ))}
              </div>
            )}

            {/* 2. 限定N回販売商品 (該当商品がある場合のみ描画) */}
            {vipProducts.length > 0 && (
              <div className="shop-section">
                <div className="shop-section-header">
                  <span className="shop-section-title text-gold">VIP PASS</span>
                </div>
                {vipProducts.map(product => (
                  <OutlawCard key={product.id} glowLine="bottom" className="mb-4">
                    <div className="shop-card-content">
                      <div className="shop-card-title">{product.title}</div>
                      <div className="shop-card-desc">{product.description}</div>
                      <OutlawButton variant="primary" fullWidth className="mt-4" disabled={isLoading} onClick={() => handleBuyStripeClick(product.id)}>
                        {isLoading ? <span className="shop-btn-spinner" /> : `¥${product.priceJpy?.toLocaleString()}`}
                      </OutlawButton>
                    </div>
                  </OutlawCard>
                ))}
              </div>
            )}

            {limitedNProducts.length > 0 && (
              <div className="shop-section">
                <div className="shop-section-header">
                  <span className="shop-section-title text-magenta">限定販売商品</span>
                </div>

                {limitedNProducts.map(product => (
                  <OutlawCard key={product.id} glowLine="right" className="mb-4">
                    {product.bannerUrl && (
                      <div className="shop-banner-wrapper">
                        <img src={product.bannerUrl} alt={product.title} className="shop-banner-img" />
                      </div>
                    )}
                    <div className="shop-card-content">
                      <div className="shop-card-title">{product.title}</div>
                      <div className="shop-card-desc">{product.description}</div>
                      <OutlawButton
                        variant="primary"
                        fullWidth
                        className="mt-4"
                        disabled={isLoading}
                        onClick={() => handleBuyStripeClick(product.id)}
                      >
                        {isLoading ? (
                          <span className="shop-btn-spinner" />
                        ) : (
                          `¥${product.priceJpy?.toLocaleString()} (税抜)`
                        )}
                      </OutlawButton>
                    </div>
                  </OutlawCard>
                ))}
              </div>
            )}

            {/* 3. 通常商品 (有償ダイヤ販売) */}
            <div className="shop-section">
              <div className="shop-section-header">
                <span className="shop-section-title text-subtle">通常商品 (ダイヤ購入)</span>
              </div>

              <div className="diamond-products-grid">
                {diamondProducts.map(product => (
                  <OutlawCard key={product.id} glowLine="bottom" className="mb-4">
                    <div className="flex items-center gap-4">
                      <div className="diamond-icon-wrapper shrink-0">
                        <svg className="diamond-svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                          <polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5 12 2" strokeWidth="1.5" />
                          <line x1="12" y1="2" x2="12" y2="22" strokeWidth="1" opacity="0.4" />
                          <line x1="2" y1="8.5" x2="22" y2="8.5" strokeWidth="1" opacity="0.4" />
                        </svg>
                      </div>

                      <div className="flex-1">
                        <div className="shop-card-title">{product.title}</div>
                        <div className="shop-card-desc">{product.description}</div>
                      </div>
                    </div>

                    <OutlawButton
                      variant="secondary"
                      fullWidth
                      className="mt-4"
                      disabled={isLoading}
                      onClick={() => handleBuyStripeClick(product.id)}
                    >
                      {isLoading ? (
                        <span className="shop-btn-spinner" />
                      ) : (
                        `¥${product.priceJpy?.toLocaleString()} (税抜)`
                      )}
                    </OutlawButton>
                  </OutlawCard>
                ))}
              </div>
            </div>

          </div>
        )}

        {/* ==================================================== */}
        {/* ■ 通常ショップ (キャッシュ / ダイヤ消費)             */}
        {/* ==================================================== */}
        {shopSubTab === "NORMAL" && (
          <div className="flex-col-gap-3">
            <div className="shop-section">
              <div className="shop-section-header">
                <span className="shop-section-title text-subtle">消費購入アイテム</span>
              </div>

              <div className="normal-products-grid">
                {normalItemProducts.map(product => (
                  <OutlawCard key={product.id} glowLine="left" className="mb-3">
                    <div className="flex items-center gap-3">
                      <div className="item-icon-box shrink-0">
                        <svg className="item-svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                          <rect x="6" y="3" width="12" height="18" rx="2" strokeWidth="1.5" />
                          <path d="M9 7h6M9 11h6M9 15h4" strokeWidth="1.2" opacity="0.6" />
                        </svg>
                      </div>
                      <div className="flex-1">
                        <div className="shop-card-title">{product.title}</div>
                        <div className="shop-card-desc">{product.description}</div>
                      </div>
                    </div>

                    {/* 購入支払い選択ボタン */}
                    <div className="flex gap-2 mt-4">
                      {product.priceCash !== undefined && (
                        <OutlawButton
                          variant="secondary"
                          className="flex-1"
                          disabled={isLoading}
                          onClick={() => handleBuyClick(product, "CASH")}
                        >
                          <span className="currency-label mr-2">Cash</span>
                          <span className="currency-val">{product.priceCash.toLocaleString()}</span>
                        </OutlawButton>
                      )}

                      {product.priceDiamond !== undefined && (
                        <OutlawButton
                          variant="secondary"
                          className="flex-1 text-neon-cyan"
                          disabled={isLoading}
                          onClick={() => handleBuyClick(product, "DIAMOND")}
                        >
                          <span className="currency-label mr-2 text-white">Dia</span>
                          <span className="currency-val">{product.priceDiamond.toLocaleString()}</span>
                        </OutlawButton>
                      )}
                    </div>
                  </OutlawCard>
                ))}
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
