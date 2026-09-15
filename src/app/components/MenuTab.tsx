"use client";
import React from "react";
import { useGame } from "../context/GameContext";
import "./MenuTab.css";

export default function MenuTab() {
  const {
    navigateTab,
    setShowMissionPanel,
    setShowInboxPanel,
    setInboxPanelTab,
    setShowSettingsPanel,
    setShowLoginBonusModal,
    playCyberSe
  } = useGame();

  const MENU_ITEMS = [
    { label: "クエスト", action: () => navigateTab("patrol"), color: "green" },
    { label: "バトル", action: () => navigateTab("pvp"), color: "blue" },
    { label: "レイド", action: () => navigateTab("raid"), color: "orange" },
    { label: "ランキング", action: () => navigateTab("ranking"), color: "silver" },
    { label: "BBS", action: () => navigateTab("bbs"), color: "silver" },
    { label: "所持品", action: () => navigateTab("bag"), color: "silver" },
    { label: "ミッション", action: () => setShowMissionPanel(true), color: "cyan" },
    { label: "プレゼント", action: () => { setShowInboxPanel(true); setInboxPanelTab("presents"); }, color: "magenta" },
    { label: "ログインボーナス", action: () => setShowLoginBonusModal(true), color: "gold" },
    { label: "設定", action: () => setShowSettingsPanel(true), color: "white" },
  ];

  return (
    <div className="menu-tab-view">
      <div className="menu-tab-header">
        <h2 className="menu-tab-title">メニュー</h2>
      </div>
      <div className="menu-tab-grid">
        {MENU_ITEMS.map((item) => (
          <button
            key={item.label}
            className={`menu-tab-item menu-tab-item--${item.color} active-scale-effect`}
            onClick={() => { item.action(); playCyberSe("click"); }}
          >
            <span className="menu-tab-item-label">{item.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
