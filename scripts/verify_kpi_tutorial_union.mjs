import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import ts from 'typescript';
import { unionTutorialCompletions } from '../src/utils/kpiTutorialCompletion.ts';
const require = createRequire(import.meta.url);
const cache = new Map();
function load(file) {
  file=path.resolve(file); if(cache.has(file))return cache.get(file).exports;
  const loadedModule={exports:{}}; cache.set(file,loadedModule);
  const js=ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  new Function('require','module','exports',js)((name)=>name.startsWith('@/')?load('src/'+name.slice(2)+'.ts'):require(name),loadedModule,loadedModule.exports);
  return loadedModule.exports;
}
const api=load('src/app/api/admin/kpi/v2/_shared.ts');
export class FixtureService {
  constructor(tables, failTable=null){this.tables=tables;this.failTable=failTable;}
  from(table){
    let rows=[...(this.tables[table]||[])],from=0,to=Infinity,head=false;
    const q={
      select(_columns,options){head=options?.head;return q;},
      in(key,values){rows=rows.filter(r=>values.includes(r[key]));return q;},
      eq(key,value){rows=rows.filter(r=>r[key]===value);return q;},
      gte(key,value){rows=rows.filter(r=>Date.parse(r[key])>=Date.parse(value));return q;},
      lt(key,value){rows=rows.filter(r=>Date.parse(r[key])<Date.parse(value));return q;},
      lte(key,value){rows=rows.filter(r=>Date.parse(r[key])<=Date.parse(value));return q;},
      order(key){rows.sort((a,b)=>String(a[key]).localeCompare(String(b[key])));return q;},
      limit(value){to=value-1;return q;},range(a,b){from=a;to=b;return q;},
      then:(resolve,reject)=>Promise.resolve({data:head?null:rows.slice(from,Math.min(to+1,from+1000)),count:rows.length,error:table===this.failTable?{message:'source unavailable'}:null}).then(resolve,reject),
    };return q;
  }
}
const range={from:'2026-09-07',to:'2026-09-07',fromAt:'2026-09-07T00:00:00+09:00',toAt:'2026-09-08T00:00:00+09:00',today:'2026-09-10'};
const subjects=Array.from({length:74},(_,i)=>({subject_id:'s'+i,source_user_id:'u'+i,registered_at:'2026-09-07T09:00:00+09:00'}));
const fact=(i,at='2026-09-07T12:00:00+09:00')=>({subject_id:'s'+i,completed_at:at});
function tables(facts,mypage,milestones=[]){return {
 kpi_subjects:subjects,kpi_tutorial_completion_facts:facts,kpi_canonical_tutorial_completions_v1:mypage,
 user_funnel_milestones:milestones,kpi_tutorial_journey_facts:mypage.map(r=>({...r,fact_type:'FIRST_MYPAGE_ACCESS_CONFIRMED',occurred_at:r.completed_at})),
 kpi_daily_user_activity:[{subject_id:'s0',activity_date:'2026-09-08',last_active_at:'2026-09-08T10:00:00+09:00'}],
 kpi_guild_membership_periods:[{id:1,subject_id:'s0',guild_id:'g0',joined_at:'2026-09-07T14:00:00+09:00',left_at:null}],
 kpi_guild_conversion_facts:[{subject_id:'s0',membership_period_id:1,conversion_type:'JOIN',occurred_at:'2026-09-07T14:00:00+09:00'}],
};}
const legacy=subjects.slice(0,38).map((_,i)=>fact(i));
for(const [name,facts,mypage,milestones,expected] of [
 ['legacy38/mypage0',legacy,[],[],38],
 ['legacy38/newMyPage1',legacy,[fact(38)],[],39],
 ['legacy38/overlapMyPage1',legacy,[fact(0,'2026-09-07T15:00:00+09:00')],[],38],
 ['legacy0/mypage1',[],[fact(0)],[],1],
 ['same fact and milestone',[fact(0)],[],[{user_id:'u0',milestone:'tutorial_complete',first_occurred_at:fact(0).completed_at}],1],
 ['milestone-only user',[],[],[{user_id:'u0',milestone:'tutorial_complete',first_occurred_at:fact(0).completed_at}],1],
 ['no completions',[],[],[],0],
]) {
 const service=new FixtureService(tables(facts,mypage,milestones));
 const daily=(await api.dailyOverview(service,range)).rows[0];const summary=await api.tutorial(service,range);
 assert.equal(daily.tutorial.numerator,expected,name);assert.equal(summary.metric.numerator,expected,name+' detail');
 assert.equal(daily.tutorial.denominator,74);assert.equal(summary.metric.denominator,74);
 assert.equal(daily.tutorial.authority,'tutorial_completion_union_v1');
 assert.equal(daily.retention[0].numerator,1,'D1 unchanged');
 if(expected && facts.some(f=>f.subject_id==='s0'))assert.equal(daily.guild.numerator,1,'later MyPage must not move guild eligibility');
 console.log('PASS '+name);
}
const excludedTables=tables(legacy,[fact(0)],[]);excludedTables.kpi_account_classification_periods=[{subject_id:'s0',classification:'qa',valid_from:'2026-09-07T00:00:00+09:00',valid_to:null}];
const excluded=(await api.dailyOverview(new FixtureService(excludedTables),range)).rows[0];assert.equal(excluded.new_users,73);assert.equal(excluded.tutorial.numerator,37);
const overlap=[{subject_id:'s0',source_user_id:'u0'},{subject_id:'sAlias',source_user_id:'u0'}];assert.equal(unionTutorialCompletions(overlap,[fact(0)],[],[{subject_id:'sAlias',completed_at:fact(0).completed_at}]).length,1);
assert.equal(unionTutorialCompletions(subjects,[fact(0)],[],[fact(0,'2026-09-07T15:00:00+09:00')],(_id,at)=>at===fact(0).completed_at)[0].completed_at,'2026-09-07T15:00:00+09:00');
await assert.rejects(()=>api.dailyOverview(new FixtureService(tables(legacy,[]),'user_funnel_milestones'),range));
const large=Array.from({length:1201},(_,i)=>({subject_id:'l'+i,source_user_id:'lu'+i,registered_at:subjects[0].registered_at}));
const many={kpi_subjects:large,kpi_tutorial_completion_facts:large.map(r=>({subject_id:r.subject_id,completed_at:fact(0).completed_at}))};
assert.equal((await api.dailyOverview(new FixtureService(many),range)).rows[0].tutorial.numerator,1201);
const cross=tables([fact(0,'2026-09-06T23:00:00+09:00')],[fact(0)],[]);cross.kpi_subjects=[{...subjects[0],registered_at:'2026-09-06T09:00:00+09:00'}];
assert.equal((await api.postTutorial(new FixtureService(cross),range)).cohort,0,'do not re-cohort on later MyPage');
console.log('PASS exclusion, user dedupe, earliest valid evidence, source error, >1000 rows, period boundary');
// 月次で増えるコホートにもRESTの1000行上限を適用させない。
const manyActivity=large.flatMap(r=>[1,2,3,4,5].map(day=>({subject_id:r.subject_id,activity_date:api.addDays(range.from,day),last_active_at:api.addDays(range.from,day)+'T10:00:00+09:00'})));
const manyGuild=large.map((r,i)=>({id:'mp'+i,subject_id:r.subject_id,guild_id:'g',joined_at:'2026-09-07T14:00:00+09:00',left_at:null}));
const volume={...many,kpi_daily_user_activity:manyActivity,kpi_guild_membership_periods:manyGuild,kpi_guild_conversion_facts:manyGuild.map(r=>({subject_id:r.subject_id,membership_period_id:r.id,conversion_type:'JOIN',occurred_at:r.joined_at})),kpi_guild_chat_activation_facts:manyGuild.map(r=>({subject_id:r.subject_id,membership_period_id:r.id,occurred_at:r.joined_at}))};
const all=(await api.dailyOverview(new FixtureService(volume),{...range,today:'2026-09-20'})).rows[0];
assert.equal(all.guild.numerator,1201); assert.equal(all.chat.numerator,1201);
for(const day of all.retention)assert.equal(day.numerator,1201);
await assert.rejects(()=>api.dailyOverview(new FixtureService(volume,'kpi_daily_user_activity'),range));
console.log('PASS monthly read volume: 1201 Guild/Chat, 6005 activity rows, activity failure is not zero');
