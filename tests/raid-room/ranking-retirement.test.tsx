import React from "react";
import test,{afterEach} from "node:test";
import assert from "node:assert/strict";
import {render,cleanup,waitFor} from "@testing-library/react";
import RankingTab from "../../src/app/components/RankingTab";
import {rankingRewardSections,rankingRewardSectionsFromPayload} from "../../src/domain/ranking/rankingRewardPresentation";
afterEach(cleanup);
const calls:string[]=[];
const nav:string[]=[];
function setup(category="power") {
 calls.length=0; nav.length=0;
 (globalThis as any).__rankingGame={rankingActiveTab:category,currentUser:{username:"fixture",total_power:200000},playCyberSe(){},setRankingActiveTab:(x:string)=>nav.push("category:"+x),setActiveTab:(x:string)=>nav.push("page:"+x)};
 (globalThis as any).__rankingRpc=async(name:string)=>{calls.push(name);return {data:[],error:null};};
}
test("製品ランキングからレイドを撤去し総合力・ギルド・バトルを保持",async()=>{
 setup();render(<RankingTab/>);
 await waitFor(()=>assert(calls.includes("get_public_power_rankings")));
 const tabs=document.querySelector(".ranking-category-nav")!;
 assert.match(tabs.textContent||"",/総合力/);assert.match(tabs.textContent||"",/ギルド/);assert.match(tabs.textContent||"",/バトル/);assert.doesNotMatch(tabs.textContent||"",/レイド/);
 assert(!calls.some(x=>/raid/.test(x)));
});
for(const [category,rpc] of [["guild_power","get_preopen_guild_power_ranking"],["pvp","get_public_pvp_rankings"]])test(category+"の順位取得を保持",async()=>{
 setup(category);render(<RankingTab/>);await waitFor(()=>assert(calls.includes(rpc)));assert(!calls.some(x=>/raid/.test(x)));
});
test("古いレイドカテゴリ入力は順位RPCを呼ばずレイド画面へ戻す",async()=>{
 setup("raid");render(<RankingTab/>);await waitFor(()=>assert(nav.includes("page:raid")));assert(nav.includes("category:power"));assert(!calls.some(x=>/ranking/.test(x)));
});
test("旧レイド順位報酬表示を止め他カテゴリーを保持",()=>{
 for(const period of ["daily","season"] as const){
  assert.deepEqual(rankingRewardSections("raid",period),[]);
  const oldRaid={RAID_PERSONAL:[[1,100,"CASH",1]],RAID_GUILD:[[1,100,"CASH",1]]};
  assert.deepEqual(rankingRewardSectionsFromPayload({daily:oldRaid,progression:oldRaid},"raid",period),[]);
 }
 for(const category of ["power","guild_power","pvp"] as const)assert(rankingRewardSectionsFromPayload({daily:{POWER:[[1,100,"CASH",1]],GUILD_POWER:[[1,100,"CASH",1]],PVP:[[1,100,"CASH",1]]}},category,"daily").length>0);
});
