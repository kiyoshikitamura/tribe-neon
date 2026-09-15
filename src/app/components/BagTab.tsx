"use client";

import React, { useState, useMemo } from "react";
import { useGame } from "../context/GameContext";
import { canUseEnergyDrink } from "@/domain/gameplay/canonical/action_resources";
import { ITEMS_MASTER_DATA, ItemMaster } from "@/utils/items_master_data";
import CanonicalDialog from "./ui/CanonicalDialog";
import { battleDisplayText } from "@/domain/presentation/battleTerminology";
import "./BagTab.css";

export default function BagTab() {
  const {
    energyDrinks,
    charExpS,
    charExpM,
    charExpL,
    equipExpS,
    equipExpM,
    equipExpL,
    userItems,
    handleUseItem,
    itemUseLoading,
    vitality,
    playCyberSe,
    setConfirmDialogConfig
  } = useGame();

  const [activeCategory, setActiveCategory] = useState<"ALL" | "CONSUMABLE" | "CHAR_EXP" | "EQUIP_EXP" | "AWAKEN_LB">("ALL");
  const [selectedItem, setSelectedItem] = useState<ItemMaster | null>(null);

  // 各アイテムのリアルタイム所持数マッピング
  const itemQuantities: { [key: string]: number } = useMemo(() => ({
    ENERGY_DRINK: energyDrinks || 0,
    CHAR_EXP_S: charExpS || 0,
    CHAR_EXP_M: charExpM || 0,
    CHAR_EXP_L: charExpL || 0,
    EQUIP_EXP_S: equipExpS || 0,
    EQUIP_EXP_M: equipExpM || 0,
    EQUIP_EXP_L: equipExpL || 0,
    ...Object.fromEntries((userItems || []).map((item: { item_id: string; quantity: number }) => [item.item_id, Number(item.quantity || 0)])),
  }), [energyDrinks, charExpS, charExpM, charExpL, equipExpS, equipExpM, equipExpL, userItems]);

  // アイテム一覧のフィルタリング
  const filteredItems = useMemo(() => {
    return ITEMS_MASTER_DATA.filter(item => {
      if (activeCategory === "ALL") return true;
      if (activeCategory === "CONSUMABLE") return item.category === "CONSUMABLE";
      if (activeCategory === "CHAR_EXP") return item.category === "CHAR_EXP";
      if (activeCategory === "EQUIP_EXP") return item.category === "EQUIP_EXP";
      if (activeCategory === "AWAKEN_LB") return item.category === "AWAKEN" || item.category === "LIMIT_BREAK";
      return true;
    });
  }, [activeCategory]);

  const handleItemCardClick = (item: ItemMaster) => {
    playCyberSe("click");
    setSelectedItem(item);
  };

  const handleUseButtonClick = async (item: ItemMaster) => {
    playCyberSe("click");
    const qty = itemQuantities[item.id] || 0;
    if (qty <= 0) {
      setConfirmDialogConfig({ isOpen: true, title: "アイテム使用", message: "このアイテムを所持していません。", confirmText: "OK", cancelText: "", presentation: "canonical", onConfirm: () => setConfirmDialogConfig(null), onCancel: () => setConfirmDialogConfig(null) });
      return;
    }

    if (item.id === "ENERGY_DRINK") {
      if (!canUseEnergyDrink(vitality)) {
        setConfirmDialogConfig({ isOpen: true, title: "使用不可", message: "使用後のスタミナが上限500を超えるため使用できません。", confirmText: "OK", cancelText: "", presentation: "canonical", onConfirm: () => setConfirmDialogConfig(null), onCancel: () => setConfirmDialogConfig(null) });
        return;
      }
      await handleUseItem(item.id);
    } else if (item.id === "PVP_POINT_TICKET" || item.id === "RAID_POINT_TICKET") {
      await handleUseItem(item.id);
    }
  };

  return (
    <div className="bag-tab-view">
      <div className="bag-tab-header">
        <h2 className="bag-tab-title text-color-cyan">所持品</h2>
      </div>

      {/* カテゴリー切り替えタブ */}
      <div className="bag-category-tabs">
        <button
          className={`category-tab-btn active-scale-effect ${activeCategory === "ALL" ? "active" : ""}`}
          onClick={() => { playCyberSe("click"); setActiveCategory("ALL"); }}
        >
          すべて
        </button>
        <button
          className={`category-tab-btn active-scale-effect ${activeCategory === "CONSUMABLE" ? "active" : ""}`}
          onClick={() => { playCyberSe("click"); setActiveCategory("CONSUMABLE"); }}
        >
          回復
        </button>
        <button
          className={`category-tab-btn active-scale-effect ${activeCategory === "CHAR_EXP" ? "active" : ""}`}
          onClick={() => { playCyberSe("click"); setActiveCategory("CHAR_EXP"); }}
        >
          キャラ強化
        </button>
        <button
          className={`category-tab-btn active-scale-effect ${activeCategory === "EQUIP_EXP" ? "active" : ""}`}
          onClick={() => { playCyberSe("click"); setActiveCategory("EQUIP_EXP"); }}
        >
          装備強化
        </button>
        <button
          className={`category-tab-btn active-scale-effect ${activeCategory === "AWAKEN_LB" ? "active" : ""}`}
          onClick={() => { playCyberSe("click"); setActiveCategory("AWAKEN_LB"); }}
        >
          覚醒・突破
        </button>
      </div>

      {/* アイテムグリッド一覧 */}
      <div className="bag-items-container scroll-container">
        {filteredItems.map(item => {
          const qty = itemQuantities[item.id] || 0;
          const isConsumable = item.category === "CONSUMABLE";
          const isEnergyDrinkDisabled = item.id === "ENERGY_DRINK" && (!canUseEnergyDrink(vitality) || qty <= 0);

          return (
            <div
              key={item.id}
              className={`bag-item-card ${qty > 0 ? "has-quantity" : "empty-quantity"}`}
              onClick={() => handleItemCardClick(item)}
            >
              <div className="bag-item-icon-area">
                <img className="item-production-art" src={item.assetPath} alt="" aria-hidden="true" />
              </div>

              <div className="bag-item-info-area">
                <div className="bag-item-meta">
                  <span className="bag-item-name">{item.name}</span>
                </div>
                <p className="bag-item-desc">{battleDisplayText(item.description)}</p>
                <div className="bag-item-action-row">
                  <div className="bag-item-quantity">
                    所持数: <span className="quantity-num">{qty}</span>
                  </div>
                  {isConsumable ? (
                    <button
                      className="item-use-btn active-scale-effect"
                      onClick={(e) => { e.stopPropagation(); handleUseButtonClick(item); }}
                      disabled={isEnergyDrinkDisabled || itemUseLoading}
                    >
                      {itemUseLoading ? "使用中…" : "使用"}
                    </button>
                  ) : (
                    <span className="item-material-label">強化画面で使用</span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* アイテム詳細ダイアログモーダル */}
      {selectedItem && (
        <CanonicalDialog title={selectedItem.name} onClose={itemUseLoading ? undefined : () => setSelectedItem(null)}>
            <div className="recover-modal-body text-center">
              <img className="item-production-art item-production-art--detail" src={selectedItem.assetPath} alt="" aria-hidden="true" />
              <p className="text-gray-300 font-size-8 mb-3">{battleDisplayText(selectedItem.description)}</p>
              <div className="font-size-8 text-cyan-400 font-bold mb-4">
                所持数: {itemQuantities[selectedItem.id] || 0} 個
              </div>
              <div className="flex gap-2">
                {selectedItem.category === "CONSUMABLE" && (
                  <button
                    className="item-use-btn flex-1 py-2 active-scale-effect"
                    onClick={() => {
                      const item = selectedItem;
                      setSelectedItem(null);
                      handleUseButtonClick(item);
                    }}
                    disabled={itemUseLoading || (selectedItem.id === "ENERGY_DRINK" && (!canUseEnergyDrink(vitality) || (itemQuantities[selectedItem.id] || 0) <= 0))}
                  >
                    {itemUseLoading ? "使用中…" : "使用する"}
                  </button>
                )}
                <button
                  className="sub-btn flex-1 py-2 active-scale-effect"
                  onClick={() => setSelectedItem(null)}
                  disabled={itemUseLoading}
                >
                  閉じる
                </button>
              </div>
            </div>
        </CanonicalDialog>
      )}
    </div>
  );
}
