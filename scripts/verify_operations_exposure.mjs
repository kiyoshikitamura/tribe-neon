import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read=(path)=>readFileSync(new URL(`../${path}`,import.meta.url),"utf8");
const page=read("src/app/page.tsx"),home=read("src/app/components/HomeTab.tsx"),homeActions=read("src/domain/presentation/homeActionPresentation.ts"),footer=read("src/app/components/Footer.tsx"),menu=read("src/app/components/MenuTab.tsx"),battle=read("src/hooks/useBattle.ts"),context=read("src/app/context/GameContext.tsx"),nav=read("src/app/context/hooks/useNavigation.ts"),mock=read("src/utils/mock/mockRpc.ts");
assert.ok(!page.includes("<FriendPanel")&&!page.includes("<GvgTab"));
assert.ok(page.includes('activeTab === "shop" && isFeatureOpen("SHOP", featureOperatingStates) && <ShopTab />'));
assert.ok(footer.includes('isFeatureOpen("SHOP", featureOperatingStates)') && footer.includes('upcoming: !shopOpen'));
assert.ok(footer.includes("ショップ")&&footer.includes("準備中")&&!menu.includes("GvG")&&!menu.includes("ショップ"));
assert.ok(home.includes("HOME_ACTION_PRESENTATION_SLOTS")&&homeActions.includes('label: "ギルド"')&&homeActions.includes('destination: "guild"')&&!homeActions.includes('destination: "gvg"'));
assert.ok(!home.includes("フレンド")&&!home.includes("Friend icon"));
assert.ok(!battle.includes('supabase.rpc("get_friend_helper_loadout")')&&!battle.includes("[助っ人]"));
assert.ok(context.includes("selectedBattleHelper: null"));
assert.ok(nav.includes("sanitizeOperationsTab")&&nav.includes("window.history.replaceState"));
for(const key of ["FRIEND","FRIEND_HELPER","SHOP","PAYMENT","GVG","MAINTENANCE"]){assert.ok(mock.includes(`operationState(\"${key}\")`),`mock ${key} gate missing`);}
assert.ok(page.includes("maintenanceEnabled"));
console.log("Operations exposure verification PASS");
