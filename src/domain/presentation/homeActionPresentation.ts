export type HomeActionPresentationId = "guild" | "fight" | "conquest" | "raid";

export type HomeActionPresentationSlot = Readonly<{
  id: HomeActionPresentationId;
  label: string;
  destination: "guild" | "pvp" | "patrol" | "raid";
  assetPath: string;
  deliveryStatus: "EXISTING_FALLBACK" | "PRODUCTION_DELIVERED";
  exposure: "ACTIVE" | "UPCOMING";
}>;

// Existing meaningful artwork is a temporary fallback pending the new icon set.
// Labels and status remain frontend text, independent of the final artwork.
export const HOME_ACTION_PRESENTATION_SLOTS: readonly HomeActionPresentationSlot[] = [
  { id: "conquest", label: "クエスト", destination: "patrol", assetPath: "/menu/home_nav_quest.png", deliveryStatus: "EXISTING_FALLBACK", exposure: "ACTIVE" },
  { id: "fight", label: "バトル", destination: "pvp", assetPath: "/menu/home_nav_pvp.png", deliveryStatus: "EXISTING_FALLBACK", exposure: "ACTIVE" },
  { id: "raid", label: "レイド", destination: "raid", assetPath: "/menu/home_nav_raid.png", deliveryStatus: "EXISTING_FALLBACK", exposure: "ACTIVE" },
  { id: "guild", label: "ギルド", destination: "guild", assetPath: "/menu/home_nav_guild.png", deliveryStatus: "EXISTING_FALLBACK", exposure: "ACTIVE" },
] as const;
