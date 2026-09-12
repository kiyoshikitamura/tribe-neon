export interface ShopProductItem {
  itemId: string;
  itemName: string;
  quantity: number;
}

export interface ShopProduct {
  id: string;
  shopType: "LIMITED" | "NORMAL";
  category: "BEGINNER" | "VIP" | "LIMITED_N" | "DIAMOND" | "NORMAL_ITEM";
  title: string;
  description: string;
  priceJpy?: number;        // 日本円（Stripe決済時）
  priceCash?: number;       // キャッシュ価格
  priceDiamond?: number;    // ダイヤ価格
  purchaseLimit?: number;   // 最大購入可能回数（0または未定義は無制限）
  timeLimitHours?: number;  // アカウント作成からの制限時間（時間単位）
  bannerUrl?: string;       // 販促バナー画像パス（差替可能）
  iconUrl?: string;         // アイコン画像パス（差替可能）
  items: ShopProductItem[];
  sortOrder: number;
}

// 2026-09-10確定商品。確率・排出プールはLane Bの判定対象。
const diaProducts = [[300,300],[500,500],[1030,1000],[2080,2000],[5240,5000],[10680,10000]];
const recoveries = [
  ["energy", "ENERGY_DRINK", "エナジードリンク"],
  ["bp", "PVP_POINT_TICKET", "ファイトチケット"],
  ["rp", "RAID_POINT_TICKET", "レイドチケット"],
];
export const SHOP_PRODUCTS_MASTER: ShopProduct[] = [
  {
    id: "beginner_pack_01", shopType: "LIMITED", category: "BEGINNER",
    title: "ビギナーパック", description: "1回限り。育成とスペシャルガチャを始めよう。",
    priceJpy: 100, purchaseLimit: 1, sortOrder: 1,
    bannerUrl: "/banner_beginner_pack.jpg",
    items: [
      {itemId:"CASH",itemName:"CASH",quantity:5000},
      {itemId:"SPECIAL_TICKET_CHARACTER",itemName:"SPキャラクターチケット",quantity:3},
      {itemId:"SPECIAL_TICKET_SKILL",itemName:"SPスキルチケット",quantity:3},
      {itemId:"SPECIAL_TICKET_EQUIPMENT",itemName:"SP装備チケット",quantity:3},
      {itemId:"ENERGY_DRINK",itemName:"エナジードリンク",quantity:5},
    ],
  },
  ...diaProducts.map(([quantity,priceJpy], index): ShopProduct => ({
    id:`diamond_${quantity}`, shopType:"LIMITED", category:"DIAMOND",
    title:`DIA ${quantity.toLocaleString("ja-JP")}個`, description:`DIA ${quantity.toLocaleString("ja-JP")}個をチャージします。`,
    priceJpy, items:[{itemId:"DIAMOND",itemName:"DIA",quantity}], sortOrder:10+index,
  })),
  ...recoveries.flatMap(([key,itemId,itemName], index) => [1,11].map((quantity): ShopProduct => ({
    id:`${key}_${quantity}`,shopType:"NORMAL",category:"NORMAL_ITEM",
    title:`${itemName} ×${quantity}`,description:`${itemName}を${quantity}個購入します。`,
    priceDiamond:quantity===1?50:500, items:[{itemId,itemName,quantity}],sortOrder:100+index*2+(quantity===1?0:1),
  }))),
  ...[[3000,300],[5200,500],[10500,1000],[32000,3000]].map(([quantity,priceDiamond],index): ShopProduct => ({
    id:`cash_${quantity}`,shopType:"NORMAL",category:"NORMAL_ITEM",title:`CASH ${quantity.toLocaleString("ja-JP")}`,
    description:"育成や通常ガチャに使えるCASHです。",priceDiamond,
    items:[{itemId:"CASH",itemName:"CASH",quantity}],sortOrder:110+index,
  })),
];
