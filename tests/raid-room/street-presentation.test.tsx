import test from 'node:test';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import QuestBattleViewer from '../../src/app/components/battle/QuestBattleViewer';
import BattleResultSummary from '../../src/app/components/battle/BattleResultSummary';
import BattleMatchupPresentation from '../../src/app/components/battle/BattleMatchupPresentation';
import {battlePresentationImpactAt} from '../../src/domain/presentation/battlePresentationUnit';
const context:any={mode:'RAID',raidRoomId:'room',roundLimit:30,opponentLabel:'QAボス'};
const props:any={battleMode:'RAID',street:true,opponentName:'QAボス',playerParty:[],enemyParty:[],timeline:[],timelineIndex:0,round:1,tactic:'BALANCED',speed:2,paused:false,tutorial:false,canSkip:true,onSpeedChange(){},onPauseChange(){},onSkip(){},onSound(){},onRetreat(){}};
test('Room viewer uses FIX Street UI, 30 rounds and skip; legacy retains its viewer',()=>{const room=renderToStaticMarkup(<QuestBattleViewer {...props}/>);assert.match(room,/sb-root/);assert.match(room,/data-configured-round-limit="30"/);assert.match(room,/>SKIP</);const legacy=renderToStaticMarkup(<QuestBattleViewer {...props} street={false}/>);assert.match(legacy,/quest-battle-viewer/);assert.doesNotMatch(legacy,/sb-root/);});
test('Room matchup uses FIX VS presentation',()=>{const s=renderToStaticMarkup(<BattleMatchupPresentation context={context} imageFor={()=>undefined}/>);assert.match(s,/sf-matchup/);assert.match(s,/BATTLE START/);});
test('Room Result retains raw/applied/contribution/HP and Present guidance in Street layout',()=>{const s=renderToStaticMarkup(<BattleResultSummary victory={false} presentationContext={context} modeResult={{stats:[{label:'今回の個人ダメージ',value:'4370'},{label:'共有HPへの反映',value:'1261'},{label:'累計貢献ダメージ',value:'13732'},{label:'ボス残りHP',value:'0'}],reward:'討伐・救援報酬はRoomの「報酬」で確認できます。条件達成時はプレゼントBOXへ届きます。',continueLabel:'レイドへ戻る'}} onContinue={()=>{}}/>);assert.match(s,/sf-live-result/);for(const t of ['4370','1261','13732','ボス残りHP','プレゼントBOX','レイドへ戻る'])assert.ok(s.includes(t));assert.doesNotMatch(s,/再挑戦しましょう/);});
test('Room Street skill recognition minimum is retained at accelerated speeds',()=>{for(const speed of [1,2,3]){assert.ok(battlePresentationImpactAt(speed,'SSR',true)>=1200);assert.ok(battlePresentationImpactAt(speed,'STANDARD',true)>=800);}});


test('Resultは同一Roomの確定receiptだけを表示しMVPとcontinueControlを保持',()=>{
 const shared={victory:false,presentationContext:context,playerParticipants:[{id:'p',characterId:'char_reiji_01',name:'レイジ'}],replayEvents:[{type:'DAMAGE',payload:{actorId:'p',targetId:'e',hpDamage:500}}],onContinue(){},continueControl:<button>既存ack復帰</button>};
 const accepted=renderToStaticMarkup(<BattleResultSummary {...shared} modeResult={{raidReceipt:{roomId:'room',roomState:{status:'available',value:'active'},lateFinalization:false},stats:[{label:'共有HPへの反映',value:'500'}]}}/>);
 assert.match(accepted,/MVP/);assert.match(accepted,/開催中/);assert.match(accepted,/敗北/);assert.match(accepted,/既存ack復帰/);
 const wrong=renderToStaticMarkup(<BattleResultSummary {...shared} modeResult={{raidReceipt:{roomId:'other-room',roomState:{status:'available',value:'cleared'},lateFinalization:true}}}/>);
 assert.match(wrong,/戦況未取得/);assert.doesNotMatch(wrong,/撃破済み|開催終了後の確定です/);assert.match(wrong,/既存ack復帰/);
});

const hitPlayer:any={id:'p',characterId:'char_reiji_01',name:'レイジ',hp:1000,maxHp:1000,alignment:'EVIL',rarity:'SSR'};
const hitEnemy:any={...hitPlayer,id:'e',name:'相手',hp:850,isEnemy:true};
const hitProps:any={...props,battleMode:'PATROL',tutorial:true,canSkip:false,playerParty:[hitPlayer],enemyParty:[hitEnemy],timeline:[{id:'p',name:'レイジ'}],targetLine:{fromId:'p',toId:'e'},actionPresentation:null};
test('旧通知の通常攻撃は同じ対象に命中画像と数字を描画し、非対象には出さない',()=>{
 const s=renderToStaticMarkup(<QuestBattleViewer {...hitProps} damagePopup={{charId:'e',val:150,type:'dmg'}}/>);
 assert.equal((s.match(/class="sb-effect"/g)||[]).length,1);assert.match(s,/street-impact.webp/);assert.match(s,/data-battle-number="damage"[^>]*>−150/);assert.ok(s.indexOf('id="e"')<s.indexOf('class="sb-effect"'));assert.doesNotMatch(s,/>SKIP</);
});
test('旧通知のスキルは予告を先に出し、命中でカットインを退け、クリア時に画像も消す',()=>{
 const cue={charName:'レイジ',skillName:'スキル発動'};
 const cast=renderToStaticMarkup(<QuestBattleViewer {...hitProps} skillCutIn={cue}/>);assert.match(cast,/sb-announcement/);assert.doesNotMatch(cast,/class="sb-effect"/);
 const hit=renderToStaticMarkup(<QuestBattleViewer {...hitProps} skillCutIn={cue} damagePopup={{charId:'e',val:150,type:'dmg'}}/>);assert.match(hit,/class="sb-effect"/);assert.doesNotMatch(hit,/class="sb-announcement/);
 const clear=renderToStaticMarkup(<QuestBattleViewer {...hitProps}/>);assert.doesNotMatch(clear,/class="sb-effect"/);
});
test('回復・シールドは打撃画像にしない',()=>{for(const type of ['heal','shield']){const s=renderToStaticMarkup(<QuestBattleViewer {...hitProps} damagePopup={{charId:'p',val:150,type}}/>);assert.doesNotMatch(s,/street-impact.webp/);assert.match(s,/\+150/);}});
test('通常・RaidのReplayはACTOR/IMPACT/RETURNと対象1件の描画を維持',()=>{for(const battleMode of ['PVP','RAID'])for(const beat of ['ACTOR','IMPACT','RETURN']){const action={unit:{actorId:'p',skillId:'BASIC_ATTACK',replayStartCursor:1,targets:[{targetId:'e',events:[{type:'DAMAGE',index:2,payload:{targetId:'e',amount:150,hpDamage:150,hit:true}}]}]},tier:'NORMAL',beat};const s=renderToStaticMarkup(<QuestBattleViewer {...hitProps} battleMode={battleMode} tutorial={false} canSkip actionPresentation={action} damagePopup={{charId:'e',val:150,type:'dmg'}}/>);assert.equal((s.match(/class="sb-effect /g)||[]).length,beat==='IMPACT'?1:0);assert.match(s,/>SKIP</);assert.equal((s.match(/data-battle-number="damage"/g)||[]).length,beat==='ACTOR'?0:1);}});
