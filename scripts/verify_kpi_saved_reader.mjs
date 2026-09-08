import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import ts from 'typescript';
const require=createRequire(import.meta.url);
const queries=[];let fail=false;
process.env.NEXT_PUBLIC_SUPABASE_URL='https://sufvuqdnqohpfzkwxohq.supabase.co';
const service={from(table){queries.push(table);assert.equal(table,'kpi_overview_saved_results');const q={select(){return q},eq(){return q},gte(){return q},lte(){return q},order(){return Promise.resolve({data:[],error:fail?new Error('read failed'):null})}};return q}};
const m={exports:{}};
const js=ts.transpileModule(readFileSync('src/app/api/admin/kpi/v2/_saved.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
new Function('require','module','exports',js)(name=>name==='next/cache'?{unstable_cache:fn=>fn}:name==='./_shared'?{serviceClient:()=>service}:require(name),m,m.exports);
assert.deepEqual(await m.exports.readSavedOverview('daily','2026-09-01','2026-09-08',process.env.NEXT_PUBLIC_SUPABASE_URL),[]);
fail=true;await assert.rejects(()=>m.exports.readSavedOverview('monthly','2026-01-01','2026-09-01',process.env.NEXT_PUBLIC_SUPABASE_URL));
assert.equal(queries.length,2);
for(const f of ['daily','monthly']){const source=readFileSync('src/app/api/admin/kpi/v2/'+f+'/route.ts','utf8');assert.match(source,/savedOverviewResponse/);assert.doesNotMatch(source,/dailyOverview\(|monthlyRows\(|refresh_kpi/);}
console.log('PASS saved-only reader: one saved-table query, failure cannot invoke raw facts or refresh, both normal routes use saved results');
