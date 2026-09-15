"use client";

import React from "react";
import { useGame } from "../context/GameContext";
import { isFeatureOpen } from "@/domain/operations/operations";
import "./Footer.css";

export default function Footer() {
  const {
    activeTab,
    navigateTab,
    playCyberSe,
    dailyFreeGachaFlags,
    dailyFreeGachaReady,
    chatUnreadCounts,
    dmUnreadTotal,
    setChatChannel,
    setDmRecipientId,
    setShowTribeChatPanel,
    featureOperatingStates,
  } = useGame();
  const hasFreeGacha = dailyFreeGachaReady && Object.values(dailyFreeGachaFlags).some(Boolean);
  const communityUnreadCount = Number(chatUnreadCounts?.GUILD || 0) + Number(dmUnreadTotal || 0);
  const shopOpen = isFeatureOpen("SHOP", featureOperatingStates);

  const navItems = [
    { id: "home", label: "マイページ", icon: "/ui/icon_footer_mypage.png" },
    { id: "bbs", label: "コミュニティ", icon: "/ui/icon_community.png" },
    { id: "character", label: "キャラ", icon: "/ui/icon_footer_character.png" },
    { id: "gacha", label: "ガチャ", icon: "/ui/icon_footer_gacha.png" },
    { id: "shop", label: "ショップ", icon: "/ui/icon_footer_shop.png", upcoming: !shopOpen },
  ];

  return (
    <footer className="footer-mobile">
      {navItems.map((item) => {
        const isActive = activeTab === item.id;
        return (
          <button
            key={item.id}
            className={`footer-item active-scale-effect ${isActive ? "active" : ""} ${item.upcoming ? "upcoming" : ""}`}
            disabled={item.upcoming}
            aria-label={item.upcoming ? "ショップは準備中です" : item.label}
            onClick={() => {
              if (item.upcoming) return;
              if (item.id === "bbs") {
                setDmRecipientId(null);
                setChatChannel("GLOBAL");
                setShowTribeChatPanel(true);
                playCyberSe("click");
                return;
              }
              navigateTab(item.id);
              playCyberSe("click");
            }}
          >
            <img src={item.icon} alt={item.label} className="footer-icon" />
            <span className="footer-label">{item.label}</span>
            {item.id === "bbs" && communityUnreadCount > 0 && (
              <span className="footer-unread-badge" aria-label={`コミュニティ未読${communityUnreadCount}件`}>
                {communityUnreadCount > 99 ? "99+" : communityUnreadCount}
              </span>
            )}
            {item.id === "gacha" && hasFreeGacha && <span className="footer-notification-badge" aria-label="無料ガチャあり">FREE</span>}
            {item.upcoming && <span className="footer-upcoming-badge" aria-hidden="true">準備中</span>}
          </button>
        );
      })}
    </footer>
  );
}
