import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import ts from 'typescript';

const source=fs.readFileSync('src/app/components/CardBattleView.tsx','utf8');
const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
function render(mode, launching, leader='saved', ready=true) {
  const party=Object.freeze([Object.freeze({id:'first',characterId:'first',name:'FIRST',maxHp:10,stats:{}}),Object.freeze({id:'saved',characterId:'saved',name:'SAVED',maxHp:10,stats:{}})]);
  const context={battleMode:mode,battleState:'SETUP',identityLeaderCharacterId:leader,identityLeaderAuthorityReady:ready,
    playerPartyStates:party,enemyPartyStates:[],battlePresentationContext:{mode,opponentSkills:[]},tactic:'BALANCED',patrolCourses:[]};
  let state=0;
  const react={useState:initial=>[state++===1?launching:initial,()=>{}],useRef:initial=>({current:initial}),useEffect:()=>{}};
  const exports={};
  vm.runInNewContext(code,{exports,require(name){
    if(name==='react')return react;
    if(name==='react/jsx-runtime')return {jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})};
    if(name.endsWith('GameContext'))return {useGame:()=>context};
    if(name.endsWith('game_constants'))return {CHARACTERS_MASTER:[{id:'first',jpName:'FIRST'},{id:'saved',jpName:'SAVED'},{id:'outside',jpName:'OUTSIDE'}]};
    if(name.endsWith('skills_master_data'))return {CANONICAL_SKILL_VIEW:[]};
    return {default:name};
  }});
  const tree=exports.default();
  function find(node) {
    if(!node)return null;
    if(Array.isArray(node)){for(const child of node){const found=find(child);if(found)return found;}return null;}
    if(typeof node.type==='string'&& /BattleMatchupPresentation|StreetBattleSetup/.test(node.type))return node;
    return find(node.props?.children);
  }
  assert.equal(party[0].characterId,'first','render must not reorder combat members');
  return find(tree).props.playerLeader;
}
for(const launching of [false,true]) {
  assert.equal(render('PVP',launching).characterId,'saved','preparation and VS preserve saved identity');
  assert.equal(render('PVP_PRACTICE',launching).characterId,'saved');
  assert.equal(render('PATROL',launching).characterId,'first','quest snapshot representative unchanged');
  assert.equal(render('PVP',launching,'outside').characterId,'outside','public identity remains distinct from combat membership');
  assert.ok(render('PVP',launching,'saved',false)==null,'pending identity must not flash first member');
}
console.log('PASS: PvP preparation/VS saved identity, non-first leader, no array mutation, unknown identity, Quest unchanged');
