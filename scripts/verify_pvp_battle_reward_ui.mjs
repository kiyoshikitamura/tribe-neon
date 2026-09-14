import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const ts=require('typescript'); const React=require('react');
const {renderToStaticMarkup}=require('react-dom/server');
function load(file,stubs={}) {
 const source=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
 const module={exports:{}};
 vm.runInNewContext(source,{module,exports:module.exports,require:id=>id in stubs?stubs[id]:require(id),console});
 return module.exports;
}
const {default:Panel}=load('src/app/components/pvp/PvpBattleRewards.tsx');
const policy={VICTORY:{cash:200,raidTickets:1,diamonds:0,xp:0},DEFEAT:{cash:50,raidTickets:0,diamonds:0,xp:0}};
const html=renderToStaticMarkup(React.createElement(Panel,{rewards:policy}));
assert.match(html,/レイドチケット ×1/); assert.match(html,/200 CASH/);assert.match(html,/50 CASH/);
assert.doesNotMatch(html,/<details|指南書|EXP|3勝/);
assert.doesNotMatch(renderToStaticMarkup(React.createElement(Panel,{rewards:null})),/200 CASH|レイドチケット ×1/);
const nil=()=>null;
const {default:Result}=load('src/app/components/battle/BattleResultSummary.tsx',{
 '@/audio/AudioProvider':{useAudio:()=>({playSe:nil})},
 '@/domain/raidResultPresentation':{raidResultHeadline:()=>''},
 '@/domain/presentation/battleResultScoring':{analyzeBattleResult:()=>({mvp:null,player:{},enemy:{}})},
 '@/domain/gameplay/canonical/items':{canonicalItemName:id=>id},
 '@/utils/game_constants':{CHARACTERS_MASTER:[],getCharacterTransparentImg:()=>''},
 '@/domain/presentation/characterGachaQuotes':{resolveCharacterGachaQuote:()=>''},
 '../raid/RaidResultDetails':{default:nil,__esModule:true},
 '../ui/OutlawButton':{default:({children,onClick})=>React.createElement('button',{onClick},children),__esModule:true},
 '../character/CharacterPresentation':{default:nil,__esModule:true},
 '../ui/CanonicalItemIcon':{default:({itemId})=>React.createElement('i',{'data-item':itemId}),__esModule:true},
 './BattleResultSummary.css':{},'./StreetFlow.css':{},
});
const props={presentationContext:{mode:'PVP'},onContinue:nil,onRaid:nil};
const rewards=[{id:'RAID_POINT_TICKET',name:'レイドチケット',quantity:1},{id:'CASH',name:'CASH',quantity:200}];
const win=renderToStaticMarkup(React.createElement(Result,{...props,victory:true,modeResult:{reward:'レイドチケット GET',rewards}}));
assert.match(win,/battle-result-raid-ticket/);assert.match(win,/レイドに挑戦/);assert.match(win,/×200/);
const loss=renderToStaticMarkup(React.createElement(Result,{...props,victory:false,modeResult:{reward:'50 CASH獲得',rewards:[{id:'CASH',name:'CASH',quantity:50}]}}));
assert.match(loss,/50 CASH獲得/);assert.doesNotMatch(loss,/レイドに挑戦|battle-result-raid-ticket/);
const old=renderToStaticMarkup(React.createElement(Result,{...props,victory:true,modeResult:{rewards:[{id:'CHAR_EXP_S',name:'キャラEXP素材',quantity:1}]}}));
assert.doesNotMatch(old,/レイドに挑戦|battle-result-raid-ticket/);
const top=fs.readFileSync('src/app/components/PvpTab.tsx','utf8');
assert.ok(top.indexOf('<PvpBattleRewards')<top.indexOf('<RivalSelector'));
console.log('PASS: actual TOP/Result SSR, 200/50/ticket, loading no fabricated reward, ticket emphasis, opt-in Raid CTA, loss and historical receipts. Child visuals/audio mocked; not browser E2E.');
