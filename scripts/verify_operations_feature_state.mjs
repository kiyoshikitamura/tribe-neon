import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const master=JSON.parse(readFileSync(new URL("../src/domain/operations/data/operations_feature_state_20260823.json",import.meta.url),"utf8"));
const byKey=new Map(master.features.map((row)=>[row.featureKey,row]));
const open=["HOME","TUTORIAL","CHARACTER","SKILL","EQUIPMENT","FORMATION","BAG","QUEST","PVP","RAID","RANKING","MISSION","GUILD","GUILD_CHAT","PRESENT","NORMAL_GACHA"];
const closed=["INVITE","FRIEND","FRIEND_HELPER","SHOP","PAYMENT","SPECIAL_GACHA","GVG","GUILD_COMBAT_BUFF"];
assert.equal(master.status,"FROZEN");
assert.equal(master.features.length,26);
assert.equal(new Set(master.features.map((row)=>row.featureKey)).size,26);
for(const key of open){const row=byKey.get(key);assert.equal(row?.state,"OPEN",`${key} must be OPEN`);assert.equal(row?.visibility,true);assert.equal(row?.navigationAllowed,true);}
for(const key of closed){const row=byKey.get(key);assert.equal(row?.state,"CLOSED",`${key} must be CLOSED`);assert.equal(row?.mutationAllowed,false);assert.equal(row?.navigationAllowed,false);assert.equal(row?.deepLinkAllowed,false);}
for(const key of ["SHOP","GVG"]){const row=byKey.get(key);assert.equal(row?.uiExposure,"UPCOMING");assert.equal(row?.visibility,false);}
for(const key of closed.filter((key)=>!["SHOP","GVG"].includes(key))){assert.equal(byKey.get(key)?.visibility,false);}
assert.equal(byKey.get("MAINTENANCE")?.state,"CLOSED");
assert.equal(byKey.get("INVITE")?.reasonCode,"PREOPEN_OMIT");
assert.equal(master.maintenance.maintenanceEnabled,false);
console.log("Operations feature state verification PASS");
