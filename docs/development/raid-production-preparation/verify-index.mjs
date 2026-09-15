import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const base=path.resolve(import.meta.dirname);
const repo=execFileSync('git',['rev-parse','--show-toplevel'],{encoding:'utf8'}).trim();
const sha=x=>createHash('sha256').update(x).digest('hex');
const m=JSON.parse(fs.readFileSync(path.join(base,'audit-a/plan-manifest.json'),'utf8'));
const out=[];
for(const a of m.artifacts){const file=path.relative(repo,path.join(base,'bundle',a.file)).replaceAll('\\','/');const actual=sha(execFileSync('git',['show',':'+file]));if(actual!==a.sha256)throw Error('Git-index bytes changed: '+file);out.push({file,sha256:actual});}
console.log(JSON.stringify({status:'PASS',indexBundle:out},null,2));
