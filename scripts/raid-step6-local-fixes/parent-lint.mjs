import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {ESLint} from 'eslint';
const git = args => execFileSync('git',args,{encoding:'utf8',maxBuffer:8*1024*1024,stdio:['ignore','pipe','pipe']});
const names = [...new Set([...git(['diff','--name-only','HEAD']).split('\n'),...git(['ls-files','--others','--exclude-standard']).split('\n')])]
  .filter(n => /\.(?:tsx?|mjs)$/.test(n) && (/^(?:src|tests)\//.test(n) || n.startsWith('scripts/raid-step6-local-fixes/') || n==='scripts/verify_initial_equipment_state.mjs'));
const eslint = new ESLint({overrideConfigFile:'eslint.config.mjs'});
const results = [];
for (const file of names) {
  const text = fs.readFileSync(file,'utf8');
  const [current] = await eslint.lintText(text,{filePath:file});
  let before='';
  try {before=git(['show',`648a513038284cfbcb65d3cf3a74ce02872cc9c4:${file}`]);} catch { /* New file. */ }
  const baseline=before ? (await eslint.lintText(before,{filePath:file}))[0] : {messages:[],warningCount:0,errorCount:0};
  // React compiler messages embed shifted line-number codeframes. Compare headline and offending source instead.
  const signature=(message,source)=>JSON.stringify([message.ruleId,message.message.split('\n\n')[0],source.split(/\r?\n/)[message.line-1]?.trim()]);
  const counts=new Map();
  for(const message of baseline.messages){const key=signature(message,before);counts.set(key,(counts.get(key)??0)+1);}
  const added=current.messages.filter(message=>{const key=signature(message,text);if((counts.get(key)??0)>0){counts.set(key,counts.get(key)-1);return false;}return true;});
  results.push({file,errors:current.errorCount,warnings:current.warningCount,baselineWarnings:baseline.warningCount,added});
}
const report={files:results.length,errors:results.reduce((n,r)=>n+r.errors,0),warnings:results.reduce((n,r)=>n+r.warnings,0),baselineWarnings:results.reduce((n,r)=>n+r.baselineWarnings,0),added:results.reduce((n,r)=>n+r.added.length,0),comparison:'rule/message/source-line multiset against 648a513; shifted line numbers ignored',results};
fs.mkdirSync('outputs/raid-step6-local-fixes',{recursive:true});
fs.writeFileSync('outputs/raid-step6-local-fixes/lint.json',JSON.stringify(report,null,2));
console.log(JSON.stringify({...report,results:undefined}));
if(report.errors || report.added) process.exitCode=1;
