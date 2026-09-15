import fs from 'node:fs';
const root='docs/development/raid-production-release';
const a=JSON.parse(fs.readFileSync('docs/development/raid-production-preparation/audit-a/catalog.json'));
const b=JSON.parse(fs.readFileSync(root+'/catalog-before.json'))[0].audit;
const key=f=>f.name+'('+f.args+')',am=new Map(a.functions.map(f=>[key(f),f])),bm=new Map(b.functions.map(f=>[key(f),f]));
const changed=b.functions.filter(f=>!am.has(key(f))||f.md5!==am.get(key(f)).md5||JSON.stringify(f.acl)!==JSON.stringify(am.get(key(f)).acl)||f.owner!==am.get(key(f)).owner);
const report={changed:changed.map(f=>({name:f.name,args:f.args,old:am.get(key(f))?.md5,new:f.md5,acl:f.acl,owner:f.owner})),removed:a.functions.filter(f=>!bm.has(key(f))).map(key),newMigrations:b.migrations.filter(x=>!a.migrations.some(y=>y.version===x.version))};
for(const f of changed)fs.writeFileSync(root+'/'+f.name+'.sql',f.definition);
fs.writeFileSync(root+'/drift.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
